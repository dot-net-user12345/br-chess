import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BoardOrientation, GamePosition } from '../../core/chess-models';
import { ChessBoard } from '../chess-board/chess-board';

/** One line the explorer lists as a column of clickable moves. */
export interface MoveExplorerLine {
  readonly label: string;
  /** Every position from the start through the final move. */
  readonly positions: readonly GamePosition[];
  /** The line's user-written captions, keyed by ply. */
  readonly captions: Readonly<Record<number, string>>;
}

/** One clickable half-move in a line's column. */
interface MoveCell {
  /** Identifies the move across every line: `lineIndex:ply`. */
  readonly key: string;
  readonly san: string;
  /** Screen-reader name, which needs the owning line to be unambiguous. */
  readonly ariaLabel: string;
  /** The line's caption for this move, surfaced as a tooltip when set. */
  readonly caption: string;
}

/** One full move of a line: its number, and White's and Black's half-moves. */
interface MoveRow {
  readonly moveNumber: number;
  readonly white: MoveCell | null;
  readonly black: MoveCell | null;
}

interface LineColumn {
  readonly label: string;
  readonly rows: readonly MoveRow[];
}

/** A board pinned to the bottom strip: the whole game up to and including one move. */
interface PinnedBoard {
  readonly key: string;
  readonly fen: string;
  readonly from: string | null;
  readonly to: string | null;
  /** `5… O-O` — the move itself; the group it sits in names the line. */
  readonly move: string;
  /** Screen-reader name, which needs the owning line to be unambiguous. */
  readonly ariaLabel: string;
}

/** One line's pinned boards, shown together under the line's own title. */
interface PinnedGroup {
  /** The line's position in the file, which identifies it even if two share a label. */
  readonly lineIndex: number;
  readonly label: string;
  readonly boards: readonly PinnedBoard[];
}

/**
 * Every line of a file as side-by-side columns of clickable moves, with the
 * boards for the moves that have been clicked pinned to a strip underneath.
 * Clicking a move toggles its board in and out of that strip.
 */
@Component({
  selector: 'app-move-explorer',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, ChessBoard],
  host: { class: 'move-explorer' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './move-explorer.html',
  styleUrl: './move-explorer.scss',
})
export class MoveExplorer {
  /** The file's lines, one column each. */
  readonly lines = input.required<readonly MoveExplorerLine[]>();
  /** Side to view every board from; `black` rotates each board 180°. */
  readonly orientation = input<BoardOrientation>('white');

  private readonly injector = inject(Injector);

  /** The pinned-board strip, scrolled to keep a freshly pinned board in view. */
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  /** Keys of the pinned moves, in the order they were clicked. */
  private readonly pinnedKeys = signal<readonly string[]>([]);

  /** One column per line, its moves grouped into numbered rows. */
  protected readonly columns = computed<LineColumn[]>(() =>
    this.lines().map((line, lineIndex) => {
      const rows: MoveRow[] = [];
      for (const position of line.positions) {
        if (position.ply === 0 || position.san === null) {
          continue;
        }
        const move = moveLabel(position);
        const cell: MoveCell = {
          key: `${lineIndex}:${position.ply}`,
          san: position.san,
          ariaLabel: `${line.label}, ${move}`,
          caption: line.captions[position.ply] ?? '',
        };
        const row = rows.at(-1);
        if (position.color === 'black' && row?.moveNumber === position.moveNumber && !row.black) {
          rows[rows.length - 1] = { ...row, black: cell };
        } else {
          rows.push({
            moveNumber: position.moveNumber,
            white: position.color === 'white' ? cell : null,
            black: position.color === 'black' ? cell : null,
          });
        }
      }
      return { label: line.label, rows };
    }),
  );

  /**
   * The pinned boards, grouped by the line they come from: one group per line
   * that has any, in the file's line order, each holding that line's pinned
   * boards in move order.
   */
  protected readonly pinnedGroups = computed<PinnedGroup[]>(() => {
    const keys = new Set(this.pinnedKeys());
    const groups: PinnedGroup[] = [];
    this.lines().forEach((line, lineIndex) => {
      const boards: PinnedBoard[] = [];
      for (const position of line.positions) {
        const key = `${lineIndex}:${position.ply}`;
        if (position.ply === 0 || position.san === null || !keys.has(key)) {
          continue;
        }
        const move = moveLabel(position);
        boards.push({
          key,
          fen: position.fen,
          from: position.from,
          to: position.to,
          move,
          ariaLabel: `${line.label}, ${move}`,
        });
      }
      if (boards.length > 0) {
        groups.push({ lineIndex, label: line.label, boards });
      }
    });
    return groups;
  });

  /** Whether anything is pinned, which is what the strip and Clear button key off. */
  protected readonly hasPinned = computed(() => this.pinnedGroups().length > 0);

  protected isPinned(key: string): boolean {
    return this.pinnedKeys().includes(key);
  }

  /** Adds the move's board to the strip, or removes it when already pinned. */
  protected toggle(key: string): void {
    const pinning = !this.isPinned(key);
    this.pinnedKeys.update((keys) =>
      keys.includes(key) ? keys.filter((pinned) => pinned !== key) : [...keys, key],
    );
    if (pinning) {
      // The board joins its line's group, which can sit past the right edge of a
      // full strip. Bring it into view once it has been rendered.
      afterNextRender(
        () =>
          this.strip()
            ?.nativeElement.querySelector(`[data-key="${key}"]`)
            ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }),
        { injector: this.injector },
      );
    }
  }

  protected clear(): void {
    this.pinnedKeys.set([]);
  }
}

/** `5. Qd2` for White, `5… O-O` for Black — how the app captions a move. */
function moveLabel(position: GamePosition): string {
  return position.color === 'white'
    ? `${position.moveNumber}. ${position.san}`
    : `${position.moveNumber}… ${position.san}`;
}
