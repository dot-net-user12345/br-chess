import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BoardOrientation } from '../../core/chess-models';
import { patternToFen, PositionPattern } from '../../core/position-pattern';
import { PositionFilterDialog, PositionFilterDialogData } from './position-filter-dialog';

/**
 * The position filter's controls: a button that opens the board to build the
 * pattern on, the pattern as the board part of a FEN, and a Clear button.
 */
@Component({
  selector: 'app-position-filter-bar',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'position-filter-bar', role: 'group', 'aria-label': 'Position filter' },
  template: `
    <button matButton="outlined" type="button" aria-haspopup="dialog" (click)="open()">
      <mat-icon>grid_on</mat-icon>
      Filter by position
    </button>
    @if (active()) {
      <code class="position-filter-bar__fen">{{ fen() }}</code>
      <!-- A button, so the explanation is reachable by keyboard as well as hover. -->
      <button
        matIconButton
        type="button"
        class="position-filter-bar__help"
        aria-label="About this FEN"
        matTooltip="Only the board part of a FEN: the pieces you placed, rank 8 first. It needn't be a legal position — it can have no kings, or several — since it only lists the squares a move's board must match."
      >
        <mat-icon>help_outline</mat-icon>
      </button>
    }
    <button matButton type="button" (click)="pattern.set({})" [disabled]="!active()">
      <mat-icon>close</mat-icon>
      Clear
    </button>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }

    /* Selectable, so it can be copied out; never wrapped mid-rank. */
    .position-filter-bar__fen {
      flex: 0 1 auto;
      min-width: 0;
      overflow-x: auto;
      white-space: nowrap;
      font: var(--mat-sys-body-medium);
      font-family: ui-monospace, monospace;
      user-select: all;
    }

    .position-filter-bar__help {
      flex: 0 0 auto;
      margin-left: -0.5rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PositionFilterBar {
  private readonly dialog = inject(MatDialog);

  /** The pieces a board must have in place; empty when the filter is off. */
  readonly pattern = model<PositionPattern>({});
  /** Side the dialog's board is viewed from. */
  readonly orientation = input<BoardOrientation>('white');

  protected readonly active = computed(() => Object.keys(this.pattern()).length > 0);
  protected readonly fen = computed(() => patternToFen(this.pattern()));

  /** Opens the board to build the pattern on; Apply puts it in force. */
  protected open(): void {
    const data: PositionFilterDialogData = {
      pattern: this.pattern(),
      orientation: this.orientation(),
    };
    this.dialog
      .open<PositionFilterDialog, PositionFilterDialogData, PositionPattern>(PositionFilterDialog, {
        data,
        panelClass: 'position-filter-dialog-panel',
        width: '100vw',
        height: '100dvh',
        maxWidth: '100vw',
        maxHeight: '100dvh',
      })
      .afterClosed()
      .subscribe((pattern) => {
        if (pattern) {
          this.pattern.set(pattern);
        }
      });
  }
}
