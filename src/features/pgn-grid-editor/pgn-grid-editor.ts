import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { AuthService } from '../../core/auth-service';
import { ChessService } from '../../core/chess-service';
import { BoardOrientation, GamePosition, PgnParseResult } from '../../core/chess-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { NodeId, PgnEntry, PgnGridFileNode } from '../../core/workspace-models';
import { COMPARISON_PALETTE } from '../../core/board-assets';
import { comparisonIndex, divergentPlies } from '../../core/move-comparison';
import { FocusOnInit } from '../../shared/focus-on-init';
import { ChessBoard } from '../chess-board/chess-board';
import {
  ComparisonBoard,
  ComparisonDialog,
  ComparisonDialogItem,
} from '../comparison-dialog/comparison-dialog';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { LoginDialog } from '../login-dialog/login-dialog';
import { PgnContainer } from '../pgn-container/pgn-container';

/** Validity of a single entry's PGN, used to badge its collapsed panel header. */
type EntryStatus = 'empty' | 'valid' | 'invalid';

/** One PGN line's differing moves, with its index for dialog navigation. */
interface ComparisonRow extends ComparisonDialogItem {
  readonly flatIndex: number;
}

/** Editor for a `pgn-grid` file: manages its PGN entries and their board grids. */
@Component({
  selector: 'app-pgn-grid-editor',
  imports: [
    ReactiveFormsModule,
    DragDropModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatExpansionModule,
    MatIconModule,
    MatMenuModule,
    FocusOnInit,
    ChessBoard,
    PgnContainer,
  ],
  templateUrl: './pgn-grid-editor.html',
  styleUrl: './pgn-grid-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PgnGridEditor {
  private readonly store = inject(WorkspaceStore);
  private readonly chess = inject(ChessService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly fileId = input.required<NodeId>();

  protected readonly file = computed<PgnGridFileNode | null>(() => {
    const node = this.store.node(this.fileId());
    return node && node.kind === 'file' && node.fileType === 'pgn-grid' ? node : null;
  });

  protected readonly entries = computed<readonly PgnEntry[]>(
    () => this.file()?.content.entries ?? [],
  );

  /** Side every board in this file is viewed from; white unless set to black. */
  protected readonly orientation = computed<BoardOrientation>(
    () => this.file()?.content.orientation ?? 'white',
  );

  /** Each entry's parsed positions, in list order; drives status and comparisons. */
  private readonly parsedEntries = computed(() =>
    this.entries().map((entry) => this.chess.parsePgn(entry.pgn)),
  );

  /**
   * Per entry (by index), the plies whose move diverges from the line it is
   * compared against — the previous entry, or the next one when it is first.
   */
  protected readonly divergentPliesByIndex = computed<ReadonlySet<number>[]>(() => {
    const parsed = this.parsedEntries();
    return parsed.map((result, index) => {
      if (!result.valid) {
        return new Set<number>();
      }
      const reference = parsed[comparisonIndex(index, parsed.length)];
      if (!reference?.valid) {
        return new Set<number>();
      }
      return divergentPlies(result.positions, reference.positions);
    });
  });

  /**
   * One row per line that diverges: that line's own differing-move boards
   * (the first and second moves that differ from its compared neighbor), paired.
   */
  protected readonly comparisonRows = computed<ComparisonRow[]>(() => {
    const parsed = this.parsedEntries();
    const entries = this.entries();
    const divergent = this.divergentPliesByIndex();
    const rows: ComparisonRow[] = [];
    let flatIndex = 0;
    parsed.forEach((result, i) => {
      if (!result.valid) {
        return;
      }
      const boards = [...divergent[i]]
        .map((ply) => this.boardAt(result.positions, ply))
        .filter((board): board is ComparisonBoard => board !== null);
      if (boards.length === 0) {
        return;
      }
      // Each comparison gets its own color, cycling through the palette.
      const color = COMPARISON_PALETTE[flatIndex % COMPARISON_PALETTE.length];
      rows.push({ flatIndex: flatIndex++, label: this.labelFor(entries[i], i), color, boards });
    });
    return rows;
  });

  /** Whether the differences panel is expanded; closed by default. */
  protected readonly differencesExpanded = signal(false);

  /** Editable file title. Kept in sync with the selected file's name. */
  protected readonly titleControl = new FormControl('', { nonNullable: true });

  /** Ids of entries whose panels the user has collapsed; all open by default. */
  private readonly collapsedIds = signal<ReadonlySet<string>>(new Set());

  /** Ids of entries whose title is currently being edited (inline rename). */
  private readonly editingIds = signal<ReadonlySet<string>>(new Set());

  /** Entry the right-click context menu currently targets. */
  private readonly menuTargetId = signal<string | null>(null);

  /** Cursor-anchored trigger for the title right-click menu. */
  private readonly contextTrigger = viewChild<ElementRef<HTMLElement>>('contextTrigger');
  private readonly contextMenu = viewChild(MatMenuTrigger);

  constructor() {
    // Seed the title field, and re-seed when a different file is selected or the
    // name changes elsewhere — but never clobber what the user is mid-edit of.
    effect(() => {
      const name = this.file()?.name ?? '';
      if (name !== this.titleControl.value) {
        this.titleControl.setValue(name, { emitEvent: false });
      }
    });
  }

  protected commitTitle(): void {
    this.store.rename(this.fileId(), this.titleControl.value);
    // Reflect the canonical name: rename ignores empty/duplicate/unchanged input.
    this.titleControl.setValue(this.file()?.name ?? '', { emitEvent: false });
  }

  protected readonly summary = computed(() => {
    const results = this.parsedEntries();
    const validCount = results.filter((result) => result.valid).length;
    return {
      total: results.length,
      valid: validCount,
      allValid: results.length > 0 && validCount === results.length,
    };
  });

  protected onEntryChange(entryId: string, change: { pgn: string; result: PgnParseResult }): void {
    this.writeEntries(
      this.entries().map((entry) =>
        entry.id === entryId ? { ...entry, pgn: change.pgn } : entry,
      ),
    );
  }

  protected onCaptionsChange(entryId: string, captions: Record<number, string>): void {
    this.writeEntries(
      this.entries().map((entry) =>
        entry.id === entryId ? { ...entry, captions } : entry,
      ),
    );
  }

  protected onLabelChange(entryId: string, label: string): void {
    this.writeEntries(
      this.entries().map((entry) =>
        entry.id === entryId ? { ...entry, label } : entry,
      ),
    );
  }

  /** Switches the whole file between the white and black board perspectives. */
  protected setOrientation(orientation: BoardOrientation): void {
    if (orientation === this.orientation()) {
      return;
    }
    this.store.updatePgnGridContent(this.fileId(), {
      ...this.file()?.content,
      entries: this.entries(),
      orientation,
    });
  }

  protected addEntry(): void {
    const id = crypto.randomUUID();
    this.writeEntries([...this.entries(), { id, pgn: '' }]);
    // A freshly created entry opens with its title ready to edit.
    this.editingIds.update((ids) => new Set(ids).add(id));
  }

  protected isEditing(entryId: string): boolean {
    return this.editingIds().has(entryId);
  }

  protected startRename(entryId: string): void {
    this.editingIds.update((ids) => new Set(ids).add(entryId));
  }

  protected commitRename(entryId: string, value: string): void {
    // Guard against a blur that fires after Escape has already cancelled.
    if (!this.editingIds().has(entryId)) {
      return;
    }
    this.onLabelChange(entryId, value.trim());
    this.stopEditing(entryId);
  }

  protected cancelRename(entryId: string): void {
    this.stopEditing(entryId);
  }

  /** Opens the rename menu anchored at the cursor for the right-clicked title. */
  protected onTitleContextMenu(event: MouseEvent, entryId: string): void {
    event.preventDefault();
    this.menuTargetId.set(entryId);
    const trigger = this.contextMenu();
    const el = this.contextTrigger()?.nativeElement;
    if (!trigger || !el) {
      return;
    }
    el.style.left = `${event.clientX}px`;
    el.style.top = `${event.clientY}px`;
    trigger.openMenu();
  }

  protected renameMenuTarget(): void {
    const id = this.menuTargetId();
    if (id) {
      this.startRename(id);
    }
  }

  /** Index of the entry the context menu targets, or -1 if it has gone away. */
  protected menuTargetIndex(): number {
    const id = this.menuTargetId();
    return id ? this.entries().findIndex((entry) => entry.id === id) : -1;
  }

  /** Moves the menu's target entry to `targetIndex` in the list. */
  protected moveMenuTarget(targetIndex: number): void {
    const entries = this.entries();
    const currentIndex = this.menuTargetIndex();
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }
    const reordered = [...entries];
    moveItemInArray(reordered, currentIndex, targetIndex);
    this.writeEntries(reordered);
  }

  protected deleteMenuTarget(): void {
    const index = this.menuTargetIndex();
    if (index === -1) {
      return;
    }
    const entry = this.entries()[index];
    this.confirmRemove(entry.id, this.labelFor(entry, index));
  }

  private stopEditing(entryId: string): void {
    this.editingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(entryId);
      return next;
    });
  }

  /** Confirms with the user before removing the entry, since deletion is local-only. */
  protected confirmRemove(entryId: string, label: string): void {
    const data: ConfirmDialogData = {
      title: 'Delete line?',
      message: `“${label}” and its board preview will be removed.`,
      confirmLabel: 'Delete',
    };
    this.dialog
      .open(ConfirmDialog, { data, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.removeEntry(entryId);
        }
      });
  }

  protected removeEntry(entryId: string): void {
    this.writeEntries(this.entries().filter((entry) => entry.id !== entryId));
  }

  /** Reorders entries when a panel is dropped in its new position. */
  protected onReorder(event: CdkDragDrop<readonly PgnEntry[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const reordered = [...this.entries()];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    this.writeEntries(reordered);
  }

  /** Display label for an entry's collapsed panel header. */
  protected labelFor(entry: PgnEntry, index: number): string {
    return entry.label || `Line ${index + 1}`;
  }

  /** Validity badge shown in a collapsed panel header. */
  protected statusOf(entry: PgnEntry): EntryStatus {
    if (entry.pgn.trim().length === 0) {
      return 'empty';
    }
    return this.chess.parsePgn(entry.pgn).valid ? 'valid' : 'invalid';
  }

  protected isExpanded(entryId: string): boolean {
    return !this.collapsedIds().has(entryId);
  }

  protected setExpanded(entryId: string, expanded: boolean): void {
    this.collapsedIds.update((ids) => {
      const next = new Set(ids);
      if (expanded) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  /** Opens the fullscreen comparison, starting at the clicked differing move. */
  protected openComparison(row: ComparisonRow): void {
    this.dialog.open(ComparisonDialog, {
      data: { items: this.comparisonRows(), index: row.flatIndex, orientation: this.orientation() },
      panelClass: 'comparison-dialog-panel',
      ariaLabel: 'Move comparison',
      maxWidth: '98vw',
      maxHeight: '98vh',
      autoFocus: 'dialog',
    });
  }

  private boardAt(positions: readonly GamePosition[], ply: number): ComparisonBoard | null {
    const position = positions[ply];
    if (!position) {
      return null;
    }
    return { fen: position.fen, caption: this.caption(position), from: position.from, to: position.to };
  }

  private caption(position: GamePosition): string {
    if (position.ply === 0 || position.san === null) {
      return 'Start';
    }
    return position.color === 'white'
      ? `${position.moveNumber}. ${position.san}`
      : `${position.moveNumber}… ${position.san}`;
  }

  protected async save(): Promise<void> {
    // Saving persists to the cloud, so require a signed-in user first.
    if (!this.auth.isSignedIn()) {
      const user = await firstValueFrom(
        this.dialog.open(LoginDialog, { autoFocus: 'dialog' }).afterClosed(),
      );
      if (!user) {
        return;
      }
    }
    void this.store.saveFile(this.fileId());
  }

  private writeEntries(entries: PgnEntry[]): void {
    // Carry the file's orientation forward so an entry edit never resets it.
    this.store.updatePgnGridContent(this.fileId(), { ...this.file()?.content, entries });
  }
}
