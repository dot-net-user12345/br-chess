import { CdkOverlayOrigin, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { BoardDrawing, PgnEntry, UploadedImage } from '../../core/workspace-models';
import { BoardOrientation, GamePosition } from '../../core/chess-models';
import { ChessService } from '../../core/chess-service';
import { matchesPattern, PositionPattern } from '../../core/position-pattern';
import { WorkspaceStore } from '../../core/workspace-store';
import { ImageAttachments } from '../../shared/image-attachments';
import { BoardDialog, BoardDialogTile } from '../../features/board-dialog/board-dialog';
import { ChessBoard } from '../../features/chess-board/chess-board';
import { LineMove, LineMoves } from '../../features/line-moves/line-moves';
import { PositionFilterBar } from '../../features/position-filter-dialog/position-filter-bar';

/** One line of one file, parsed, that the search looks through. */
interface SearchLine {
  readonly fileId: string;
  readonly entryId: string;
  /** `Openings/London › Line 3` — the file's path and the line's label. */
  readonly title: string;
  readonly positions: readonly GamePosition[];
  readonly moves: readonly LineMove[];
  readonly entry: PgnEntry;
}

/** A move whose board has the filter's pieces in place. */
interface ResultTile {
  readonly key: string;
  readonly ply: number;
  readonly fen: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly caption: string;
  readonly ariaLabel: string;
}

interface ResultGroup {
  readonly key: string;
  readonly line: SearchLine;
  readonly tiles: readonly ResultTile[];
}

/** How long the pointer or focus rests on a move before its line is previewed. */
const PEEK_DELAY_MS = 2000;
/** Grace period to move the pointer from a move onto its preview. */
const PEEK_HIDE_MS = 200;

/**
 * Searches every PGN grid file of one orientation for the moves whose board
 * has the position filter's pieces in place, and shows those boards across the
 * whole page. A board opens the large view beside its line's moves; resting on
 * one previews the line.
 */
@Component({
  selector: 'app-position-search',
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
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
  private readonly attachments = inject(ImageAttachments);

  protected readonly pattern = signal<PositionPattern>({});
  /** Only files viewed from this side are searched, and every board is drawn from it. */
  protected readonly orientation = signal<BoardOrientation>('white');

  protected readonly active = computed(() => Object.keys(this.pattern()).length > 0);

  /** Every valid line of every file of the chosen orientation, by file path then line order. */
  private readonly lines = computed<SearchLine[]>(() => {
    const orientation = this.orientation();
    return this.store
      .pgnGridFiles()
      .filter((file) => (file.content.orientation ?? 'white') === orientation)
      .map((file) => ({ file, path: this.store.pathOf(file.id) }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .flatMap(({ file, path }) =>
        file.content.entries.flatMap((entry, index) => {
          const result = this.chess.parsePgn(entry.pgn);
          if (!result.valid || result.positions.length < 2) {
            return [];
          }
          return [
            {
              fileId: file.id,
              entryId: entry.id,
              title: `${path} › ${entry.label || `Line ${index + 1}`}`,
              positions: result.positions,
              moves: result.positions.flatMap((p) => (p.san ? [{ ply: p.ply, san: p.san }] : [])),
              entry,
            },
          ];
        }),
      );
  });

  /**
   * The lines with a matching move, each with the moves where the filter's
   * pieces come into place — the first of each run of matching moves, so a
   * position held for many moves shows once rather than at every move.
   */
  protected readonly groups = computed<ResultGroup[]>(() => {
    const pattern = this.pattern();
    if (!this.active()) {
      return [];
    }
    return this.lines().flatMap((line) => {
      const tiles: ResultTile[] = [];
      let previous = false;
      for (const position of line.positions) {
        const matches = position.ply > 0 && matchesPattern(position.fen, pattern);
        if (matches && !previous) {
          const caption = moveLabel(position);
          tiles.push({
            key: `${line.fileId}:${line.entryId}:${position.ply}`,
            ply: position.ply,
            fen: position.fen,
            from: position.from,
            to: position.to,
            caption,
            ariaLabel: `${caption}, ${line.title}`,
          });
        }
        previous = matches;
      }
      return tiles.length > 0 ? [{ key: `${line.fileId}:${line.entryId}`, line, tiles }] : [];
    });
  });

  /** Every matching move, line after line, each with the line it belongs to. */
  protected readonly results = computed(() =>
    this.groups().flatMap((group) => group.tiles.map((tile) => ({ group, tile }))),
  );

  /** A grid of small boards, or the boards drawn large. */
  protected readonly view = signal<'grid' | 'large'>('grid');
  /** Drawn large: one move at a time, or every move in a row that scrolls sideways. */
  protected readonly largeMode = signal<'single' | 'row'>('single');

  /** The move shown one at a time; back to the first whenever the results change. */
  protected readonly index = linkedSignal({ source: this.results, computation: () => 0 });
  protected readonly current = computed(() => this.results()[this.index()] ?? null);

  protected prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  protected next(): void {
    this.index.update((i) => Math.min(this.results().length - 1, i + 1));
  }

  protected readonly status = computed(() => {
    const side = this.orientation() === 'white' ? 'White' : 'Black';
    if (!this.active()) {
      return `Place pieces with Filter by position to find the moves in your ${side} files that reach them.`;
    }
    const groups = this.groups();
    const moves = groups.reduce((sum, group) => sum + group.tiles.length, 0);
    if (moves === 0) {
      return `No move in your ${side} files has those pieces in place.`;
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

  constructor() {
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

  /** Opens the move in the large view, its line's moves beside the board. */
  protected open(group: ResultGroup, ply: number): void {
    this.hidePeek();
    const line = group.line;
    const entry = line.entry;
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
        line: { label: line.title },
        orientation: this.orientation(),
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
  private async updateEntry(line: SearchLine, update: (entry: PgnEntry) => PgnEntry): Promise<void> {
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

/** `5. Qd2` for White, `5… O-O` for Black — how the app captions a move. */
function moveLabel(position: GamePosition): string {
  return position.color === 'white'
    ? `${position.moveNumber}. ${position.san}`
    : `${position.moveNumber}… ${position.san}`;
}
