import { inject, Injectable } from '@angular/core';
import { getDownloadURL, ref, Storage, StorageError, uploadBytes } from '@angular/fire/storage';
import { ChessService } from './chess-service';
import { DARK_SQUARE, LIGHT_SQUARE, pieceAssetPath, SQUARE_SIZE } from './board-assets';

const BOARD_SIZE = SQUARE_SIZE * 8;

function isNotFound(err: unknown): boolean {
  return err instanceof StorageError && err.code === 'storage/object-not-found';
}

/**
 * Renders chess positions to PNG images and persists them to Cloud Storage.
 *
 * Images are content-addressed by a hash of their FEN (`moves/{hash}.png`), so
 * a given position is rendered and uploaded at most once and then reused across
 * every entry, file, and save. Rendering happens in the browser on a canvas
 * using the same bundled piece SVGs the live board uses.
 */
@Injectable({ providedIn: 'root' })
export class BoardImageService {
  private readonly storage = inject(Storage);
  private readonly chess = inject(ChessService);

  /** In-flight/resolved download URL per FEN, so concurrent asks dedupe. */
  private readonly urlByFen = new Map<string, Promise<string>>();
  /** Cached decoded piece images, keyed by asset path. */
  private readonly imageByPath = new Map<string, Promise<HTMLImageElement>>();

  /** Resolves a Storage download URL for every FEN, in order. */
  urlsForFens(fens: readonly string[]): Promise<string[]> {
    return Promise.all(fens.map((fen) => this.urlForFen(fen)));
  }

  private urlForFen(fen: string): Promise<string> {
    const existing = this.urlByFen.get(fen);
    if (existing) {
      return existing;
    }
    const pending = this.resolveUrl(fen);
    this.urlByFen.set(fen, pending);
    return pending;
  }

  private async resolveUrl(fen: string): Promise<string> {
    const fileRef = ref(this.storage, `moves/${await this.hash(fen)}.png`);
    try {
      // Reuse an already-uploaded render (content-addressed, so it's this FEN).
      return await getDownloadURL(fileRef);
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
    }
    const blob = await this.render(fen);
    await uploadBytes(fileRef, blob, { contentType: 'image/png' });
    return getDownloadURL(fileRef);
  }

  private async render(fen: string): Promise<Blob> {
    const rows = this.chess.fenToSquares(fen);
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
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Board image encoding failed.'))),
        'image/png',
      );
    });
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
