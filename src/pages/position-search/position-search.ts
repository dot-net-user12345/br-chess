import { CdkOverlayOrigin, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { BoardDrawing, NodeId } from '../../core/workspace-models';
import { BoardOrientation, GamePosition } from '../../core/chess-models';
import { ChessService } from '../../core/chess-service';
import {
  moveLabel,
  patternMatches,
  pgnMatches,
  SearchLine,
  searchLines,
} from '../../core/move-search';
import { matchesPattern, patternToFen, PositionPattern } from '../../core/position-pattern';
import { WorkspaceStore } from '../../core/workspace-store';
import { LineBoardDialog } from '../../features/board-dialog/line-board-dialog';
import { ChessBoard } from '../../features/chess-board/chess-board';
import {
  FileScopeDialog,
  FileScopeDialogData,
} from '../../features/file-scope-dialog/file-scope-dialog';
import { LineMoves } from '../../features/line-moves/line-moves';
import { PositionFilterBar } from '../../features/position-filter-dialog/position-filter-bar';

/** A move the filter matched: one whose board has its pieces in place, or that ends its PGN. */
interface ResultTile {
  readonly key: string;
  readonly ply: number;
  readonly fen: string;
  readonly from: string | null;
  readonly to: string | null;
  /** The user's colored squares and arrows for this move, if any. */
  readonly drawing: BoardDrawing | null;
  readonly caption: string;
  readonly ariaLabel: string;
}

interface ResultGroup {
  readonly key: string;
  readonly line: SearchLine;
  readonly tiles: readonly ResultTile[];
}

/** How long the pointer or focus rests on a move before its line is previewed. */
const PEEK_DELAY_MS = 1000;
/** Grace period to move the pointer from a move onto its preview. */
const PEEK_HIDE_MS = 200;

/** Where the files left out of the search are remembered, in this browser only. */
const EXCLUDED_KEY = 'br-chess-position-search-excluded';

/** Where the user's order of the results is remembered, for the latest filter only. */
const ORDER_KEY = 'br-chess-position-search-order';

/** A display order of the results, and the filter it was made for. */
interface SavedOrder {
  /** The filter's key when the order was made: side, and pattern or PGN. */
  readonly filter: string;
  /** Result keys, first to last. */
  readonly keys: readonly string[];
}

/**
 * Searches every PGN grid file of one orientation and shows the matching
 * boards across the whole page. Two filters, one at a time: by position, the
 * moves whose board has the filter's pieces in place; by PGN, the board each
 * line reaches after opening with those moves. A board opens the large view
 * beside its line's moves; resting on one previews the line.
 */
@Component({
  selector: 'app-position-search',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    OverlayModule,
    ChessBoard,
    LineMoves,
    PositionFilterBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'hidePeek()' },
  templateUrl: './position-search.html',
  styleUrl: './position-search.scss',
})
export class PositionSearch {
  private readonly store = inject(WorkspaceStore);
  private readonly chess = inject(ChessService);
  private readonly dialog = inject(MatDialog);
  private readonly lineDialog = inject(LineBoardDialog);
  private readonly router = inject(Router);

  protected readonly pattern = signal<PositionPattern>({});
  /** Only files viewed from this side are searched, and every board is drawn from it. */
  protected readonly orientation = signal<BoardOrientation>('white');

  /** Lines that open with these moves; the other filter, used instead of a position. */
  protected readonly pgnControl = new FormControl('', { nonNullable: true });
  private readonly pgnText = toSignal(this.pgnControl.valueChanges, { initialValue: '' });

  /**
   * The PGN filter's moves as SAN, `null` when the field is empty, or an error
   * while what's typed isn't a PGN with at least one move.
   */
  protected readonly pgnFilter = computed<{ sans: readonly string[] } | { error: string } | null>(
    () => {
      const text = this.pgnText().trim();
      if (text.length === 0) {
        return null;
      }
      const result = this.chess.parsePgn(text);
      const sans = result.positions.flatMap((position) => (position.san ? [position.san] : []));
      return result.valid && sans.length > 0 ? { sans } : { error: 'Not a valid PGN yet.' };
    },
  );

  protected readonly pgnInvalid = computed(() => {
    const filter = this.pgnFilter();
    return filter !== null && 'error' in filter;
  });

  /** The PGN filter's moves while it is in force; null otherwise. */
  private readonly pgnSans = computed(() => {
    const filter = this.pgnFilter();
    return filter && 'sans' in filter ? filter.sans : null;
  });

  /** Whether either filter is in force. */
  protected readonly active = computed(
    () => this.pgnSans() !== null || Object.keys(this.pattern()).length > 0,
  );

  /**
   * Files left out of the search, picked in the Files dialog. The left-out
   * ones are kept rather than the searched ones, so a new file is searched.
   */
  protected readonly excluded = signal<ReadonlySet<NodeId>>(readExcluded());

  /** `3 of 10`-style count for the Files button; '' while every file is searched. */
  protected readonly scopeCount = computed(() => {
    const files = this.store.pgnGridFiles();
    const excluded = this.excluded();
    const searched = files.filter((file) => !excluded.has(file.id)).length;
    return searched === files.length ? '' : `${searched} of ${files.length}`;
  });

  /** Every valid line of every searched file of the chosen orientation, by file path then line order. */
  private readonly lines = computed<SearchLine[]>(() => {
    const orientation = this.orientation();
    const excluded = this.excluded();
    const files = this.store
      .pgnGridFiles()
      .filter(
        (file) => !excluded.has(file.id) && (file.content.orientation ?? 'white') === orientation,
      );
    return searchLines(
      files,
      (id) => this.store.pathOf(id),
      (pgn) => this.chess.parsePgn(pgn),
    );
  });

  /**
   * The lines with a matching move. By PGN, each line that opens with its
   * moves, at the board after the last of them. By position, each line's moves
   * where the filter's pieces come into place — the first of each run of
   * matching moves, so a position held for many moves shows once rather than
   * at every move.
   */
  protected readonly groups = computed<ResultGroup[]>(() => {
    const sans = this.pgnSans();
    const pattern = this.pattern();
    if (!this.active()) {
      return [];
    }
    return this.lines().flatMap((line) => {
      const matches = sans ? pgnMatches(line, sans) : patternMatches(line, pattern);
      const tiles = matches.map((position) => resultTile(line, position));
      return tiles.length > 0 ? [{ key: `${line.fileId}:${line.entryId}`, line, tiles }] : [];
    });
  });

  /**
   * Multi step notes whose position has the filter's pieces in place, by
   * path. Only the position filter finds them; notes have no moves of their own
   * to open with a PGN.
   */
  protected readonly noteMatches = computed(() => {
    const pattern = this.pattern();
    if (this.pgnSans() !== null || Object.keys(pattern).length === 0) {
      return [];
    }
    return this.store
      .multiStepNotes()
      .flatMap((file) =>
        file.content.fen && matchesPattern(file.content.fen, pattern)
          ? [
              {
                id: file.id,
                path: this.store.pathOf(file.id),
                fen: file.content.fen,
                orientation: file.content.orientation ?? 'white',
              },
            ]
          : [],
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  });

  /** The filter as one string, which a saved order is kept against; '' when there is none. */
  private readonly filterKey = computed(() => {
    if (!this.active()) {
      return '';
    }
    const sans = this.pgnSans();
    const filter = sans ? `pgn:${sans.join(' ')}` : patternToFen(this.pattern());
    return `${this.orientation()}|${filter}`;
  });

  /** The user's order of the results, for the one filter it was made for. */
  private readonly savedOrder = signal<SavedOrder | null>(readOrder());

  /** Whether the results are shown in an order the user chose. */
  protected readonly reordered = computed(() => {
    const order = this.savedOrder();
    return !!order && order.filter === this.filterKey();
  });

  /**
   * Every matching move, each with the line it belongs to: line after line,
   * unless the user has reordered them for this filter. A move the saved order
   * doesn't know — from a file added or checked since — goes after the rest.
   */
  protected readonly results = computed(() => {
    const results = this.groups().flatMap((group) => group.tiles.map((tile) => ({ group, tile })));
    const order = this.savedOrder();
    if (!order || !this.reordered()) {
      return results;
    }
    const rank = new Map(order.keys.map((key, i) => [key, i]));
    const at = (key: string) => rank.get(key) ?? Number.MAX_SAFE_INTEGER;
    return [...results].sort((a, b) => at(a.tile.key) - at(b.tile.key));
  });

  /** A grid of small boards, or the boards drawn large. */
  protected readonly view = signal<'grid' | 'large'>('grid');
  /** Drawn large: one move at a time, or every move in a row that scrolls sideways. */
  protected readonly largeMode = signal<'single' | 'row'>('single');

  /**
   * The move shown one at a time. It stays on the same move when the results
   * are reordered or redrawn, and goes back to the first when that move is gone.
   */
  protected readonly index = linkedSignal<{ tile: ResultTile }[], number>({
    source: this.results,
    computation: (results, previous) => {
      const key = previous?.source[previous.value]?.tile.key;
      return Math.max(
        0,
        results.findIndex((result) => result.tile.key === key),
      );
    },
  });
  protected readonly current = computed(() => this.results()[this.index()] ?? null);

  protected prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  protected next(): void {
    this.index.update((i) => Math.min(this.results().length - 1, i + 1));
  }

  protected readonly status = computed(() => {
    const side = this.orientation() === 'white' ? 'White' : 'Black';
    if (this.pgnInvalid()) {
      return 'PGN filter: not a valid PGN yet.';
    }
    if (!this.active()) {
      return `Place pieces with Filter by position, or type moves into Filter by PGN, to find them in your ${side} files.`;
    }
    const groups = this.groups();
    const moves = groups.reduce((sum, group) => sum + group.tiles.length, 0);
    if (moves === 0) {
      return this.pgnSans()
        ? `No line in your ${side} files opens with those moves.`
        : `No move in your ${side} files has those pieces in place.`;
    }
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
    return `${plural(moves, 'move')} in ${plural(groups.length, 'line')} of your ${side} files.`;
  });

  /** The move whose line is previewed, and the board it is anchored to. */
  protected readonly peek = signal<{
    group: ResultGroup;
    tile: ResultTile;
    origin: CdkOverlayOrigin;
  } | null>(null);

  protected readonly peekPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 8 },
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -8 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  ];

  private peekTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  /** Cursor-anchored trigger for the reorder menu, and where in the results it was opened. */
  private readonly contextTrigger = viewChild<ElementRef<HTMLElement>>('contextTrigger');
  private readonly contextMenu = viewChild(MatMenuTrigger);
  protected readonly menuIndex = signal(-1);

  constructor() {
    // The two filters are one at a time: typing a PGN puts the position aside.
    this.pgnControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((text) => {
      if (text.trim().length > 0) {
        this.pattern.set({});
      }
    });
    effect(() => writeExcluded(this.excluded()));
    effect(() => writeOrder(this.savedOrder()));
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.peekTimer);
      clearTimeout(this.hideTimer);
    });
  }

  /** Previews the move's line once the pointer or focus has rested on it long enough. */
  protected startPeek(group: ResultGroup, tile: ResultTile, origin: CdkOverlayOrigin): void {
    clearTimeout(this.hideTimer);
    if (this.peek()?.tile.key === tile.key) {
      return;
    }
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => this.peek.set({ group, tile, origin }), PEEK_DELAY_MS);
  }

  /** Hides the preview after a moment, long enough to move onto it. */
  protected endPeek(): void {
    clearTimeout(this.peekTimer);
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.peek.set(null), PEEK_HIDE_MS);
  }

  /** The pointer reached the preview, so it stays. */
  protected keepPeek(): void {
    clearTimeout(this.hideTimer);
  }

  protected hidePeek(): void {
    clearTimeout(this.peekTimer);
    clearTimeout(this.hideTimer);
    this.peek.set(null);
  }

  /** Applies a position from the filter dialog, which clears the PGN filter. */
  protected setPattern(pattern: PositionPattern): void {
    this.pattern.set(pattern);
    if (Object.keys(pattern).length > 0) {
      this.pgnControl.setValue('');
    }
  }

  protected clearPgn(): void {
    this.pgnControl.setValue('');
  }

  /** Opens the reorder menu at the pointer, or under the board from the keyboard. */
  protected onContextMenu(event: MouseEvent, key: string): void {
    event.preventDefault();
    this.hidePeek();
    this.menuIndex.set(this.results().findIndex((result) => result.tile.key === key));
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

  /** Whether the menu's move can go one place earlier (-1) or later (1). */
  protected canMove(delta: -1 | 1): boolean {
    const to = this.menuIndex() + delta;
    return this.menuIndex() >= 0 && to >= 0 && to < this.results().length;
  }

  /** Swaps the menu's move with its neighbor, and saves the order for this filter. */
  protected move(delta: -1 | 1): void {
    if (!this.canMove(delta)) {
      return;
    }
    const keys = this.results().map((result) => result.tile.key);
    const from = this.menuIndex();
    const to = from + delta;
    [keys[from], keys[to]] = [keys[to], keys[from]];
    this.savedOrder.set({ filter: this.filterKey(), keys });
  }

  protected restoreOrder(): void {
    this.savedOrder.set(null);
  }

  /** Opens the checklist of folders and files to search; Apply puts it in force. */
  protected openScope(): void {
    this.dialog
      .open<FileScopeDialog, FileScopeDialogData, ReadonlySet<NodeId>>(FileScopeDialog, {
        data: { excluded: this.excluded() },
        width: '32rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((excluded) => {
        if (excluded) {
          this.excluded.set(excluded);
        }
      });
  }

  /** Shows a multi step notes file on its own page. */
  protected openNotes(id: NodeId): void {
    void this.router.navigateByUrl('/notes').then(() => this.store.reveal(id));
  }

  /** Opens the move in the large view, its line's moves beside the board. */
  protected open(group: ResultGroup, ply: number): void {
    this.hidePeek();
    this.lineDialog.open(group.line, ply, this.orientation());
  }
}

/** The files left out last time; none when nothing is stored or storage is unavailable. */
function readExcluded(): ReadonlySet<NodeId> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(EXCLUDED_KEY) ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** The order saved for the latest filter; none when nothing usable is stored. */
function readOrder(): SavedOrder | null {
  try {
    const order: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
    if (
      order &&
      typeof order === 'object' &&
      'filter' in order &&
      typeof order.filter === 'string' &&
      'keys' in order &&
      Array.isArray(order.keys)
    ) {
      return { filter: order.filter, keys: order.keys.filter((key) => typeof key === 'string') };
    }
  } catch {
    // Unreadable or unavailable: the results show in their usual order.
  }
  return null;
}

function writeOrder(order: SavedOrder | null): void {
  try {
    if (order) {
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } else {
      localStorage.removeItem(ORDER_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode, blocked); the order then lasts the visit.
  }
}

function writeExcluded(excluded: ReadonlySet<NodeId>): void {
  try {
    localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...excluded]));
  } catch {
    // Storage can be unavailable (private mode, blocked); the choice then lasts the visit.
  }
}

/** One matching move of a line, as a board on the page. */
function resultTile(line: SearchLine, position: GamePosition): ResultTile {
  const caption = moveLabel(position);
  return {
    key: `${line.fileId}:${line.entryId}:${position.ply}`,
    ply: position.ply,
    fen: position.fen,
    from: position.from,
    to: position.to,
    drawing: line.entry.drawings?.[position.ply] ?? null,
    caption,
    ariaLabel: `${caption}, ${line.title}`,
  };
}
