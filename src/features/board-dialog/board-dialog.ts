import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ChessBoard } from '../chess-board/chess-board';

/** Data passed to {@link BoardDialog}: everything needed to render one board large. */
export interface BoardDialogData {
  readonly fen: string;
  readonly caption: string;
  readonly from: string | null;
  readonly to: string | null;
}

/** A single board position shown large in a modal, opened from a grid preview. */
@Component({
  selector: 'app-board-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, ChessBoard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board-dialog">
      <div class="board-dialog__bar">
        <h2 class="board-dialog__title">{{ data.caption }}</h2>
        <button matIconButton mat-dialog-close type="button" aria-label="Close">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="board-dialog__board">
        <app-chess-board
          [fen]="data.fen"
          [caption]="data.caption"
          [from]="data.from"
          [to]="data.to"
        />
      </div>
    </div>
  `,
  styles: `
    .board-dialog {
      /* Fixed-height title bar; the square board fills the rest of the dialog,
         and bar + board together stay within 98% of the smaller viewport side. */
      --bar-height: 3.25rem;
      display: flex;
      flex-direction: column;
    }

    .board-dialog__bar {
      flex: 0 0 var(--bar-height);
      box-sizing: border-box;
      height: var(--bar-height);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0 0.25rem 0 0.75rem;
    }

    .board-dialog__title {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .board-dialog__board {
      width: min(98vw, calc(98vh - var(--bar-height)));
      aspect-ratio: 1;
    }
  `,
})
export class BoardDialog {
  protected readonly data = inject<BoardDialogData>(MAT_DIALOG_DATA);
}
