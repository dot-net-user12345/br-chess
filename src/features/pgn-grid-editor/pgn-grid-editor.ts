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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { ChessService } from '../../core/chess-service';
import { BoardOrientation, GamePosition, PgnParseResult } from '../../core/chess-models';
import { DuplicateLinePair, WorkspaceStore } from '../../core/workspace-store';
import {
  MiddleGamePlan,
  NodeId,
  PgnEntry,
  PgnGridFileNode,
  UploadedImage,
} from '../../core/workspace-models';
import { COMPARISON_PALETTE } from '../../core/board-assets';
import {
  comparisonIndex,
  deviationPlies,
  divergentPlies,
  firstDeviationPly,
} from '../../core/move-comparison';
import { FocusOnInit } from '../../shared/focus-on-init';
import { ImageAttachments, takeImageFiles } from '../../shared/image-attachments';
import { ChessBoard } from '../chess-board/chess-board';
import {
  ComparisonBoard,
  ComparisonDialog,
  ComparisonDialogItem,
} from '../comparison-dialog/comparison-dialog';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { MoveExplorer, MoveExplorerLine } from '../move-explorer/move-explorer';
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
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTabsModule,
    FocusOnInit,
    ChessBoard,
    PgnContainer,
    MoveExplorer,
  ],
  templateUrl: './pgn-grid-editor.html',
  styleUrl: './pgn-grid-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PgnGridEditor {
  private readonly store = inject(WorkspaceStore);
  private readonly chess = inject(ChessService);
  private readonly dialog = inject(MatDialog);
  private readonly attachments = inject(ImageAttachments);

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

  /** Images the user has attached to this file, in the order they were added. */
  protected readonly uploadedImages = computed<readonly UploadedImage[]>(
    () => this.file()?.content.images ?? [],
  );

  /** Whether the images panel is expanded; closed by default. */
  protected readonly imagesExpanded = signal(false);

  /** True while one or more selected images are being uploaded. */
  protected readonly uploading = signal(false);

  /** Last image-upload error to surface in the panel, or null when clear. */
  protected readonly imageError = signal<string | null>(null);

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
   * One row per line that diverges: the board where that line first departs
   * from its compared neighbor, paired with the move straight after it in the
   * same line. Each row is named after the diverging line.
   */
  protected readonly comparisonRows = computed<ComparisonRow[]>(() => {
    const parsed = this.parsedEntries();
    const entries = this.entries();
    const rows: ComparisonRow[] = [];
    let flatIndex = 0;
    parsed.forEach((result, i) => {
      if (!result.valid) {
        return;
      }
      const reference = parsed[comparisonIndex(i, parsed.length)];
      if (!reference?.valid) {
        return;
      }
      const boards = [...deviationPlies(result.positions, reference.positions)]
        .map((ply) => this.boardAt(result.positions, ply))
        .filter((board): board is ComparisonBoard => board !== null);
      if (boards.length === 0) {
        return;
      }
      // Each comparison gets its own color, cycling through the palette.
      const color = COMPARISON_PALETTE[flatIndex % COMPARISON_PALETTE.length];
      rows.push({
        flatIndex: flatIndex++,
        label: this.labelFor(entries[i], i),
        color,
        boards,
      });
    });
    return rows;
  });

  /** Whether the differences panel is expanded; closed by default. */
  protected readonly differencesExpanded = signal(false);

  /** Whether the cross-file deviations panel is expanded; closed by default. */
  protected readonly fileDifferencesExpanded = signal(false);

  /** This file's first line that parses, or null when it has none. */
  private readonly myFirstLine = computed<readonly GamePosition[] | null>(() => {
    const parsed = this.parsedEntries().find((result) => result.valid);
    return parsed?.valid ? parsed.positions : null;
  });

  /** pgn-grid files directly beside this one in its folder, excluding itself. */
  private readonly siblingFiles = computed<PgnGridFileNode[]>(() => {
    const current = this.file();
    if (!current) {
      return [];
    }
    return this.store
      .childrenOf(current.parentId)
      .filter(
        (node): node is PgnGridFileNode =>
          node.kind === 'file' && node.fileType === 'pgn-grid' && node.id !== current.id,
      );
  });

  /**
   * One row per sibling file: the first move where this file's first line
   * branches from that sibling's first line, showing both files' boards at that
   * move. Siblings with no parsable first line, or that never deviate, are omitted.
   */
  protected readonly fileComparisonRows = computed<ComparisonRow[]>(() => {
    const mine = this.myFirstLine();
    if (!mine) {
      return [];
    }
    const myName = this.file()?.name ?? 'This file';
    const rows: ComparisonRow[] = [];
    let flatIndex = 0;
    for (const sibling of this.siblingFiles()) {
      const theirs = sibling.content.entries
        .map((entry) => this.chess.parsePgn(entry.pgn))
        .find((result) => result.valid);
      if (!theirs?.valid) {
        continue;
      }
      const ply = firstDeviationPly(mine, theirs.positions);
      if (ply === null) {
        continue;
      }
      const boards = [
        this.labeledBoardAt(mine, ply, myName),
        this.labeledBoardAt(theirs.positions, ply, sibling.name),
      ].filter((board): board is ComparisonBoard => board !== null);
      if (boards.length === 0) {
        continue;
      }
      const color = COMPARISON_PALETTE[flatIndex % COMPARISON_PALETTE.length];
      rows.push({ flatIndex: flatIndex++, label: sibling.name, color, boards });
    }
    return rows;
  });

  /** Editable file title. Kept in sync with the selected file's name. */
  protected readonly titleControl = new FormControl('', { nonNullable: true });

  /** Free-text notes for this file. Kept in sync with its content. */
  protected readonly notesControl = new FormControl('', { nonNullable: true });

  /** Whether the notes panel is expanded; closed by default. */
  protected readonly notesExpanded = signal(false);

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
    // Seed notes when a different file is selected, without clobbering a live edit
    // (the value we just wrote back matches, so setValue is skipped).
    effect(() => {
      const notes = this.file()?.content.notes ?? '';
      if (notes !== this.notesControl.value) {
        this.notesControl.setValue(notes, { emitEvent: false });
      }
    });
    this.notesControl.valueChanges.subscribe((notes) => this.writeNotes(notes));
  }

  private writeNotes(notes: string): void {
    // Carry entries and the rest of the content forward so notes edit nothing else.
    this.store.updatePgnGridContent(this.fileId(), {
      ...this.file()?.content,
      entries: this.entries(),
      notes,
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

  /** Replaces one line's focus points; an empty list drops the field entirely. */
  protected onFocusPliesChange(entryId: string, focusPlies: number[]): void {
    this.writeEntries(
      this.entries().map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }
        if (focusPlies.length > 0) {
          return { ...entry, focusPlies };
        }
        const { focusPlies: _dropped, ...rest } = entry;
        return rest;
      }),
    );
  }

  /**
   * Replaces one line's middle game plan. An empty plan drops the field entirely,
   * so lines without one stay as they were before the feature existed.
   */
  protected onPlanChange(entryId: string, plan: MiddleGamePlan): void {
    const empty = plan.notes === undefined && plan.images === undefined;
    this.writeEntries(
      this.entries().map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }
        const { middleGamePlan: _dropped, ...rest } = entry;
        return empty ? rest : { ...rest, middleGamePlan: plan };
      }),
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

  /** True when every line panel is collapsed, so the button offers "Expand all". */
  protected readonly allCollapsed = computed(() => {
    const entries = this.entries();
    const collapsed = this.collapsedIds();
    return entries.length > 0 && entries.every((entry) => collapsed.has(entry.id));
  });

  /** Collapses every line panel, or re-opens them all when none are open. */
  protected toggleAllExpanded(): void {
    this.collapsedIds.set(
      this.allCollapsed() ? new Set() : new Set(this.entries().map((entry) => entry.id)),
    );
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

  /** Which tab is open: 0 = the lines, 1 = the move explorer. */
  protected readonly selectedTab = signal(0);

  /**
   * Lines the move explorer lists, one column each: every entry that parses,
   * with its label and captions.
   */
  protected readonly explorerLines = computed<MoveExplorerLine[]>(() => {
    const entries = this.entries();
    const lines: MoveExplorerLine[] = [];
    this.parsedEntries().forEach((result, index) => {
      if (!result.valid || result.positions.length < 2) {
        return;
      }
      lines.push({
        id: entries[index].id,
        label: this.labelFor(entries[index], index),
        pgn: entries[index].pgn,
        positions: result.positions,
        captions: entries[index].captions ?? {},
        focusPlies: entries[index].focusPlies ?? [],
      });
    });
    return lines;
  });

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

  /** Opens the fullscreen comparison for a cross-file deviation row. */
  protected openFileComparison(row: ComparisonRow): void {
    this.dialog.open(ComparisonDialog, {
      data: {
        items: this.fileComparisonRows(),
        index: row.flatIndex,
        orientation: this.orientation(),
      },
      panelClass: 'comparison-dialog-panel',
      ariaLabel: 'File deviation comparison',
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

  /** Like {@link boardAt}, but prefixes the caption with the owning file's name. */
  private labeledBoardAt(
    positions: readonly GamePosition[],
    ply: number,
    fileName: string,
  ): ComparisonBoard | null {
    const board = this.boardAt(positions, ply);
    return board ? { ...board, caption: `${fileName}: ${board.caption}` } : null;
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
    // Warn if any line duplicates one elsewhere, letting the user back out
    // before creating a duplicate.
    const duplicates = this.store.duplicateLinePairs(this.fileId());
    if (duplicates.length > 0 && !(await this.confirmDuplicates(duplicates))) {
      return;
    }
    // Saving persists to the cloud, so require a signed-in user first.
    if (!(await this.attachments.ensureSignedIn())) {
      return;
    }
    void this.store.saveFile(this.fileId());
  }

  /** Uploads the chosen image files to Storage and attaches them to this file. */
  protected async onImagesSelected(event: Event): Promise<void> {
    const files = takeImageFiles(event);
    if (files.length === 0) {
      return;
    }
    this.imageError.set(null);
    this.uploading.set(true);
    try {
      const uploaded = await this.attachments.upload(files);
      if (uploaded) {
        this.writeImages([...this.uploadedImages(), ...uploaded]);
      }
    } catch (err) {
      this.imageError.set(err instanceof Error ? err.message : 'Uploading the image failed.');
    } finally {
      this.uploading.set(false);
    }
  }

  /** Confirms before detaching an image, since the stored file is also removed. */
  protected async confirmRemoveImage(image: UploadedImage): Promise<void> {
    if (!(await this.attachments.confirmRemove(image, 'this file'))) {
      return;
    }
    this.writeImages(this.uploadedImages().filter((img) => img.id !== image.id));
    this.attachments.detach(image);
  }

  private writeImages(images: readonly UploadedImage[]): void {
    // Carry entries and orientation forward so attaching an image edits nothing else.
    this.store.updatePgnGridContent(this.fileId(), {
      ...this.file()?.content,
      entries: this.entries(),
      images,
    });
  }

  /**
   * Names each pair of identical lines and asks whether to save anyway. Resolves
   * true to proceed; false (or a dismissed dialog) to abort.
   */
  private async confirmDuplicates(pairs: readonly DuplicateLinePair[]): Promise<boolean> {
    const sentences = pairs.map(
      ({ line, match }) =>
        `“${line.label}” from “${line.fileName}” is the same as ` +
        `“${match.label}” from “${match.fileName}”.`,
    );
    const data: ConfirmDialogData = {
      title: pairs.length === 1 ? 'Duplicate line found' : 'Duplicate lines found',
      message: `${sentences.join(' ')} Save anyway?`,
      confirmLabel: 'Save anyway',
      cancelLabel: 'Cancel',
    };
    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialog, { data, autoFocus: 'first-tabbable' }).afterClosed(),
    );
    return confirmed === true;
  }

  private writeEntries(entries: PgnEntry[]): void {
    // Carry the file's orientation forward so an entry edit never resets it.
    this.store.updatePgnGridContent(this.fileId(), { ...this.file()?.content, entries });
  }
}
