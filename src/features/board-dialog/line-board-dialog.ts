import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BoardOrientation } from '../../core/chess-models';
import { moveLabel, SearchLine } from '../../core/move-search';
import { BoardDrawing, PgnEntry, UploadedImage } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { ImageAttachments } from '../../shared/image-attachments';
import { BoardDialog, BoardDialogTile } from './board-dialog';

/**
 * Opens one move of a line in the large view, the line's moves beside the
 * board. Captions, focus points, images and drawings made there are written
 * back to the line's file and saved.
 */
@Injectable({ providedIn: 'root' })
export class LineBoardDialog {
  private readonly dialog = inject(MatDialog);
  private readonly store = inject(WorkspaceStore);
  private readonly attachments = inject(ImageAttachments);

  open(line: SearchLine, ply: number, orientation: BoardOrientation): void {
    const entry = line.entry;
    const tiles: BoardDialogTile[] = line.positions.map((position) => ({
      ply: position.ply,
      fen: position.fen,
      caption: moveLabel(position),
      san: position.san,
      from: position.from,
      to: position.to,
    }));
    this.dialog.open(BoardDialog, {
      data: {
        tiles,
        // Positions run from the starting board, so a ply is its own tile index.
        index: ply,
        line: { label: line.title },
        orientation,
        captions: entry.captions ?? {},
        onCaptionChange: (captions: Record<number, string>) =>
          this.updateEntry(line, (e) => ({ ...e, captions })),
        focusPlies: entry.focusPlies ?? [],
        onFocusChange: (focusPlies: number[]) =>
          this.updateEntry(line, ({ focusPlies: _dropped, ...rest }) =>
            focusPlies.length > 0 ? { ...rest, focusPlies } : rest,
          ),
        moveImages: entry.moveImages ?? {},
        onMoveImagesChange: (moveImages: Record<number, readonly UploadedImage[]>) =>
          this.updateEntry(line, ({ moveImages: _dropped, ...rest }) =>
            Object.keys(moveImages).length > 0 ? { ...rest, moveImages } : rest,
          ),
        drawings: entry.drawings ?? {},
        onDrawingsChange: (drawings: Record<number, BoardDrawing>) =>
          this.updateEntry(line, ({ drawings: _dropped, ...rest }) =>
            Object.keys(drawings).length > 0 ? { ...rest, drawings } : rest,
          ),
      },
      panelClass: 'board-dialog-panel',
      ariaLabel: 'Board preview',
      maxWidth: '98vw',
      maxHeight: '98vh',
      autoFocus: 'dialog',
    });
  }

  /** Writes an edit made in the large view back to its line's file, and saves the file. */
  private async updateEntry(
    line: SearchLine,
    update: (entry: PgnEntry) => PgnEntry,
  ): Promise<void> {
    const file = this.store.node(line.fileId);
    if (!file || file.kind !== 'file' || file.fileType !== 'pgn-grid') {
      return;
    }
    this.store.updatePgnGridContent(file.id, {
      ...file.content,
      entries: file.content.entries.map((entry) =>
        entry.id === line.entryId ? update(entry) : entry,
      ),
    });
    if (await this.attachments.ensureSignedIn()) {
      await this.store.saveFile(file.id);
    }
  }
}
