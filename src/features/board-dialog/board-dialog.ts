import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ChessBoard } from '../chess-board/chess-board';

/** One board position the dialog can display. */
export interface BoardDialogTile {
  readonly fen: string;
  readonly caption: string;
  readonly from: string | null;
  readonly to: string | null;
}

/** Data passed to {@link BoardDialog}: the full sequence of boards and where to start. */
export interface BoardDialogData {
  readonly tiles: readonly BoardDialogTile[];
  readonly index: number;
}

/** A board position shown large in a modal, navigable through the whole game. */
@Component({
  selector: 'app-board-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, ChessBoard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.arrowleft)': 'prev()',
    '(keydown.arrowright)': 'next()',
  },
  template: `
    <div class="board-dialog">
      <div class="board-dialog__bar">
        <button
          matIconButton
          type="button"
          (click)="prev()"
          [disabled]="!hasPrev()"
          aria-label="Previous position"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
        <h2 class="board-dialog__title">{{ current().caption }}</h2>
        <span class="board-dialog__spacer"></span>
        <button
          matIconButton
          type="button"
          (click)="next()"
          [disabled]="!hasNext()"
          aria-label="Next position"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
        <button matIconButton mat-dialog-close type="button" aria-label="Close">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="board-dialog__board">
        <app-chess-board
          [fen]="current().fen"
          [caption]="current().caption"
          [from]="current().from"
          [to]="current().to"
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
      gap: 0.5rem;
      padding: 0 0.25rem;
    }

    .board-dialog__title {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .board-dialog__spacer {
      flex: 1 1 auto;
    }

    .board-dialog__board {
      width: min(98vw, calc(98vh - var(--bar-height)));
      aspect-ratio: 1;
    }
  `,
})
export class BoardDialog {
  private readonly data = inject<BoardDialogData>(MAT_DIALOG_DATA);

  protected readonly index = signal(this.data.index);
  protected readonly current = computed(() => this.data.tiles[this.index()]);
  protected readonly hasPrev = computed(() => this.index() > 0);
  protected readonly hasNext = computed(() => this.index() < this.data.tiles.length - 1);

  protected prev(): void {
    if (this.hasPrev()) {
      this.index.update((i) => i - 1);
    }
  }

  protected next(): void {
    if (this.hasNext()) {
      this.index.update((i) => i + 1);
    }
  }
}
