import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { placements } from '../../core/board-position';
import { BoardOrientation } from '../../core/chess-models';
import { patternToFen, PositionPattern } from '../../core/position-pattern';
import { PositionFilterDialog, PositionFilterDialogData } from './position-filter-dialog';

/**
 * Sets up a board on the same full-screen board as the position filter, with
 * pieces only. The board needn't be a legal position.
 */
@Injectable({ providedIn: 'root' })
export class BoardSetup {
  private readonly dialog = inject(MatDialog);

  /**
   * Opens the board with `fen`'s pieces on it. Resolves the board part of a
   * FEN when the user is done, or null when they cancel.
   */
  async open(fen: string, orientation: BoardOrientation): Promise<string | null> {
    const data: PositionFilterDialogData = {
      pattern: Object.fromEntries(placements(fen)) as PositionPattern,
      orientation,
      mode: 'setup',
    };
    const pattern = await firstValueFrom(
      this.dialog
        .open<PositionFilterDialog, PositionFilterDialogData, PositionPattern>(
          PositionFilterDialog,
          {
            data,
            panelClass: 'position-filter-dialog-panel',
            width: '100vw',
            height: '100dvh',
            maxWidth: '100vw',
            maxHeight: '100dvh',
          },
        )
        .afterClosed(),
    );
    return pattern ? patternToFen(pattern) : null;
  }
}
