import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { ChessService } from '../../core/chess-service';
import { BoardOrientation } from '../../core/chess-models';
import { UploadedImage } from '../../core/workspace-models';
import {
  ARROW_STYLE_ORDER,
  ARROW_STYLES,
  BoardDrawing,
  DRAWING_COLOR_ORDER,
  DRAWING_COLORS,
  EMPTY_DRAWING,
  isEmptyDrawing,
  ARROW_LABEL_MAX_LENGTH,
  OUTLINE_PIECE_ORDER,
  OUTLINE_PIECES,
  SQUARE_MARK_KIND_ORDER,
  SQUARE_MARK_KINDS,
  squareMarkKind,
} from '../../core/board-drawing';
import { PIECE_OUTLINES } from '../../core/board-assets';
import { DrawingPreference } from './drawing-preference';
import { ChessBoard } from '../chess-board/chess-board';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { imageFilesIn } from '../../shared/image-drop';
import { MoveImages } from './move-images';
import { LineMove, LineMoves } from '../line-moves/line-moves';

/** One board position the dialog can display. */
export interface BoardDialogTile {
  /** Half-move index this board sits at (0 = starting position); keys its caption. */
  readonly ply: number;
  readonly fen: string;
  readonly caption: string;
  /** The move that reached this board, or null at the starting position. */
  readonly san: string | null;
  readonly from: string | null;
  readonly to: string | null;
  /** Whether this move diverges from the compared line (drawn in the accent color). */
  readonly highlighted?: boolean;
}

/** Data passed to {@link BoardDialog}: the boards, where to start, and caption plumbing. */
export interface BoardDialogData {
  readonly tiles: readonly BoardDialogTile[];
  readonly index: number;
  /** Current captions, keyed by ply. */
  readonly captions: Readonly<Record<number, string>>;
  /** Called with the full updated caption map whenever the user saves one. */
  readonly onCaptionChange: (captions: Record<number, string>) => void;
  /** Side to view every board from; defaults to white when absent. */
  readonly orientation?: BoardOrientation;
  /** Plies currently marked as focus points. */
  readonly focusPlies?: readonly number[];
  /** Called with the full updated, ascending focus-point list whenever one is toggled. */
  readonly onFocusChange?: (focusPlies: number[]) => void;
  /** Each move's own images, keyed by ply. */
  readonly moveImages?: Readonly<Record<number, readonly UploadedImage[]>>;
  /** Called with the full updated image map whenever a move's images change. */
  readonly onMoveImagesChange?: (moveImages: Record<number, readonly UploadedImage[]>) => void;
  /** Each move's saved drawing (colored squares and arrows), keyed by ply. */
  readonly drawings?: Readonly<Record<number, BoardDrawing>>;
  /** Called with the full updated drawing map when the user saves drawing edits. */
  readonly onDrawingsChange?: (drawings: Record<number, BoardDrawing>) => void;
  /** The line these boards come from, listed beside the board when given. */
  readonly line?: { readonly label: string };
}

/** A board position shown large in a modal, navigable through the whole game. */
@Component({
  selector: 'app-board-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    ReactiveFormsModule,
    ChessBoard,
    MoveImages,
    LineMoves,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Arrow keys are left to the caption field and the rest of the dialog;
    // moving between moves is done with the bar's buttons.
    '(keydown.home)': 'onHomeEnd($event, true)',
    '(keydown.end)': 'onHomeEnd($event, false)',
    '(document:paste)': 'onPaste($event)',
  },
  template: `
    <div class="board-dialog" [class.board-dialog--with-line]="line">
      <div class="board-dialog__bar">
        <button
          matIconButton
          type="button"
          (click)="first()"
          [disabled]="!hasPrev()"
          aria-label="First position"
        >
          <mat-icon>first_page</mat-icon>
        </button>
        <button
          matIconButton
          type="button"
          (click)="prev()"
          [disabled]="!hasPrev()"
          aria-label="Previous position"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
        <h2 class="board-dialog__title">{{ current().caption }}</h2>
        <span class="board-dialog__spacer"></span>
        <button
          matIconButton
          type="button"
          (click)="next()"
          [disabled]="!hasNext()"
          aria-label="Next position"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
        <button
          matIconButton
          type="button"
          (click)="last()"
          [disabled]="!hasNext()"
          aria-label="Last position"
        >
          <mat-icon>last_page</mat-icon>
        </button>
        @if (canFocus) {
          <button
            matButton
            type="button"
            [class.board-dialog__focus--on]="isFocus()"
            (click)="toggleFocus()"
            [disabled]="current().san === null"
            [attr.aria-pressed]="isFocus()"
          >
            <mat-icon>{{ isFocus() ? 'flag' : 'outlined_flag' }}</mat-icon>
            Focus point
          </button>
        }
        <button
          matButton
          type="button"
          (click)="copyFen()"
          [attr.aria-label]="copied() === 'fen' ? 'FEN copied' : 'Copy FEN'"
        >
          <mat-icon>{{ copied() === 'fen' ? 'check' : 'content_copy' }}</mat-icon>
          {{ copied() === 'fen' ? 'Copied' : 'Copy FEN' }}
        </button>
        <button
          matButton
          type="button"
          (click)="copyPgn()"
          [disabled]="pgnToHere().length === 0"
          [attr.aria-label]="copied() === 'pgn' ? 'PGN copied' : 'Copy PGN up to this move'"
        >
          <mat-icon>{{ copied() === 'pgn' ? 'check' : 'content_copy' }}</mat-icon>
          {{ copied() === 'pgn' ? 'Copied' : 'Copy PGN' }}
        </button>
        <button matIconButton type="button" aria-label="Close" (click)="requestClose()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="board-dialog__body">
        @if (line) {
          <nav class="board-dialog__line" [attr.aria-label]="'Moves of ' + line.label">
            <h3 class="board-dialog__caption-heading">{{ line.label }}</h3>
            <app-line-moves
              class="board-dialog__line-moves"
              [moves]="lineMoves"
              [currentPly]="current().ply"
              [interactive]="true"
              (select)="goToPly($event)"
            />
          </nav>
        }
        <div class="board-dialog__board">
          <app-chess-board
            [fen]="current().fen"
            [caption]="current().caption"
            [from]="current().from"
            [to]="current().to"
            [highlighted]="current().highlighted ?? false"
            [orientation]="orientation()"
            [drawing]="currentDrawing()"
            [drawable]="canDraw"
            [drawColor]="drawPref.color()"
            [drawArrowStyle]="drawPref.arrowStyle()"
            [drawArrowLabel]="drawPref.arrowLabel()"
            [drawSquareMark]="drawPref.squareMark()"
            (drawingChange)="onDraw($event)"
          />
        </div>
        <div class="board-dialog__caption">
          <h3 class="board-dialog__caption-heading">Caption</h3>
          @if (showInput()) {
            <mat-form-field appearance="outline" class="board-dialog__caption-field">
              <mat-label>Caption</mat-label>
              <textarea
                matInput
                [formControl]="captionControl"
                rows="4"
                [attr.aria-label]="'Caption for ' + current().caption"
              ></textarea>
            </mat-form-field>
            <div class="board-dialog__caption-actions">
              <button matButton="filled" type="button" (click)="saveCaption()">Save</button>
              @if (savedCaption()) {
                <button matButton type="button" (click)="cancelEdit()">Cancel</button>
              }
            </div>
          } @else {
            <p class="board-dialog__caption-text">{{ savedCaption() }}</p>
            <div class="board-dialog__caption-actions">
              <button matButton="outlined" type="button" (click)="startEdit()">
                <mat-icon>edit</mat-icon>
                Edit
              </button>
            </div>
          }
          @if (canDraw) {
            <section class="board-dialog__drawing" aria-labelledby="board-dialog-drawing-heading">
              <h3 id="board-dialog-drawing-heading" class="board-dialog__caption-heading">
                Drawing
              </h3>
              <p class="board-dialog__drawing-hint">
                Right-click a square to mark it; right-drag between squares to draw a line.
              </p>
              <div class="board-dialog__options">
              <div class="board-dialog__option board-dialog__option--wide">
              <p id="board-dialog-color-label" class="board-dialog__drawing-label">Color</p>
              <mat-radio-group
                class="board-dialog__colors"
                aria-labelledby="board-dialog-color-label"
                [value]="drawPref.color()"
                (change)="drawPref.color.set($event.value)"
              >
                @for (color of drawingColors; track color) {
                  <mat-radio-button [value]="color" class="board-dialog__color">
                    <span
                      class="board-dialog__swatch"
                      [style.background]="drawingPalette[color].arrow"
                      aria-hidden="true"
                    ></span>
                    {{ drawingPalette[color].label }}
                  </mat-radio-button>
                }
              </mat-radio-group>
              </div>
              <div class="board-dialog__option">
              <p id="board-dialog-arrow-label" class="board-dialog__drawing-label">Line</p>
              <mat-radio-group
                class="board-dialog__colors"
                aria-labelledby="board-dialog-arrow-label"
                [value]="drawPref.arrowStyle()"
                (change)="drawPref.arrowStyle.set($event.value)"
              >
                @for (style of arrowStyles; track style) {
                  <mat-radio-button [value]="style" class="board-dialog__color">
                    <!-- The line as it will be drawn, in whichever color is selected. -->
                    <svg
                      class="board-dialog__line"
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
              <div class="board-dialog__option">
                <p id="board-dialog-number-label" class="board-dialog__drawing-label">Number on arrow</p>
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="board-dialog__number">
                  <input
                    #arrowLabelInput
                    matInput
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    [attr.maxlength]="arrowLabelMax"
                    aria-labelledby="board-dialog-number-label"
                    aria-describedby="board-dialog-number-hint"
                    [value]="drawPref.arrowLabel()"
                    [disabled]="drawPref.arrowStyle() !== 'solid'"
                    (input)="onArrowLabel(arrowLabelInput)"
                  />
                  <mat-hint id="board-dialog-number-hint">
                    {{ drawPref.arrowStyle() === 'solid' ? 'Blank for none' : 'Arrows only' }}
                  </mat-hint>
                </mat-form-field>
              </div>
              <div class="board-dialog__option board-dialog__option--wide">
              <p id="board-dialog-square-label" class="board-dialog__drawing-label">Square</p>
              <mat-radio-group
                class="board-dialog__colors"
                aria-labelledby="board-dialog-square-label"
                [value]="markKind()"
                (change)="drawPref.setMarkKind($event.value)"
              >
                @for (mark of squareMarks; track mark) {
                  <mat-radio-button [value]="mark" class="board-dialog__color">
                    @if (mark === 'cross') {
                      <svg
                        class="board-dialog__mark"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                        [attr.stroke]="drawingPalette[drawPref.color()].arrow"
                      >
                        <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke-width="1.6" />
                        <line x1="1.5" y1="8.5" x2="8.5" y2="1.5" stroke-width="1.6" />
                      </svg>
                    } @else if (mark === 'outline') {
                      <svg
                        class="board-dialog__mark"
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
                        class="board-dialog__mark board-dialog__mark--fill"
                        [style.background]="drawingPalette[drawPref.color()].fill"
                        aria-hidden="true"
                      ></span>
                    }
                    {{ squareMarkLabels[mark].label }}
                  </mat-radio-button>
                }
              </mat-radio-group>
              @if (markKind() === 'outline') {
                <p id="board-dialog-piece-label" class="board-dialog__drawing-label">Piece</p>
                <mat-radio-group
                  class="board-dialog__colors"
                  aria-labelledby="board-dialog-piece-label"
                  [value]="drawPref.outlinePiece()"
                  (change)="drawPref.setOutlinePiece($event.value)"
                >
                  @for (piece of outlinePieces; track piece) {
                    <mat-radio-button [value]="piece" class="board-dialog__color">
                      <svg
                        class="board-dialog__piece"
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
              </div>
              @if (hasUnsavedDrawings()) {
                <p class="board-dialog__drawing-status" role="status">Unsaved drawing changes</p>
              }
              <div class="board-dialog__caption-actions">
                @if (hasUnsavedDrawings()) {
                  <button matButton="filled" type="button" (click)="saveDrawings()">Save</button>
                  <button matButton type="button" (click)="discardDrawings()">Discard</button>
                }
                <button
                  matButton
                  type="button"
                  [disabled]="currentDrawingEmpty()"
                  (click)="clearDrawing()"
                >
                  <mat-icon>ink_eraser</mat-icon>
                  Clear
                </button>
              </div>
            </section>
          }
          @if (canAddImages && current().san !== null) {
            <app-move-images
              class="board-dialog__images"
              [images]="currentImages()"
              [move]="current().caption"
              [ply]="current().ply"
              (imagesChange)="saveImages($event.ply, $event.images)"
            />
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .board-dialog {
      /* Fixed-height title bar; the square board fills the rest of the dialog,
         and bar + board together stay within 98% of the smaller viewport side. */
      --bar-height: 3.25rem;
      /* Reserved for the caption column (its own width + gap + padding), so the
         board never grows so wide that the caption is pushed off the surface. */
      --caption-column: 31rem;
      /* Reserved for the line's move list, when there is one. */
      --line-column: 0rem;
      --board-size: min(
        calc(97vw - var(--caption-column) - var(--line-column)),
        calc(98vh - var(--bar-height))
      );
      display: flex;
      flex-direction: column;
    }

    .board-dialog--with-line {
      --line-column: 15rem;
    }

    /* The line's moves, as tall as the board, scrolling within it. */
    .board-dialog__line {
      flex: 0 0 14rem;
      box-sizing: border-box;
      max-height: var(--board-size);
      padding: 1rem 0 1rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .board-dialog__line-moves {
      flex: 1 1 auto;
      min-height: 0;
    }

    .board-dialog__bar {
      flex: 0 0 var(--bar-height);
      box-sizing: border-box;
      height: var(--bar-height);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.25rem;
    }

    .board-dialog__title {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
      /* Let the caption be the part that gives way when the bar runs out of
         room, rather than pushing the copy buttons off the surface. */
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .board-dialog__spacer {
      flex: 1 1 auto;
    }

    /* Marked: filled in the same red the move gets in the explorer and Lines tab. */
    .board-dialog__focus--on {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }

    .board-dialog__body {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }

    .board-dialog__board {
      /* Sized so the board plus the reserved caption column fit within 97vw, and
         so board + title bar fit within 98vh. Whichever is smaller wins, keeping
         the caption always beside the board rather than wrapping off-surface. */
      flex: 0 0 auto;
      width: var(--board-size);
      aspect-ratio: 1;
    }

    .board-dialog__caption {
      /* Fixed width so read-only text wraps to the same width as the input
         instead of its long max-content stretching the dialog wide. */
      flex: 0 0 30rem;
      max-width: 30rem;
      /* The dialog surface has padding: 0 (so the board can fill it) and
         overflow: hidden, which would jam this column against the top/right
         edges and clip the form field's floating label. Inset it here. */
      padding: 1rem 1rem 1rem 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      /* No taller than the board beside it; the images scroll within it. */
      box-sizing: border-box;
      max-height: var(--board-size);
      overflow-y: auto;
    }

    .board-dialog__drawing {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    /* The drawing options in two columns, the wide ones across both. */
    .board-dialog__options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem 1rem;
    }

    .board-dialog__option {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }

    .board-dialog__option--wide {
      grid-column: 1 / -1;
    }

    .board-dialog__number {
      width: 7rem;
    }

    .board-dialog__colors {
      display: flex;
      flex-wrap: wrap;
      column-gap: 0.25rem;
    }

    /* Preview of a square mark, in whichever color is selected. */
    .board-dialog__mark {
      display: inline-block;
      width: 0.875rem;
      height: 0.875rem;
      margin-right: 0.25rem;
      vertical-align: -0.125rem;
      stroke-linecap: round;
    }

    /* Preview of a piece outline, large enough to tell the pieces apart. */
    .board-dialog__piece {
      display: inline-block;
      width: 1.25rem;
      height: 1.25rem;
      margin-right: 0.25rem;
      vertical-align: -0.3rem;
    }

    .board-dialog__mark--fill {
      border: 1px solid var(--mat-sys-outline);
      border-radius: 0.125rem;
    }

    /* Preview of a line, drawn the way the board draws it. */
    .board-dialog__line {
      display: inline-block;
      width: 1.75rem;
      height: 0.875rem;
      margin-right: 0.25rem;
      vertical-align: -0.125rem;
    }

    .board-dialog__swatch {
      display: inline-block;
      width: 0.875rem;
      height: 0.875rem;
      margin-right: 0.25rem;
      border-radius: 50%;
      border: 1px solid var(--mat-sys-outline);
      vertical-align: -0.125rem;
    }

    .board-dialog__drawing-label {
      margin: 0;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .board-dialog__drawing-hint,
    .board-dialog__drawing-status {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .board-dialog__drawing-status {
      color: var(--mat-sys-primary);
    }

    .board-dialog__images {
      display: block;
      margin-top: 0.5rem;
    }

    .board-dialog__caption-heading {
      margin: 0;
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .board-dialog__caption-field {
      width: 100%;
    }

    .board-dialog__caption-text {
      margin: 0;
      font: var(--mat-sys-body-large);
      color: var(--mat-sys-on-surface);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .board-dialog__caption-actions {
      display: flex;
      gap: 0.5rem;
    }
  `,
})
export class BoardDialog {
  private readonly data = inject<BoardDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<BoardDialog>);
  private readonly dialog = inject(MatDialog);
  /** Whether the discard warning is already up, so a second Escape doesn't stack another. */
  private confirming = false;

  /** Whether the opener stores focus points, so the toggle has somewhere to save to. */
  protected readonly canFocus = this.data.onFocusChange !== undefined;
  private readonly clipboard = inject(Clipboard);
  private readonly chess = inject(ChessService);

  /** What was just copied, to confirm it on that button; cleared after a moment. */
  protected readonly copied = signal<'fen' | 'pgn' | null>(null);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly index = signal(this.data.index);
  protected readonly line = this.data.line ?? null;
  /** The line's moves, for the list beside the board. */
  protected readonly lineMoves: readonly LineMove[] = this.data.tiles.flatMap((tile) =>
    tile.san === null ? [] : [{ ply: tile.ply, san: tile.san }],
  );
  protected readonly orientation = signal<BoardOrientation>(this.data.orientation ?? 'white');
  protected readonly current = computed(() => this.data.tiles[this.index()]);
  protected readonly hasPrev = computed(() => this.index() > 0);
  protected readonly hasNext = computed(() => this.index() < this.data.tiles.length - 1);

  /**
   * The game so far as PGN move text — every move up to and including the board
   * on screen. Empty at the starting position, where nothing has been played.
   */
  protected readonly pgnToHere = computed(() =>
    this.chess.toMoveText(
      this.data.tiles
        .slice(0, this.index() + 1)
        .map((tile) => tile.san)
        .filter((san): san is string => san !== null),
    ),
  );

  /** Working copy of the caption map, mutated as the user saves captions. */
  private readonly captions = signal<Record<number, string>>({ ...this.data.captions });

  /** The saved caption for the board currently shown, or '' if none. */
  protected readonly savedCaption = computed(() => this.captions()[this.current().ply] ?? '');

  /** Working copy of the focus points, updated as the user toggles them. */
  private readonly focusPlies = signal<readonly number[]>(this.data.focusPlies ?? []);

  /** Whether the opener stores move images, so uploads have somewhere to save to. */
  protected readonly canAddImages = this.data.onMoveImagesChange !== undefined;

  /** Working copy of every move's images, updated as the user uploads and deletes. */
  private readonly moveImages = signal<Record<number, readonly UploadedImage[]>>({
    ...this.data.moveImages,
  });

  /** The images of the board currently shown. */
  protected readonly currentImages = computed(
    () => this.moveImages()[this.current().ply] ?? [],
  );

  /** Whether the opener stores drawings, so the board can be drawn on. */
  protected readonly canDraw = this.data.onDrawingsChange !== undefined;

  /** How the right mouse button draws (color and arrow style), remembered across dialogs. */
  protected readonly drawPref = inject(DrawingPreference);
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

  /** Every move's drawing as last saved. */
  private readonly savedDrawings = signal<Record<number, BoardDrawing>>({
    ...this.data.drawings,
  });

  /** Drawing edits not yet saved, keyed by ply; kept while stepping between moves. */
  private readonly draftDrawings = signal<Record<number, BoardDrawing>>({});

  /** The current move's drawing: its unsaved edit if any, else what was saved. */
  protected readonly currentDrawing = computed<BoardDrawing | null>(() => {
    const ply = this.current().ply;
    return this.draftDrawings()[ply] ?? this.savedDrawings()[ply] ?? null;
  });

  protected readonly currentDrawingEmpty = computed(() => isEmptyDrawing(this.currentDrawing()));

  protected readonly hasUnsavedDrawings = computed(
    () => Object.keys(this.draftDrawings()).length > 0,
  );

  /** Whether the board currently shown is marked as a focus point. */
  protected readonly isFocus = computed(() => this.focusPlies().includes(this.current().ply));

  /** Whether the caption editor is open (explicitly, or because none exists yet). */
  private readonly editing = signal(false);
  protected readonly showInput = computed(() => this.editing() || this.savedCaption() === '');

  protected readonly captionControl = new FormControl('', { nonNullable: true });

  constructor() {
    // Seed the field for the starting position.
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
    // Every way out — the close button, Escape, a click outside — goes through
    // requestClose, so unsaved work is never dropped without a warning.
    this.dialogRef.disableClose = true;
    this.dialogRef
      .backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.requestClose());
    this.dialogRef
      .keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          this.requestClose();
        }
      });
  }

  /** Whether a caption is being typed that differs from the one saved. */
  private hasUnsavedCaption(): boolean {
    return this.showInput() && this.captionControl.value.trim() !== this.savedCaption();
  }

  /**
   * Closes the dialog, first asking whether to discard any unsaved drawing or
   * caption. Keeping them leaves the dialog open to save.
   */
  protected requestClose(): void {
    if (this.confirming) {
      return;
    }
    const drawings = this.hasUnsavedDrawings();
    const caption = this.hasUnsavedCaption();
    if (!drawings && !caption) {
      this.dialogRef.close();
      return;
    }
    const message =
      drawings && caption
        ? 'Your drawing and caption changes aren’t saved. Close anyway and lose them?'
        : drawings
          ? 'Your drawing changes aren’t saved. Close anyway and lose them?'
          : 'Your caption isn’t saved. Close anyway and lose it?';
    const data: ConfirmDialogData = {
      title: 'Discard unsaved changes?',
      message,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    };
    this.confirming = true;
    this.dialog
      .open(ConfirmDialog, { data, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((discard) => {
        this.confirming = false;
        if (discard) {
          this.dialogRef.close();
        }
      });
  }

  protected prev(): void {
    if (this.hasPrev()) {
      this.goTo(this.index() - 1);
    }
  }

  protected next(): void {
    if (this.hasNext()) {
      this.goTo(this.index() + 1);
    }
  }

  /** Home/End jump to the first/last move, except while typing in a text field. */
  protected onHomeEnd(event: Event, home: boolean): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    if (home) {
      this.first();
    } else {
      this.last();
    }
  }

  protected first(): void {
    this.goTo(0);
  }

  protected last(): void {
    this.goTo(this.data.tiles.length - 1);
  }

  /** Copies the current board's FEN. */
  protected copyFen(): void {
    this.copy('fen', this.current().fen);
  }

  /** Copies the moves played up to the current board, as PGN move text. */
  protected copyPgn(): void {
    this.copy('pgn', this.pgnToHere());
  }

  /** Copies `text`, confirming it with a transient state on that button. */
  private copy(kind: 'fen' | 'pgn', text: string): void {
    if (text.length === 0 || !this.clipboard.copy(text)) {
      return;
    }
    this.copied.set(kind);
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
    }
    this.copiedTimer = setTimeout(() => this.copied.set(null), 1500);
  }

  protected startEdit(): void {
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
    this.editing.set(false);
  }

  /** Keeps the arrow number to its digits, in the field as well as the preference. */
  protected onArrowLabel(input: HTMLInputElement): void {
    input.value = this.drawPref.setArrowLabel(input.value);
  }

  /** Records a right-click or right-drag on the board as an unsaved edit. */
  protected onDraw(drawing: BoardDrawing): void {
    const ply = this.current().ply;
    this.draftDrawings.update((drafts) => ({ ...drafts, [ply]: drawing }));
  }

  /** Clears the current move's drawing (as an unsaved edit, like any other). */
  protected clearDrawing(): void {
    this.onDraw(EMPTY_DRAWING);
  }

  protected discardDrawings(): void {
    this.draftDrawings.set({});
  }

  /** Saves every move's unsaved drawing edits and hands the whole map to the opener. */
  protected saveDrawings(): void {
    const drafts = this.draftDrawings();
    if (Object.keys(drafts).length === 0) {
      return;
    }
    const next: Record<number, BoardDrawing> = { ...this.savedDrawings() };
    for (const [ply, drawing] of Object.entries(drafts)) {
      if (isEmptyDrawing(drawing)) {
        delete next[Number(ply)];
      } else {
        next[Number(ply)] = drawing;
      }
    }
    this.savedDrawings.set(next);
    this.draftDrawings.set({});
    this.data.onDrawingsChange?.({ ...next });
  }

  protected saveCaption(): void {
    // The caption's Save saves any drawing edits too.
    this.saveDrawings();
    const value = this.captionControl.value.trim();
    const ply = this.current().ply;
    const next = { ...this.captions() };
    if (value) {
      next[ply] = value;
    } else {
      delete next[ply];
    }
    this.captions.set(next);
    this.editing.set(false);
    this.data.onCaptionChange({ ...next });
  }

  /** The current move's image section; absent at the starting position. */
  private readonly images = viewChild(MoveImages);

  /**
   * Adds a pasted image to the current move wherever focus is in the dialog.
   * Listening on the document catches a paste while the dialog itself holds
   * focus; one the image section already took is skipped, as is a text paste.
   */
  protected onPaste(event: ClipboardEvent): void {
    const images = this.images();
    if (!images || event.defaultPrevented) {
      return;
    }
    const files = imageFilesIn(event.clipboardData);
    if (files.length > 0) {
      event.preventDefault();
      void images.addFiles(files);
    }
  }

  /** Records the current move's new image list and hands the whole map to the opener. */
  protected saveImages(ply: number, images: UploadedImage[]): void {
    const next = { ...this.moveImages() };
    if (images.length > 0) {
      next[ply] = images;
    } else {
      delete next[ply];
    }
    this.moveImages.set(next);
    this.data.onMoveImagesChange?.({ ...next });
  }

  /** Marks or unmarks the current move as a focus point. */
  protected toggleFocus(): void {
    const ply = this.current().ply;
    const next = this.isFocus()
      ? this.focusPlies().filter((p) => p !== ply)
      : [...this.focusPlies(), ply].sort((a, b) => a - b);
    this.focusPlies.set(next);
    this.data.onFocusChange?.([...next]);
  }

  /** Moves to the board a move in the line list reaches. */
  protected goToPly(ply: number): void {
    const i = this.data.tiles.findIndex((tile) => tile.ply === ply);
    if (i >= 0) {
      this.goTo(i);
    }
  }

  /** Moves to board `i`, closing the editor and re-seeding the field for it. */
  private goTo(i: number): void {
    this.index.set(i);
    this.editing.set(false);
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
  }
}
