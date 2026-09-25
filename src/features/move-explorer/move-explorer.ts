import { Clipboard } from '@angular/cdk/clipboard';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BoardOrientation, GamePosition } from '../../core/chess-models';
import { BoardDialog, BoardDialogTile } from '../board-dialog/board-dialog';
import { ChessBoard } from '../chess-board/chess-board';

/** One line the explorer lists as a column of clickable moves. */
export interface MoveExplorerLine {
  /** The owning entry's id, so caption edits can be written back to it. */
  readonly id: string;
  readonly label: string;
  /** The line's PGN as written, which the column's copy button puts on the clipboard. */
  readonly pgn: string;
  /** Every position from the start through the final move. */
  readonly positions: readonly GamePosition[];
  /** The line's user-written captions, keyed by ply. */
  readonly captions: Readonly<Record<number, string>>;
  /** Plies marked as focus points, outlined in red in the column. */
  readonly focusPlies: readonly number[];
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
  /** Whether the move is marked as a focus point. */
  readonly focus: boolean;
}

/** One full move of a line: its number, and White's and Black's half-moves. */
interface MoveRow {
  readonly moveNumber: number;
  readonly white: MoveCell | null;
  readonly black: MoveCell | null;
}

interface LineColumn {
  readonly label: string;
  readonly pgn: string;
  readonly rows: readonly MoveRow[];
}

/** A board pinned to the bottom strip: the whole game up to and including one move. */
interface PinnedBoard {
  readonly key: string;
  readonly fen: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly ply: number;
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
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, ChessBoard],
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

  /** Emits a line's full updated caption map when one is saved from the large view. */
  readonly captionsChange = output<{ id: string; captions: Record<number, string> }>();
  /** Emits a line's full updated focus-point list when one is toggled from the large view. */
  readonly focusPliesChange = output<{ id: string; focusPlies: number[] }>();

  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly clipboard = inject(Clipboard);

  /** The pinned-board strip, scrolled to keep a freshly pinned board in view. */
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  /** Cursor-anchored trigger for the move right-click menu. */
  private readonly contextTrigger = viewChild<ElementRef<HTMLElement>>('contextTrigger');
  private readonly contextMenu = viewChild(MatMenuTrigger);

  /** The move the right-click menu currently targets. */
  private readonly menuTarget = signal<{ lineIndex: number; ply: number } | null>(null);

  /** Keys of the pinned moves, in the order they were clicked. */
  private readonly pinnedKeys = signal<readonly string[]>([]);

  /** The column whose PGN was just copied, to confirm it on that button; cleared after a moment. */
  protected readonly copiedIndex = signal<number | null>(null);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  /** One column per line, its moves grouped into numbered rows. */
  protected readonly columns = computed<LineColumn[]>(() =>
    this.lines().map((line, lineIndex) => {
      const rows: MoveRow[] = [];
      for (const position of line.positions) {
        if (position.ply === 0 || position.san === null) {
          continue;
        }
        const move = moveLabel(position);
        const focus = line.focusPlies.includes(position.ply);
        const cell: MoveCell = {
          key: `${lineIndex}:${position.ply}`,
          san: position.san,
          ariaLabel: `${line.label}, ${move}${focus ? ', focus point' : ''}`,
          caption: line.captions[position.ply] ?? '',
          focus,
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
      return { label: line.label, pgn: line.pgn, rows };
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
          ply: position.ply,
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

  /** Copies a line's PGN, confirming it with a transient state on its button. */
  protected copyPgn(index: number): void {
    const pgn = this.columns()[index]?.pgn.trim() ?? '';
    if (pgn.length === 0 || !this.clipboard.copy(pgn)) {
      return;
    }
    this.copiedIndex.set(index);
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
    }
    this.copiedTimer = setTimeout(() => this.copiedIndex.set(null), 1500);
  }

  /** Opens the move's menu at the cursor, or under the move when opened from the keyboard. */
  protected onMoveContextMenu(event: MouseEvent, key: string): void {
    event.preventDefault();
    const [lineIndex, ply] = key.split(':').map(Number);
    this.menuTarget.set({ lineIndex, ply });
    const trigger = this.contextMenu();
    const el = this.contextTrigger()?.nativeElement;
    if (!trigger || !el) {
      return;
    }
    // The context-menu key and Shift+F10 report no pointer position.
    let x = event.clientX;
    let y = event.clientY;
    if (x === 0 && y === 0 && event.currentTarget instanceof HTMLElement) {
      const rect = event.currentTarget.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom;
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    trigger.openMenu();
  }

  /** Opens the right-clicked move in the large view. */
  protected openMenuTarget(): void {
    const target = this.menuTarget();
    if (target) {
      this.openBoard(target.lineIndex, target.ply);
    }
  }

  protected clear(): void {
    this.pinnedKeys.set([]);
  }

  /**
   * Opens the pinned board fullscreen, at the move it was pinned at and
   * navigable through the rest of its line — the same large view a board on the
   * Lines tab opens, captions included.
   */
  protected openBoard(lineIndex: number, ply: number): void {
    const line = this.lines()[lineIndex];
    if (!line) {
      return;
    }
    const tiles: BoardDialogTile[] = line.positions.map((position) => ({
      ply: position.ply,
      fen: position.fen,
      caption: position.ply === 0 || position.san === null ? 'Start' : moveLabel(position),
      san: position.san,
      from: position.from,
      to: position.to,
    }));
    this.dialog.open(BoardDialog, {
      data: {
        tiles,
        // Positions run from the starting board, so a ply is its own tile index.
        index: ply,
        captions: line.captions,
        orientation: this.orientation(),
        onCaptionChange: (captions: Record<number, string>) =>
          this.captionsChange.emit({ id: line.id, captions }),
        focusPlies: line.focusPlies,
        onFocusChange: (focusPlies: number[]) =>
          this.focusPliesChange.emit({ id: line.id, focusPlies }),
      },
      panelClass: 'board-dialog-panel',
      ariaLabel: 'Board preview',
      maxWidth: '98vw',
      maxHeight: '98vh',
      autoFocus: 'dialog',
    });
  }
}

/** `5. Qd2` for White, `5… O-O` for Black — how the app captions a move. */
function moveLabel(position: GamePosition): string {
  return position.color === 'white'
    ? `${position.moveNumber}. ${position.san}`
    : `${position.moveNumber}… ${position.san}`;
}
