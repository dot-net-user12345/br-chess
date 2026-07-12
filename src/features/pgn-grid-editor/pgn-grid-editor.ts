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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { ChessService } from '../../core/chess-service';
import { PgnParseResult } from '../../core/chess-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { NodeId, PgnEntry, PgnGridFileNode } from '../../core/workspace-models';
import { FocusOnInit } from '../../shared/focus-on-init';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { PgnContainer } from '../pgn-container/pgn-container';

/** Validity of a single entry's PGN, used to badge its collapsed panel header. */
type EntryStatus = 'empty' | 'valid' | 'invalid';

/** Editor for a `pgn-grid` file: manages its PGN entries and their board grids. */
@Component({
  selector: 'app-pgn-grid-editor',
  imports: [
    ReactiveFormsModule,
    DragDropModule,
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatMenuModule,
    FocusOnInit,
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

  readonly fileId = input.required<NodeId>();

  protected readonly file = computed<PgnGridFileNode | null>(() => {
    const node = this.store.node(this.fileId());
    return node && node.kind === 'file' && node.fileType === 'pgn-grid' ? node : null;
  });

  protected readonly entries = computed<readonly PgnEntry[]>(
    () => this.file()?.content.entries ?? [],
  );

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
    const items = this.entries();
    const validCount = items.filter((entry) => this.chess.parsePgn(entry.pgn).valid).length;
    return {
      total: items.length,
      valid: validCount,
      allValid: items.length > 0 && validCount === items.length,
    };
  });

  protected onEntryChange(entryId: string, change: { pgn: string; result: PgnParseResult }): void {
    this.writeEntries(
      this.entries().map((entry) =>
        entry.id === entryId ? { ...entry, pgn: change.pgn } : entry,
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

  protected save(): void {
    void this.store.saveFile(this.fileId());
  }

  private writeEntries(entries: PgnEntry[]): void {
    this.store.updatePgnGridContent(this.fileId(), { entries });
  }
}
