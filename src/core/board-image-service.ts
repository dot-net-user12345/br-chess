import { inject, Injectable } from '@angular/core';
import { getDownloadURL, ref, Storage, StorageError, uploadBytes } from '@angular/fire/storage';
import { ChessService } from './chess-service';
import {
  arrowLabelBadge,
  COORDINATE_COLOR,
  COORDINATE_FONT_SCALE,
  COORDINATE_INSET,
  DARK_SQUARE,
  DIVERGENT_MOVE_COLOR,
  fileLabels,
  flipPoint,
  LIGHT_SQUARE,
  moveArrowGeometry,
  MOVE_ARROW_COLOR,
  pieceAssetPath,
  PIECE_OUTLINE_DASH,
  PIECE_OUTLINE_SIZE,
  PIECE_OUTLINE_STROKE,
  PIECE_OUTLINES,
  rankLabels,
  squareCrossGeometry,
} from './board-assets';
import { BoardOrientation, GamePosition } from './chess-models';
import {
  arrowColor,
  arrowLabel,
  arrowStyle,
  ArrowStyle,
  BoardDrawing,
  DRAWING_COLORS,
  drawingKey,
  gridIndex,
  OutlinePiece,
  outlinePiece,
  squareColor,
  squareMark,
} from './board-drawing';

/**
 * Pixel size of one square in the exported PNG (independent of the on-screen
 * board). The full image is 8× this. Bump for higher-resolution exports — the
 * value is part of the storage key, so changing it re-renders rather than
 * reusing an image at the old size.
 */
const RENDER_SQUARE = 128;
const BOARD_SIZE = RENDER_SQUARE * 8;

function isNotFound(err: unknown): boolean {
  return err instanceof StorageError && err.code === 'storage/object-not-found';
}

/**
 * Renders chess positions to PNG images and persists them to Cloud Storage.
 *
 * Each image shows the board, its rank/file coordinates, and a colored arrow
 * from the move's origin to its destination square. Images are
 * content-addressed by a hash of the position's
 * FEN and move (`moves/{hash}.png`), so a given position+move is rendered and
 * uploaded at most once and then reused across every entry, file, and save.
 * Rendering happens in the browser on a canvas using the same bundled piece
 * SVGs the live board uses. Cloud Storage holds only these images.
 */
@Injectable({ providedIn: 'root' })
export class BoardImageService {
  private readonly storage = inject(Storage);
  private readonly chess = inject(ChessService);

  /** In-flight/resolved download URL per position key, so concurrent asks dedupe. */
  private readonly urlByKey = new Map<string, Promise<string>>();
  /** Cached decoded piece images, keyed by asset path. */
  private readonly imageByPath = new Map<string, Promise<HTMLImageElement>>();

  /**
   * Resolves a Storage download URL for every position, in order. Plies listed
   * in `highlightedPlies` render in the divergent color with a matching border,
   * and each position carries the user's drawing for its ply, if any.
   */
  urlsForPositions(
    positions: readonly GamePosition[],
    highlightedPlies: ReadonlySet<number> = new Set(),
    orientation: BoardOrientation = 'white',
    drawings: Readonly<Record<number, BoardDrawing>> = {},
  ): Promise<string[]> {
    return Promise.all(
      positions.map((position) =>
        this.urlForPosition(
          position,
          highlightedPlies.has(position.ply),
          orientation,
          drawings[position.ply] ?? null,
        ),
      ),
    );
  }

  private urlForPosition(
    position: GamePosition,
    highlighted: boolean,
    orientation: BoardOrientation,
    drawing: BoardDrawing | null,
  ): Promise<string> {
    const drawn = drawingKey(drawing);
    const key =
      `${RENDER_SQUARE}|${position.fen}|${position.from ?? ''}${position.to ?? ''}` +
      // Only appended when highlighted, so normal renders keep their existing keys.
      (highlighted ? '|divergent' : '') +
      // Only appended for black, so white renders keep their existing keys.
      (orientation === 'black' ? '|black' : '') +
      // Only appended when something is drawn, so plain renders keep their keys.
      (drawn ? `|draw:${drawn}` : '') +
      // Bumped whenever the render itself changes, so already-uploaded images at
      // the old appearance are re-rendered instead of reused. v4: the dashed
      // line lost its arrowhead for a ringed point at each end.
      '|v4-line-ends';
    const existing = this.urlByKey.get(key);
    if (existing) {
      return existing;
    }
    const pending = this.resolveUrl(position, key, highlighted, orientation, drawing);
    this.urlByKey.set(key, pending);
    return pending;
  }

  private async resolveUrl(
    position: GamePosition,
    key: string,
    highlighted: boolean,
    orientation: BoardOrientation,
    drawing: BoardDrawing | null,
  ): Promise<string> {
    const fileRef = ref(this.storage, `moves/${await this.hash(key)}.png`);
    try {
      // Reuse an already-uploaded render (content-addressed, so it's this position+move).
      return await getDownloadURL(fileRef);
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
    }
    const blob = await this.render(position, highlighted, orientation, drawing);
    await uploadBytes(fileRef, blob, { contentType: 'image/png' });
    return getDownloadURL(fileRef);
  }

  private async render(
    position: GamePosition,
    highlighted: boolean,
    orientation: BoardOrientation,
    drawing: BoardDrawing | null,
  ): Promise<Blob> {
    const rows = this.chess.fenToSquares(position.fen);
    const black = orientation === 'black';
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not acquire a 2D canvas context to render the board.');
    }
    // Fill of each grid cell (row by row, as the viewer sees them) the user
    // tinted; squares marked with an X are crossed after the pieces instead.
    const marked = new Map<number, string>();
    for (const square of drawing?.squares ?? []) {
      const index = gridIndex(square, orientation);
      if (drawing && index !== null && squareMark(drawing, square) === 'fill') {
        marked.set(index, DRAWING_COLORS[squareColor(drawing, square)].fill);
      }
    }
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const x = file * RENDER_SQUARE;
        const y = rank * RENDER_SQUARE;
        ctx.fillStyle = (rank + file) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE;
        ctx.fillRect(x, y, RENDER_SQUARE, RENDER_SQUARE);
        const fill = marked.get(rank * 8 + file);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fillRect(x, y, RENDER_SQUARE, RENDER_SQUARE);
        }
        // Black views the board rotated 180°, so read the mirrored source cell.
        const piece = black ? (rows[7 - rank]?.[7 - file] ?? null) : (rows[rank]?.[file] ?? null);
        if (piece) {
          ctx.drawImage(await this.pieceImage(pieceAssetPath(piece)), x, y, RENDER_SQUARE, RENDER_SQUARE);
        }
      }
    }
    this.drawCoordinates(ctx, orientation);
    for (const square of drawing?.squares ?? []) {
      if (!drawing) {
        continue;
      }
      const color = DRAWING_COLORS[squareColor(drawing, square)].arrow;
      const mark = squareMark(drawing, square);
      const piece = outlinePiece(mark);
      if (mark === 'cross') {
        this.drawCross(ctx, square, color, black);
      } else if (piece) {
        this.drawOutline(ctx, square, piece, color, orientation);
      }
    }
    if (position.from && position.to) {
      this.drawArrow(ctx, position.from, position.to, highlighted ? DIVERGENT_MOVE_COLOR : MOVE_ARROW_COLOR, black);
    }
    for (const arrow of drawing?.arrows ?? []) {
      const palette = DRAWING_COLORS[arrowColor(arrow)];
      this.drawArrow(
        ctx,
        arrow.from,
        arrow.to,
        palette.arrow,
        black,
        arrowStyle(arrow),
        arrowLabel(arrow),
        palette.text,
      );
    }
    if (highlighted) {
      this.drawHighlightBorder(ctx);
    }
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Board image encoding failed.'))),
        'image/png',
      );
    });
  }

  /**
   * Labels the board's edge squares: rank numbers down the left file (top-left
   * corner) and file letters along the bottom rank (bottom-right corner), both
   * read from the viewer's side of the board.
   */
  private drawCoordinates(ctx: CanvasRenderingContext2D, orientation: BoardOrientation): void {
    const files = fileLabels(orientation);
    const ranks = rankLabels(orientation);
    const inset = RENDER_SQUARE * COORDINATE_INSET;
    ctx.save();
    ctx.fillStyle = COORDINATE_COLOR;
    ctx.font = `bold ${RENDER_SQUARE * COORDINATE_FONT_SCALE}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ranks.forEach((rank, index) => {
      ctx.fillText(rank, inset, index * RENDER_SQUARE + inset);
    });
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const bottom = BOARD_SIZE - inset;
    files.forEach((file, index) => {
      ctx.fillText(file, (index + 1) * RENDER_SQUARE - inset, bottom);
    });
    ctx.restore();
  }

  /**
   * Draws a colored line between two squares: an arrow with a triangular head,
   * or, for the dashed style, a headless line ringed at both ends. A solid
   * arrow can carry a number on its shaft, in `labelColor` on a disc.
   */
  private drawArrow(
    ctx: CanvasRenderingContext2D,
    from: string,
    to: string,
    color: string,
    black: boolean,
    style?: ArrowStyle,
    label = '',
    labelColor = '#ffffff',
  ): void {
    // Geometry is in board units (1 unit = 1 square); scale up to pixels.
    const arrow = moveArrowGeometry(from, to, style);
    const s = RENDER_SQUARE;
    // From black's side the board is rotated 180°, so mirror every arrow point.
    const at = (point: { x: number; y: number }) => (black ? flipPoint(point) : point);
    const shaftFrom = at(arrow.shaftFrom);
    const shaftTo = at(arrow.shaftTo);
    const head = arrow.head.map(at);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = arrow.strokeWidth * s;
    // Dashes keep square ends so they stay distinct, matching the live board.
    ctx.lineCap = arrow.dash.length > 0 ? 'butt' : 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(arrow.dash.map((length) => length * s));

    ctx.beginPath();
    ctx.moveTo(shaftFrom.x * s, shaftFrom.y * s);
    ctx.lineTo(shaftTo.x * s, shaftTo.y * s);
    ctx.stroke();

    if (head.length === 3) {
      ctx.beginPath();
      ctx.moveTo(head[0].x * s, head[0].y * s);
      ctx.lineTo(head[1].x * s, head[1].y * s);
      ctx.lineTo(head[2].x * s, head[2].y * s);
      ctx.closePath();
      ctx.fill();
    }
    // A headless line ends in a ring with a dot inside it, at both ends. The
    // rings are solid whatever the shaft does, so the dash pattern comes off.
    if (arrow.marker) {
      const { ringRadius, ringWidth, dotRadius } = arrow.marker;
      ctx.setLineDash([]);
      ctx.lineWidth = ringWidth * s;
      for (const point of arrow.markers.map(at)) {
        ctx.beginPath();
        ctx.arc(point.x * s, point.y * s, ringRadius * s, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(point.x * s, point.y * s, dotRadius * s, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    if (label && head.length === 3) {
      const badge = arrowLabelBadge(shaftFrom, shaftTo, label);
      ctx.beginPath();
      ctx.arc(badge.center.x * s, badge.center.y * s, badge.radius * s, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = labelColor;
      ctx.font = `700 ${badge.fontSize * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Measured too, in case the font's digits run wider than the estimate.
      const room = badge.radius * 2 * 0.8 * s;
      const width = ctx.measureText(label).width;
      if (width > room) {
        ctx.font = `700 ${(badge.fontSize * s * room) / width}px system-ui, sans-serif`;
      }
      ctx.fillText(label, badge.center.x * s, badge.center.y * s);
    }
    ctx.restore();
  }

  /** Lays an X over a square, in board units scaled up to pixels. */
  private drawCross(
    ctx: CanvasRenderingContext2D,
    square: string,
    color: string,
    black: boolean,
  ): void {
    const cross = squareCrossGeometry(square);
    const s = RENDER_SQUARE;
    // From black's side the board is rotated 180°, so mirror every point.
    const at = (point: { x: number; y: number }) => (black ? flipPoint(point) : point);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = cross.strokeWidth * s;
    ctx.lineCap = 'round';
    for (const [from, to] of cross.lines) {
      const a = at(from);
      const b = at(to);
      ctx.beginPath();
      ctx.moveTo(a.x * s, a.y * s);
      ctx.lineTo(b.x * s, b.y * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Traces a piece's outline over a square, dashed and upright from either side. */
  private drawOutline(
    ctx: CanvasRenderingContext2D,
    square: string,
    piece: OutlinePiece,
    color: string,
    orientation: BoardOrientation,
  ): void {
    const index = gridIndex(square, orientation);
    if (index === null) {
      return;
    }
    ctx.save();
    ctx.translate((index % 8) * RENDER_SQUARE, Math.floor(index / 8) * RENDER_SQUARE);
    ctx.scale(RENDER_SQUARE / PIECE_OUTLINE_SIZE, RENDER_SQUARE / PIECE_OUTLINE_SIZE);
    ctx.strokeStyle = color;
    ctx.lineWidth = PIECE_OUTLINE_STROKE;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.setLineDash([...PIECE_OUTLINE_DASH]);
    for (const path of PIECE_OUTLINES[piece]) {
      ctx.stroke(new Path2D(path));
    }
    ctx.restore();
  }

  /** Frames the board in the divergent color to match the live board's outline. */
  private drawHighlightBorder(ctx: CanvasRenderingContext2D): void {
    const width = RENDER_SQUARE * 0.12;
    const inset = width / 2;
    ctx.save();
    ctx.strokeStyle = DIVERGENT_MOVE_COLOR;
    ctx.lineWidth = width;
    ctx.strokeRect(inset, inset, BOARD_SIZE - width, BOARD_SIZE - width);
    ctx.restore();
  }

  private pieceImage(path: string): Promise<HTMLImageElement> {
    const existing = this.imageByPath.get(path);
    if (existing) {
      return existing;
    }
    const pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(RENDER_SQUARE, RENDER_SQUARE);
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load piece asset ${path}.`));
      img.src = path;
    });
    this.imageByPath.set(path, pending);
    return pending;
  }

  private async hash(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
