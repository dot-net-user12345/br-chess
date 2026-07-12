import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ChessBoard } from '../chess-board/chess-board';

/** One differing-move board from a PGN line. */
export interface ComparisonBoard {
  readonly fen: string;
  readonly caption: string;
  readonly from: string | null;
  readonly to: string | null;
}

/** A single PGN line's differing moves, shown together. */
export interface ComparisonDialogItem {
  readonly label: string;
  readonly boards: readonly ComparisonBoard[];
}

export interface ComparisonDialogData {
  readonly items: readonly ComparisonDialogItem[];
  readonly index: number;
}

/** Shows one line's differing moves side by side, navigable through every line. */
@Component({
  selector: 'app-comparison-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, ChessBoard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.arrowleft)': 'prev()',
    '(keydown.arrowright)': 'next()',
    '(keydown.home)': 'first()',
    '(keydown.end)': 'last()',
  },
  template: `
    <div class="cmp">
      <div class="cmp__bar">
        <button
          matIconButton
          type="button"
          (click)="first()"
          [disabled]="!hasPrev()"
          aria-label="First line"
        >
          <mat-icon>first_page</mat-icon>
        </button>
        <button
          matIconButton
          type="button"
          (click)="prev()"
          [disabled]="!hasPrev()"
          aria-label="Previous line"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
        <h2 class="cmp__title">
          {{ current().label }} · {{ index() + 1 }} of {{ data.items.length }}
        </h2>
        <span class="cmp__spacer"></span>
        <button
          matIconButton
          type="button"
          (click)="next()"
          [disabled]="!hasNext()"
          aria-label="Next line"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
        <button
          matIconButton
          type="button"
          (click)="last()"
          [disabled]="!hasNext()"
          aria-label="Last line"
        >
          <mat-icon>last_page</mat-icon>
        </button>
        <button matIconButton mat-dialog-close type="button" aria-label="Close">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="cmp__boards">
        @for (board of current().boards; track $index) {
          <figure class="cmp__side">
            <app-chess-board
              [fen]="board.fen"
              [caption]="board.caption"
              [from]="board.from"
              [to]="board.to"
              [highlighted]="true"
            />
            <p class="cmp__move">{{ board.caption }}</p>
          </figure>
        }
      </div>
    </div>
  `,
  styles: `
    .cmp {
      --bar-height: 3.25rem;
      display: flex;
      flex-direction: column;
    }

    .cmp__bar {
      flex: 0 0 var(--bar-height);
      box-sizing: border-box;
      height: var(--bar-height);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.25rem;
    }

    .cmp__title {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cmp__spacer {
      flex: 1 1 auto;
    }

    .cmp__boards {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1rem;
      padding: 0 0.75rem 0.5rem;
    }

    .cmp__side {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      flex: 1 1 0;
      min-width: 0;
      width: min(44vw, calc(84vh - var(--bar-height)));
    }

    .cmp__move {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    @media (max-width: 34rem) {
      .cmp__side {
        width: min(88vw, calc((84vh - var(--bar-height)) / 2));
      }
    }
  `,
})
export class ComparisonDialog {
  protected readonly data = inject<ComparisonDialogData>(MAT_DIALOG_DATA);

  protected readonly index = signal(this.data.index);
  protected readonly current = computed(() => this.data.items[this.index()]);
  protected readonly hasPrev = computed(() => this.index() > 0);
  protected readonly hasNext = computed(() => this.index() < this.data.items.length - 1);

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

  protected first(): void {
    this.index.set(0);
  }

  protected last(): void {
    this.index.set(this.data.items.length - 1);
  }
}
