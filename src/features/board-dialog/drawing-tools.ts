import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import {
  ARROW_LABEL_MAX_LENGTH,
  ARROW_STYLE_ORDER,
  ARROW_STYLES,
  DRAWING_COLOR_ORDER,
  DRAWING_COLORS,
  OUTLINE_PIECE_ORDER,
  OUTLINE_PIECES,
  SQUARE_MARK_KIND_ORDER,
  SQUARE_MARK_KINDS,
  squareMarkKind,
} from '../../core/board-drawing';
import { PIECE_OUTLINES } from '../../core/board-assets';
import { DrawingPreference } from './drawing-preference';

/**
 * The options for drawing on a board with the right mouse button: color, line
 * style, the number on an arrow, and the mark a square gets. Every board that
 * can be drawn on shares them through {@link DrawingPreference}.
 */
@Component({
  selector: 'app-drawing-tools',
  imports: [MatCheckboxModule, MatFormFieldModule, MatInputModule, MatRadioModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="drawing-tools__option drawing-tools__option--wide">
      <p [id]="ids.color" class="drawing-tools__label">Color</p>
      <mat-radio-group
        class="drawing-tools__choices"
        [attr.aria-labelledby]="ids.color"
        [value]="drawPref.color()"
        (change)="drawPref.color.set($event.value)"
      >
        @for (color of drawingColors; track color) {
          <mat-radio-button [value]="color">
            <span
              class="drawing-tools__swatch"
              [style.background]="drawingPalette[color].arrow"
              aria-hidden="true"
            ></span>
            {{ drawingPalette[color].label }}
          </mat-radio-button>
        }
      </mat-radio-group>
    </div>
    <div class="drawing-tools__option">
      <p [id]="ids.line" class="drawing-tools__label">Line</p>
      <mat-radio-group
        class="drawing-tools__choices"
        [attr.aria-labelledby]="ids.line"
        [value]="drawPref.arrowStyle()"
        (change)="drawPref.arrowStyle.set($event.value)"
      >
        @for (style of arrowStyles; track style) {
          <mat-radio-button [value]="style">
            <!-- The line as it will be drawn, in whichever color is selected. -->
            <svg
              class="drawing-tools__line"
              viewBox="0 0 24 10"
              aria-hidden="true"
              [attr.stroke]="drawingPalette[drawPref.color()].arrow"
              [attr.fill]="drawingPalette[drawPref.color()].arrow"
            >
              @if (style === 'dashed') {
                <line x1="4.6" y1="5" x2="19.4" y2="5" stroke-width="1.1" stroke-dasharray="3 2" />
                <circle cx="3" cy="5" r="2.4" fill="none" stroke-width="0.9" />
                <circle cx="3" cy="5" r="1.1" stroke="none" />
                <circle cx="21" cy="5" r="2.4" fill="none" stroke-width="0.9" />
                <circle cx="21" cy="5" r="1.1" stroke="none" />
              } @else {
                <line x1="2" y1="5" x2="15.6" y2="5" stroke-width="2.6" stroke-linecap="round" />
                <polygon points="22,5 15,1.6 15,8.4" stroke="none" />
              }
            </svg>
            {{ arrowStyleLabels[style].label }}
          </mat-radio-button>
        }
      </mat-radio-group>
    </div>
    <!-- A number on the shaft; arrows only, since a dashed link has no room for one. -->
    <div class="drawing-tools__option">
      <p [id]="ids.number" class="drawing-tools__label">Number on arrow</p>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="drawing-tools__number">
        <input
          #arrowLabelInput
          matInput
          type="text"
          inputmode="numeric"
          autocomplete="off"
          [attr.maxlength]="arrowLabelMax"
          [attr.aria-labelledby]="ids.number"
          [attr.aria-describedby]="ids.numberHint"
          [value]="drawPref.arrowLabel()"
          [disabled]="drawPref.arrowStyle() !== 'solid'"
          (input)="onArrowLabel(arrowLabelInput)"
        />
        <mat-hint [id]="ids.numberHint">
          {{ drawPref.arrowStyle() === 'solid' ? 'Blank for none' : 'Arrows only' }}
        </mat-hint>
      </mat-form-field>
      <mat-checkbox
        [checked]="drawPref.autoIncrement()"
        [disabled]="drawPref.arrowStyle() !== 'solid'"
        (change)="drawPref.setAutoIncrement($event.checked)"
      >
        Auto-increment
      </mat-checkbox>
    </div>
    <div class="drawing-tools__option drawing-tools__option--wide">
      <p [id]="ids.square" class="drawing-tools__label">Square</p>
      <mat-radio-group
        class="drawing-tools__choices"
        [attr.aria-labelledby]="ids.square"
        [value]="markKind()"
        (change)="drawPref.setMarkKind($event.value)"
      >
        @for (mark of squareMarks; track mark) {
          <mat-radio-button [value]="mark">
            @if (mark === 'cross') {
              <svg
                class="drawing-tools__mark"
                viewBox="0 0 10 10"
                aria-hidden="true"
                [attr.stroke]="drawingPalette[drawPref.color()].arrow"
              >
                <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke-width="1.6" />
                <line x1="1.5" y1="8.5" x2="8.5" y2="1.5" stroke-width="1.6" />
              </svg>
            } @else if (mark === 'outline') {
              <svg
                class="drawing-tools__mark"
                viewBox="0 0 45 45"
                aria-hidden="true"
                fill="none"
                stroke-width="3"
                stroke-dasharray="4 3"
                [attr.stroke]="drawingPalette[drawPref.color()].arrow"
              >
                @for (path of pieceOutlines[drawPref.outlinePiece()]; track $index) {
                  <path [attr.d]="path" />
                }
              </svg>
            } @else {
              <span
                class="drawing-tools__mark drawing-tools__mark--fill"
                [style.background]="drawingPalette[drawPref.color()].fill"
                aria-hidden="true"
              ></span>
            }
            {{ squareMarkLabels[mark].label }}
          </mat-radio-button>
        }
      </mat-radio-group>
      @if (markKind() === 'outline') {
        <p [id]="ids.piece" class="drawing-tools__label">Piece</p>
        <mat-radio-group
          class="drawing-tools__choices"
          [attr.aria-labelledby]="ids.piece"
          [value]="drawPref.outlinePiece()"
          (change)="drawPref.setOutlinePiece($event.value)"
        >
          @for (piece of outlinePieces; track piece) {
            <mat-radio-button [value]="piece">
              <svg
                class="drawing-tools__piece"
                viewBox="0 0 45 45"
                aria-hidden="true"
                fill="none"
                stroke-width="2.5"
                stroke-dasharray="4 3"
                [attr.stroke]="drawingPalette[drawPref.color()].arrow"
              >
                @for (path of pieceOutlines[piece]; track $index) {
                  <path [attr.d]="path" />
                }
              </svg>
              {{ outlinePieceLabels[piece].label }}
            </mat-radio-button>
          }
        </mat-radio-group>
      }
    </div>
  `,
  styles: `
    /* The drawing options in two columns, the wide ones across both. */
    :host {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem 1rem;
    }

    .drawing-tools__option {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }

    .drawing-tools__option--wide {
      grid-column: 1 / -1;
    }

    .drawing-tools__number {
      width: 7rem;
    }

    .drawing-tools__choices {
      display: flex;
      flex-wrap: wrap;
      column-gap: 0.25rem;
    }

    .drawing-tools__label {
      margin: 0;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    /* Preview of a square mark, in whichever color is selected. */
    .drawing-tools__mark {
      display: inline-block;
      width: 0.875rem;
      height: 0.875rem;
      margin-right: 0.25rem;
      vertical-align: -0.125rem;
      stroke-linecap: round;
    }

    .drawing-tools__mark--fill {
      border: 1px solid var(--mat-sys-outline);
      border-radius: 0.125rem;
    }

    /* Preview of a piece outline, large enough to tell the pieces apart. */
    .drawing-tools__piece {
      display: inline-block;
      width: 1.25rem;
      height: 1.25rem;
      margin-right: 0.25rem;
      vertical-align: -0.3rem;
    }

    /* Preview of a line, drawn the way the board draws it. */
    .drawing-tools__line {
      display: inline-block;
      width: 1.75rem;
      height: 0.875rem;
      margin-right: 0.25rem;
      vertical-align: -0.125rem;
    }

    .drawing-tools__swatch {
      display: inline-block;
      width: 0.875rem;
      height: 0.875rem;
      margin-right: 0.25rem;
      border-radius: 50%;
      border: 1px solid var(--mat-sys-outline);
      vertical-align: -0.125rem;
    }
  `,
})
export class DrawingTools {
  /** How the right mouse button draws, remembered across boards. */
  protected readonly drawPref = inject(DrawingPreference);

  /** Ids for this instance's labels, unique so two panels on one page don't collide. */
  private readonly uid = crypto.randomUUID();
  protected readonly ids = {
    color: `drawing-color-${this.uid}`,
    line: `drawing-line-${this.uid}`,
    number: `drawing-number-${this.uid}`,
    numberHint: `drawing-number-hint-${this.uid}`,
    square: `drawing-square-${this.uid}`,
    piece: `drawing-piece-${this.uid}`,
  };

  protected readonly drawingColors = DRAWING_COLOR_ORDER;
  protected readonly drawingPalette = DRAWING_COLORS;
  protected readonly arrowStyles = ARROW_STYLE_ORDER;
  protected readonly arrowStyleLabels = ARROW_STYLES;
  protected readonly arrowLabelMax = ARROW_LABEL_MAX_LENGTH;
  protected readonly squareMarks = SQUARE_MARK_KIND_ORDER;
  protected readonly squareMarkLabels = SQUARE_MARK_KINDS;
  protected readonly outlinePieces = OUTLINE_PIECE_ORDER;
  protected readonly outlinePieceLabels = OUTLINE_PIECES;
  protected readonly pieceOutlines = PIECE_OUTLINES;
  /** The kind of mark a right-clicked square gets, as the mark picker shows it. */
  protected readonly markKind = computed(() => squareMarkKind(this.drawPref.squareMark()));

  /** Keeps the arrow number to its digits, in the field as well as the preference. */
  protected onArrowLabel(input: HTMLInputElement): void {
    input.value = this.drawPref.setArrowLabel(input.value);
  }
}
