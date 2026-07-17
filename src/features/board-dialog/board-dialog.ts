import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { BoardOrientation } from '../../core/chess-models';
import { ChessBoard } from '../chess-board/chess-board';

/** One board position the dialog can display. */
export interface BoardDialogTile {
  /** Half-move index this board sits at (0 = starting position); keys its caption. */
  readonly ply: number;
  readonly fen: string;
  readonly caption: string;
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
    ReactiveFormsModule,
    ChessBoard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.arrowleft)': 'prev()',
    '(keydown.arrowright)': 'next()',
    '(keydown.home)': 'first()',
    '(keydown.end)': 'last()',
  },
  template: `
    <div class="board-dialog">
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
        <button matIconButton mat-dialog-close type="button" aria-label="Close">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="board-dialog__body">
        <div class="board-dialog__board">
          <app-chess-board
            [fen]="current().fen"
            [caption]="current().caption"
            [from]="current().from"
            [to]="current().to"
            [highlighted]="current().highlighted ?? false"
            [orientation]="orientation()"
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
      --caption-column: 21rem;
      display: flex;
      flex-direction: column;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .board-dialog__spacer {
      flex: 1 1 auto;
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
      width: min(calc(97vw - var(--caption-column)), calc(98vh - var(--bar-height)));
      aspect-ratio: 1;
    }

    .board-dialog__caption {
      /* Fixed width so read-only text wraps to the same width as the input
         instead of its long max-content stretching the dialog wide. */
      flex: 0 0 20rem;
      max-width: 20rem;
      /* The dialog surface has padding: 0 (so the board can fill it) and
         overflow: hidden, which would jam this column against the top/right
         edges and clip the form field's floating label. Inset it here. */
      padding: 1rem 1rem 1rem 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
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

  protected readonly index = signal(this.data.index);
  protected readonly orientation = signal<BoardOrientation>(this.data.orientation ?? 'white');
  protected readonly current = computed(() => this.data.tiles[this.index()]);
  protected readonly hasPrev = computed(() => this.index() > 0);
  protected readonly hasNext = computed(() => this.index() < this.data.tiles.length - 1);

  /** Working copy of the caption map, mutated as the user saves captions. */
  private readonly captions = signal<Record<number, string>>({ ...this.data.captions });

  /** The saved caption for the board currently shown, or '' if none. */
  protected readonly savedCaption = computed(() => this.captions()[this.current().ply] ?? '');

  /** Whether the caption editor is open (explicitly, or because none exists yet). */
  private readonly editing = signal(false);
  protected readonly showInput = computed(() => this.editing() || this.savedCaption() === '');

  protected readonly captionControl = new FormControl('', { nonNullable: true });

  constructor() {
    // Seed the field for the starting position.
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
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

  protected first(): void {
    this.goTo(0);
  }

  protected last(): void {
    this.goTo(this.data.tiles.length - 1);
  }

  protected startEdit(): void {
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
    this.editing.set(false);
  }

  protected saveCaption(): void {
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

  /** Moves to board `i`, closing the editor and re-seeding the field for it. */
  private goTo(i: number): void {
    this.index.set(i);
    this.editing.set(false);
    this.captionControl.setValue(this.savedCaption(), { emitEvent: false });
  }
}
