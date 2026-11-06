import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { BoardOrientation, GamePosition } from '../../core/chess-models';
import { ChessService } from '../../core/chess-service';
import { moveLabel, SearchLine, searchLines } from '../../core/move-search';
import {
  BoardDiagramFileNode,
  MoveRef,
  MultiStepNotesContent,
  MultiStepNotesFileNode,
  NodeId,
  StepNote,
} from '../../core/workspace-models';
import { EMPTY_BOARD_FEN, WorkspaceStore } from '../../core/workspace-store';
import { ImageAttachments } from '../../shared/image-attachments';
import { LineBoardDialog } from '../board-dialog/line-board-dialog';
import { ChessBoard } from '../chess-board/chess-board';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { FileTitleField } from '../file-title-field/file-title-field';
import { BoardSetup } from '../position-filter-dialog/board-setup';
import { DiagramPickerDialog } from './diagram-picker-dialog';
import { MovePickerDialog } from './move-picker-dialog';

/** A note's picked move, resolved to the line and board it points at. */
interface NoteMove {
  readonly ref: MoveRef;
  /** Null when its file, line or move has since been deleted. */
  readonly line: SearchLine | null;
  readonly position: GamePosition | null;
  readonly caption: string;
}

/** A note, with its diagram and moves resolved for display. */
interface NoteView {
  readonly note: StepNote;
  /** The note's diagram; null when none is picked or it was deleted. */
  readonly diagram: BoardDiagramFileNode | null;
  /** Whether a diagram was picked but no longer exists. */
  readonly diagramMissing: boolean;
  readonly moves: readonly NoteMove[];
}

/**
 * Edits a multi step notes file: a required title, an optional position the
 * notes are about (which Position search finds them by), the lines their moves
 * come from, and the notes themselves — each a board diagram, an explanation,
 * and moves picked from the PGN grid files. Edits stay local until Save.
 */
@Component({
  selector: 'app-multi-step-notes-editor',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    ChessBoard,
    FileTitleField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './multi-step-notes-editor.html',
  styleUrl: './multi-step-notes-editor.scss',
})
export class MultiStepNotesEditor {
  private readonly store = inject(WorkspaceStore);
  private readonly chess = inject(ChessService);
  private readonly dialog = inject(MatDialog);
  private readonly setup = inject(BoardSetup);
  private readonly attachments = inject(ImageAttachments);
  private readonly lineDialog = inject(LineBoardDialog);
  private readonly router = inject(Router);

  readonly fileId = input.required<NodeId>();

  protected readonly file = computed<MultiStepNotesFileNode | null>(() => {
    const node = this.store.node(this.fileId());
    return node && node.kind === 'file' && node.fileType === 'multi-step-notes' ? node : null;
  });

  protected readonly orientation = computed<BoardOrientation>(
    () => this.file()?.content.orientation ?? 'white',
  );

  /** Whether there are edits since the file was opened or last saved. */
  protected readonly dirty = linkedSignal({ source: this.fileId, computation: () => false });

  /** The lines the notes' moves come from, parsed, keyed `fileId:entryId`. */
  private readonly lines = computed(() => {
    const notes = this.file()?.content.notes ?? [];
    const fileIds = new Set(notes.flatMap((note) => note.moves ?? []).map((ref) => ref.fileId));
    const files = this.store.pgnGridFiles().filter((file) => fileIds.has(file.id));
    const lines = searchLines(
      files,
      (id) => this.store.pathOf(id),
      (pgn) => this.chess.parsePgn(pgn),
    );
    return new Map(lines.map((line) => [`${line.fileId}:${line.entryId}`, line]));
  });

  protected readonly notes = computed<NoteView[]>(() => {
    const lines = this.lines();
    return (this.file()?.content.notes ?? []).map((note) => {
      const diagramNode = note.diagramId ? this.store.node(note.diagramId) : null;
      const diagram =
        diagramNode && diagramNode.kind === 'file' && diagramNode.fileType === 'board-diagram'
          ? diagramNode
          : null;
      return {
        note,
        diagram,
        diagramMissing: !!note.diagramId && !diagram,
        moves: (note.moves ?? []).map((ref) => {
          const line = lines.get(`${ref.fileId}:${ref.entryId}`) ?? null;
          const position = line?.positions[ref.ply] ?? null;
          return {
            ref,
            line: position ? line : null,
            position,
            caption: position ? moveLabel(position) : 'Move no longer exists',
          };
        }),
      };
    });
  });

  /** Every line any note's moves come from, once each, in the order first used. */
  protected readonly associatedLines = computed(() => {
    const seen = new Map<string, SearchLine>();
    for (const view of this.notes()) {
      for (const move of view.moves) {
        if (move.line) {
          seen.set(`${move.line.fileId}:${move.line.entryId}`, move.line);
        }
      }
    }
    return [...seen.values()];
  });

  // —— Position ——

  /** Sets up (or changes) the position the notes are about. */
  protected async setUpPosition(): Promise<void> {
    const file = this.file();
    if (!file) {
      return;
    }
    const fen = await this.setup.open(file.content.fen ?? EMPTY_BOARD_FEN, this.orientation());
    if (fen === null) {
      return;
    }
    // An empty board is no position to search by, so it clears it instead.
    this.update(({ fen: _dropped, ...rest }) =>
      fen === EMPTY_BOARD_FEN ? rest : { ...rest, fen },
    );
  }

  protected removePosition(): void {
    this.update(({ fen: _dropped, ...rest }) => rest);
  }

  protected setOrientation(orientation: BoardOrientation): void {
    this.update(({ orientation: _dropped, ...rest }) =>
      orientation === 'white' ? rest : { ...rest, orientation },
    );
  }

  /** Shows a line's file on the Home page. */
  protected openLine(line: SearchLine): void {
    void this.router.navigateByUrl('/').then(() => this.store.reveal(line.fileId));
  }

  // —— Notes ——

  protected addNote(): void {
    this.update((content) => ({
      ...content,
      notes: [...content.notes, { id: crypto.randomUUID() }],
    }));
  }

  /** Removes a note, first confirming when it has anything in it. */
  protected async removeNote(view: NoteView, index: number): Promise<void> {
    const note = view.note;
    if (note.diagramId || note.text?.trim() || note.moves?.length) {
      const data: ConfirmDialogData = {
        title: 'Delete note?',
        message: `Note ${index + 1}, with its diagram, explanation and moves, will be removed.`,
        confirmLabel: 'Delete',
      };
      const confirmed = await firstValueFrom(
        this.dialog.open(ConfirmDialog, { data, autoFocus: 'first-tabbable' }).afterClosed(),
      );
      if (!confirmed) {
        return;
      }
    }
    this.update((content) => ({
      ...content,
      notes: content.notes.filter((n) => n.id !== note.id),
    }));
  }

  /** Swaps a note with the one before (-1) or after (1) it. */
  protected moveNote(index: number, delta: -1 | 1): void {
    this.update((content) => {
      const to = index + delta;
      if (to < 0 || to >= content.notes.length) {
        return content;
      }
      const notes = [...content.notes];
      [notes[index], notes[to]] = [notes[to], notes[index]];
      return { ...content, notes };
    });
  }

  protected setText(noteId: string, text: string): void {
    this.updateNote(noteId, ({ text: _dropped, ...rest }) => (text ? { ...rest, text } : rest));
  }

  // —— Diagrams ——

  protected async pickDiagram(noteId: string): Promise<void> {
    const id = await firstValueFrom(
      this.dialog
        .open<DiagramPickerDialog, unknown, NodeId>(DiagramPickerDialog, {
          width: '56rem',
          maxWidth: '95vw',
          maxHeight: '90vh',
        })
        .afterClosed(),
    );
    if (id) {
      this.updateNote(noteId, (note) => ({ ...note, diagramId: id }));
    }
  }

  protected removeDiagram(noteId: string): void {
    this.updateNote(noteId, ({ diagramId: _dropped, ...rest }) => rest);
  }

  /** Shows a diagram on the Board diagrams page, to edit it. */
  protected openDiagram(id: NodeId): void {
    void this.router.navigateByUrl('/diagrams').then(() => this.store.reveal(id));
  }

  // —— Moves ——

  protected async pickMoves(noteId: string): Promise<void> {
    const refs = await firstValueFrom(
      this.dialog
        .open<MovePickerDialog, unknown, Omit<MoveRef, 'id'>[]>(MovePickerDialog, {
          width: '64rem',
          maxWidth: '95vw',
          maxHeight: '90vh',
        })
        .afterClosed(),
    );
    if (!refs?.length) {
      return;
    }
    this.updateNote(noteId, (note) => ({
      ...note,
      moves: [...(note.moves ?? []), ...refs.map((ref) => ({ ...ref, id: crypto.randomUUID() }))],
    }));
  }

  protected removeMove(noteId: string, moveId: string): void {
    this.updateNote(noteId, ({ moves, ...rest }) => {
      const kept = (moves ?? []).filter((move) => move.id !== moveId);
      return kept.length > 0 ? { ...rest, moves: kept } : rest;
    });
  }

  /** Opens a move in the large view, its line's moves beside the board. */
  protected openMove(move: NoteMove): void {
    if (move.line) {
      this.lineDialog.open(move.line, move.ref.ply, move.line.orientation);
    }
  }

  // —— Saving ——

  protected async save(): Promise<void> {
    // Saving persists to the cloud, so require a signed-in user first.
    if (!(await this.attachments.ensureSignedIn())) {
      return;
    }
    await this.store.saveFile(this.fileId());
    this.dirty.set(false);
  }

  private updateNote(noteId: string, change: (note: StepNote) => StepNote): void {
    this.update((content) => ({
      ...content,
      notes: content.notes.map((note) => (note.id === noteId ? change(note) : note)),
    }));
  }

  private update(change: (content: MultiStepNotesContent) => MultiStepNotesContent): void {
    const file = this.file();
    if (file) {
      this.store.updateMultiStepNotes(file.id, change(file.content));
      this.dirty.set(true);
    }
  }
}
