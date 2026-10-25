import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

/** One half-move of a line: the ply it reaches and how it is written. */
export interface LineMove {
  readonly ply: number;
  readonly san: string;
}

interface LineRow {
  readonly moveNumber: number;
  readonly white: LineMove | null;
  readonly black: LineMove | null;
}

/**
 * A line's moves as numbered rows, White then Black, with the current move
 * marked and kept in view. Interactive, each move is a button that selects it;
 * otherwise the list is plain text, for a preview.
 */
@Component({
  selector: 'app-line-moves',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'line-moves' },
  template: `
    <ol class="line-moves__rows">
      @for (row of rows(); track row.moveNumber) {
        <li class="line-moves__row">
          <span class="line-moves__num" aria-hidden="true">{{ row.moveNumber }}.</span>
          @for (move of [row.white, row.black]; track $index) {
            @if (move) {
              @if (interactive()) {
                <button
                  type="button"
                  class="line-moves__move"
                  [class.line-moves__move--current]="move.ply === currentPly()"
                  [attr.aria-current]="move.ply === currentPly() ? 'step' : null"
                  [attr.aria-label]="label(row.moveNumber, move)"
                  (click)="select.emit(move.ply)"
                >
                  {{ move.san }}
                </button>
              } @else {
                <span
                  class="line-moves__move"
                  [class.line-moves__move--current]="move.ply === currentPly()"
                >
                  {{ move.san }}
                </span>
              }
            } @else {
              <span class="line-moves__move line-moves__move--blank" aria-hidden="true"></span>
            }
          }
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
    }

    .line-moves__rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .line-moves__row {
      display: grid;
      grid-template-columns: 2.25rem 1fr 1fr;
      align-items: center;
      gap: 0.125rem;
    }

    .line-moves__num {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      text-align: right;
      padding-right: 0.25rem;
    }

    .line-moves__move {
      min-width: 0;
      padding: 0.125rem 0.375rem;
      border: 0;
      border-radius: var(--mat-sys-corner-extra-small);
      background: none;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-medium);
      text-align: left;
    }

    button.line-moves__move {
      cursor: pointer;
    }

    button.line-moves__move:hover {
      background: var(--mat-sys-surface-container-highest);
    }

    button.line-moves__move:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -2px;
    }

    .line-moves__move--current,
    button.line-moves__move--current:hover {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font-weight: 700;
    }
  `,
})
export class LineMoves {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly moves = input.required<readonly LineMove[]>();
  /** The ply to mark as current. */
  readonly currentPly = input<number | null>(null);
  /** Whether each move is a button that selects it. */
  readonly interactive = input(false);

  /** Emits the ply of a selected move. */
  readonly select = output<number>();

  protected readonly rows = computed<LineRow[]>(() => {
    const rows: LineRow[] = [];
    for (const move of this.moves()) {
      // Ply 1 is White's first move, ply 2 Black's.
      const moveNumber = Math.ceil(move.ply / 2);
      const white = move.ply % 2 === 1;
      const last = rows.at(-1);
      if (!white && last?.moveNumber === moveNumber && !last.black) {
        rows[rows.length - 1] = { ...last, black: move };
      } else {
        rows.push({ moveNumber, white: white ? move : null, black: white ? null : move });
      }
    }
    return rows;
  });

  constructor() {
    // Keep the current move in sight as it changes, within this list only.
    afterRenderEffect(() => {
      this.currentPly();
      this.moves();
      const current = this.host.nativeElement.querySelector<HTMLElement>(
        '.line-moves__move--current',
      );
      current?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  protected label(moveNumber: number, move: LineMove): string {
    return `${moveNumber}${move.ply % 2 === 1 ? '.' : '…'} ${move.san}`;
  }
}
