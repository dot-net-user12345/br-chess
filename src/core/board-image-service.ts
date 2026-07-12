import { inject, Injectable } from '@angular/core';
import { getDownloadURL, ref, Storage, StorageError, uploadBytes } from '@angular/fire/storage';
import { ChessService } from './chess-service';
import {
  DARK_SQUARE,
  LIGHT_SQUARE,
  moveArrowGeometry,
  MOVE_ARROW_COLOR,
  pieceAssetPath,
  SQUARE_SIZE,
} from './board-assets';
import { GamePosition } from './chess-models';

const BOARD_SIZE = SQUARE_SIZE * 8;

function isNotFound(err: unknown): boolean {
  return err instanceof StorageError && err.code === 'storage/object-not-found';
}

/**
 * Renders chess positions to PNG images and persists them to Cloud Storage.
 *
 * Each image shows the board plus a colored arrow from the move's origin to its
 * destination square. Images are content-addressed by a hash of the position's
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

  /** Resolves a Storage download URL for every position, in order. */
  urlsForPositions(positions: readonly GamePosition[]): Promise<string[]> {
    return Promise.all(positions.map((position) => this.urlForPosition(position)));
  }

  private urlForPosition(position: GamePosition): Promise<string> {
    const key = `${position.fen}|${position.from ?? ''}${position.to ?? ''}`;
    const existing = this.urlByKey.get(key);
    if (existing) {
      return existing;
    }
    const pending = this.resolveUrl(position, key);
    this.urlByKey.set(key, pending);
    return pending;
  }

  private async resolveUrl(position: GamePosition, key: string): Promise<string> {
    const fileRef = ref(this.storage, `moves/${await this.hash(key)}.png`);
    try {
      // Reuse an already-uploaded render (content-addressed, so it's this position+move).
      return await getDownloadURL(fileRef);
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
    }
    const blob = await this.render(position);
    await uploadBytes(fileRef, blob, { contentType: 'image/png' });
    return getDownloadURL(fileRef);
  }

  private async render(position: GamePosition): Promise<Blob> {
    const rows = this.chess.fenToSquares(position.fen);
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not acquire a 2D canvas context to render the board.');
    }
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const x = file * SQUARE_SIZE;
        const y = rank * SQUARE_SIZE;
        ctx.fillStyle = (rank + file) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE;
        ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
        const piece = rows[rank]?.[file] ?? null;
        if (piece) {
          ctx.drawImage(await this.pieceImage(pieceAssetPath(piece)), x, y, SQUARE_SIZE, SQUARE_SIZE);
        }
      }
    }
    if (position.from && position.to) {
      this.drawArrow(ctx, position.from, position.to);
    }
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Board image encoding failed.'))),
        'image/png',
      );
    });
  }

  /** Draws a colored arrow with a triangular head from the `from` to the `to` square. */
  private drawArrow(ctx: CanvasRenderingContext2D, from: string, to: string): void {
    // Geometry is in board units (1 unit = 1 square); scale up to pixels.
    const arrow = moveArrowGeometry(from, to);
    const s = SQUARE_SIZE;

    ctx.save();
    ctx.strokeStyle = MOVE_ARROW_COLOR;
    ctx.fillStyle = MOVE_ARROW_COLOR;
    ctx.lineWidth = arrow.strokeWidth * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(arrow.shaftFrom.x * s, arrow.shaftFrom.y * s);
    ctx.lineTo(arrow.shaftTo.x * s, arrow.shaftTo.y * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(arrow.head[0].x * s, arrow.head[0].y * s);
    ctx.lineTo(arrow.head[1].x * s, arrow.head[1].y * s);
    ctx.lineTo(arrow.head[2].x * s, arrow.head[2].y * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private pieceImage(path: string): Promise<HTMLImageElement> {
    const existing = this.imageByPath.get(path);
    if (existing) {
      return existing;
    }
    const pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(SQUARE_SIZE, SQUARE_SIZE);
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
