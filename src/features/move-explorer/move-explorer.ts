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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BoardOrientation, GamePosition, PieceCode } from '../../core/chess-models';
import { ChessService } from '../../core/chess-service';
import { findMatchingSpan, MoveQuery, parseMoveQuery } from '../../core/line-search';
import { BoardDrawing, UploadedImage } from '../../core/workspace-models';
import { BoardDialog, BoardDialogTile } from '../board-dialog/board-dialog';
import { ChessBoard } from '../chess-board/chess-board';

/** Piece types the position filter offers, as FEN letters (White's spelling). */
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

/** A square in algebraic notation, e.g. `e4`. */
const SQUARE_PATTERN = /^[a-h][1-8]$/;

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
  /** Each move's own images, keyed by ply; managed in the large view. */
  readonly moveImages: Readonly<Record<number, readonly UploadedImage[]>>;
  /** Each move's drawing (colored squares and arrows), keyed by ply. */
  readonly drawings: Readonly<Record<number, BoardDrawing>>;
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
  /** The line's position in the file, which pins and copies key off even while filtered. */
  readonly lineIndex: number;
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
  /** The user's saved drawing for this move, if any. */
  readonly drawing: BoardDrawing | null;
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
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatTooltipModule,
    ChessBoard,
  ],
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
  /** Emits a line's full updated image map when a move's images change in the large view. */
  readonly moveImagesChange = output<{
    id: string;
    moveImages: Record<number, readonly UploadedImage[]>;
  }>();
  /** Emits a line's full updated drawing map when drawings are saved in the large view. */
  readonly drawingsChange = output<{ id: string; drawings: Record<number, BoardDrawing> }>();

  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly clipboard = inject(Clipboard);
  private readonly chess = inject(ChessService);

  /** PGN the columns are filtered by: only lines that open with these moves are shown. */
  protected readonly filterControl = new FormControl('', { nonNullable: true });
  private readonly filterText = toSignal(this.filterControl.valueChanges, { initialValue: '' });

  /**
   * The filter's moves as SAN, `null` when the field is empty (no filtering),
   * or an error message while what's typed isn't a PGN with at least one move.
   */
  protected readonly filter = computed<{ sans: readonly string[] } | { error: string } | null>(
    () => {
      const text = this.filterText().trim();
      if (text.length === 0) {
        return null;
      }
      const result = this.chess.parsePgn(text);
      const sans = result.positions.flatMap((position) => (position.san ? [position.san] : []));
      return result.valid && sans.length > 0
        ? { sans }
        : { error: 'Not a valid PGN yet — showing every line.' };
    },
  );

  /** Whether something is typed that doesn't parse as a PGN with moves. */
  protected readonly filterInvalid = computed(() => {
    const filter = this.filter();
    return filter !== null && 'error' in filter;
  });

  /** The filter's moves, or none while it's empty or invalid. */
  private readonly filterSans = computed(() => {
    const filter = this.filter();
    return filter && 'sans' in filter ? filter.sans : [];
  });

  /** A single move the columns are filtered by, e.g. `7. Na6`, `7… Na6`, or `Na6`. */
  protected readonly moveControl = new FormControl('', { nonNullable: true });
  private readonly moveText = toSignal(this.moveControl.valueChanges, { initialValue: '' });

  /**
   * The move filter's parsed query, `null` when the field is empty, or an
   * error while what's typed doesn't name a move yet.
   */
  protected readonly moveFilter = computed<{ query: MoveQuery } | { error: string } | null>(
    () => {
      const text = this.moveText().trim();
      if (text.length === 0) {
        return null;
      }
      const query = parseMoveQuery(text);
      return query ? { query } : { error: 'Not a move yet' };
    },
  );

  protected readonly moveFilterInvalid = computed(() => {
    const filter = this.moveFilter();
    return filter !== null && 'error' in filter;
  });

  /**
   * For each line (by index), the plies where it plays the move filter's move,
   * or null when the move filter isn't in effect.
   */
  private readonly moveMatches = computed<(readonly number[])[] | null>(() => {
    const filter = this.moveFilter();
    if (!filter || !('query' in filter)) {
      return null;
    }
    return this.lines().map((line) => {
      const span = findMatchingSpan(line.positions, filter.query);
      if (!span) {
        return [];
      }
      const plies: number[] = [];
      for (let ply = span.start.ply; ply <= span.end.ply; ply++) {
        plies.push(ply);
      }
      return plies;
    });
  });

  /** `lineIndex:ply` keys of the moves the move filter matched, highlighted in the columns. */
  private readonly matchedKeys = computed(() => {
    const keys = new Set<string>();
    this.moveMatches()?.forEach((plies, lineIndex) =>
      plies.forEach((ply) => keys.add(`${lineIndex}:${ply}`)),
    );
    return keys;
  });

  protected isMatch(key: string): boolean {
    return this.matchedKeys().has(key);
  }

  /** Position filter: which side's piece, which piece, and the square it must stand on. */
  protected readonly pieceColorControl = new FormControl<'white' | 'black' | ''>('', {
    nonNullable: true,
  });
  protected readonly pieceTypeControl = new FormControl<PieceType | ''>('', { nonNullable: true });
  protected readonly squareControl = new FormControl('', { nonNullable: true });
  private readonly pieceColor = toSignal(this.pieceColorControl.valueChanges, {
    initialValue: '' as const,
  });
  private readonly pieceType = toSignal(this.pieceTypeControl.valueChanges, {
    initialValue: '' as const,
  });
  private readonly squareText = toSignal(this.squareControl.valueChanges, { initialValue: '' });

  protected readonly pieceTypes: readonly { value: PieceType; label: string }[] = [
    { value: 'K', label: 'King (K)' },
    { value: 'Q', label: 'Queen (Q)' },
    { value: 'R', label: 'Rook (R)' },
    { value: 'B', label: 'Bishop (B)' },
    { value: 'N', label: 'Knight (N)' },
    { value: 'P', label: 'Pawn (P)' },
  ];

  /**
   * The position filter: the square a matching board must have a piece on,
   * and, when chosen, that piece's color and type. `null` while every input is
   * empty, or what's missing or wrong while the square isn't a square yet.
   */
  protected readonly positionFilter = computed<
    | { square: string; color: 'white' | 'black' | null; type: PieceType | null }
    | { problem: string }
    | null
  >(() => {
    const color = this.pieceColor();
    const type = this.pieceType();
    const square = this.squareText().trim().toLowerCase();
    if (!color && !type && !square) {
      return null;
    }
    if (!SQUARE_PATTERN.test(square)) {
      return { problem: 'Position filter: enter a square like e4.' };
    }
    return { square, color: color || null, type: type || null };
  });

  protected readonly squareInvalid = computed(() => {
    const square = this.squareText().trim();
    return square.length > 0 && !SQUARE_PATTERN.test(square.toLowerCase());
  });

  /**
   * For each line (by index), the plies whose board has the position filter's
   * piece on its square, or null when the position filter isn't in effect.
   */
  private readonly positionMatches = computed<(readonly number[])[] | null>(() => {
    const filter = this.positionFilter();
    if (!filter || !('square' in filter)) {
      return null;
    }
    // fenToSquares rows run rank 8 first, files a first.
    const row = 8 - Number(filter.square[1]);
    const col = filter.square.charCodeAt(0) - 'a'.charCodeAt(0);
    const fits = (piece: PieceCode | null | undefined): boolean => {
      if (!piece) {
        return false;
      }
      const white = piece === piece.toUpperCase();
      return (
        (!filter.color || filter.color === (white ? 'white' : 'black')) &&
        (!filter.type || filter.type === piece.toUpperCase())
      );
    };
    return this.lines().map((line) =>
      line.positions
        .filter(
          (position) =>
            position.ply > 0 && fits(this.chess.fenToSquares(position.fen)[row]?.[col]),
        )
        .map((position) => position.ply),
    );
  });

  /** `lineIndex:ply` keys of the moves whose board meets the position filter. */
  private readonly positionKeys = computed(() => {
    const keys = new Set<string>();
    this.positionMatches()?.forEach((plies, lineIndex) =>
      plies.forEach((ply) => keys.add(`${lineIndex}:${ply}`)),
    );
    return keys;
  });

  protected isPositionMatch(key: string): boolean {
    return this.positionKeys().has(key);
  }

  protected clearPositionFilter(): void {
    this.pieceColorControl.setValue('');
    this.pieceTypeControl.setValue('');
    this.squareControl.setValue('');
  }

  /**
   * The line columns that pass every filter: opening with the PGN filter's
   * moves, playing the move filter's move, and reaching a board that meets the
   * position filter. Every column when unfiltered.
   */
  protected readonly visibleColumns = computed(() => {
    const sans = this.filterSans();
    const matches = this.moveMatches();
    const positions = this.positionMatches();
    const lines = this.lines();
    return this.columns().filter(
      (column) =>
        sans.every((san, i) => lines[column.lineIndex].positions[i + 1]?.san === san) &&
        (!matches || matches[column.lineIndex].length > 0) &&
        (!positions || positions[column.lineIndex].length > 0),
    );
  });

  /** Screen-reader and on-screen summary of the filters' effect; '' when unfiltered. */
  protected readonly filterStatus = computed(() => {
    const pgn = this.filter();
    const move = this.moveFilter();
    const position = this.positionFilter();
    if (!pgn && !move && !position) {
      return '';
    }
    const problems = [
      pgn && 'error' in pgn ? 'PGN filter: not a valid PGN yet.' : '',
      move && 'error' in move ? 'Move filter: not a move yet.' : '',
      position && 'problem' in position ? position.problem : '',
    ].filter(Boolean);
    const shown = this.visibleColumns().length;
    const total = this.columns().length;
    const summary = `Showing ${shown} of ${total} ${total === 1 ? 'line' : 'lines'}.`;
    return [...problems, summary].join(' ');
  });

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
      return { lineIndex, label: line.label, pgn: line.pgn, rows };
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
          drawing: line.drawings[position.ply] ?? null,
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

  protected clearFilter(): void {
    this.filterControl.setValue('');
  }

  protected clearMoveFilter(): void {
    this.moveControl.setValue('');
  }

  /** Copies a line's PGN, confirming it with a transient state on its button. */
  protected copyPgn(lineIndex: number): void {
    // Rebuilt from the parsed moves, one full move per line, rather than copied
    // as typed, so it pastes the same however the line was entered.
    const sans = (this.lines()[lineIndex]?.positions ?? []).flatMap((position) =>
      position.san ? [position.san] : [],
    );
    const pgn = this.chess.toMoveLines(sans);
    if (pgn.length === 0 || !this.clipboard.copy(pgn)) {
      return;
    }
    this.copiedIndex.set(lineIndex);
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

  /** Copies the FEN of the right-clicked move's position. */
  protected copyMenuTargetFen(): void {
    const target = this.menuTarget();
    const fen = target && this.lines()[target.lineIndex]?.positions[target.ply]?.fen;
    if (fen) {
      this.clipboard.copy(fen);
    }
  }

  /**
   * Copies the right-clicked line's moves up to and including that move, one
   * full move per line — the same layout as the column's copy button.
   */
  protected copyMenuTargetPgn(): void {
    const target = this.menuTarget();
    const positions = target ? (this.lines()[target.lineIndex]?.positions ?? []) : [];
    const sans = positions
      .slice(1, (target?.ply ?? 0) + 1)
      .flatMap((position) => (position.san ? [position.san] : []));
    if (sans.length > 0) {
      this.clipboard.copy(this.chess.toMoveLines(sans));
    }
  }

  /** Whether the right-clicked move is already a focus point, which words its menu item. */
  protected readonly menuTargetIsFocus = computed(() => {
    const target = this.menuTarget();
    return target !== null && !!this.lines()[target.lineIndex]?.focusPlies.includes(target.ply);
  });

  /** Marks or unmarks the right-clicked move as a focus point, without opening the large view. */
  protected toggleMenuTargetFocus(): void {
    const target = this.menuTarget();
    const line = target && this.lines()[target.lineIndex];
    if (!target || !line) {
      return;
    }
    const focusPlies = line.focusPlies.includes(target.ply)
      ? line.focusPlies.filter((ply) => ply !== target.ply)
      : [...line.focusPlies, target.ply].sort((a, b) => a - b);
    this.focusPliesChange.emit({ id: line.id, focusPlies });
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
        moveImages: line.moveImages,
        onMoveImagesChange: (moveImages: Record<number, readonly UploadedImage[]>) =>
          this.moveImagesChange.emit({ id: line.id, moveImages }),
        drawings: line.drawings,
        onDrawingsChange: (drawings: Record<number, BoardDrawing>) =>
          this.drawingsChange.emit({ id: line.id, drawings }),
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
