import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ChessService } from '../../core/chess-service';
import {
  fenMatches,
  moveLabel,
  patternMatches,
  pgnMatches,
  searchLines,
} from '../../core/move-search';
import { PositionPattern } from '../../core/position-pattern';
import { MoveRef } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { ChessBoard } from '../chess-board/chess-board';
import { PositionFilterBar } from '../position-filter-dialog/position-filter-bar';

/** How the moves are searched for. */
type SearchMode = 'pgn' | 'fen' | 'position';

/** A move the picker found, ready to show as a board. */
interface FoundMove {
  readonly key: string;
  readonly ref: Omit<MoveRef, 'id'>;
  readonly fen: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly caption: string;
  readonly title: string;
  readonly orientation: 'white' | 'black';
}

/** More boards than this are cut off, with a prompt to narrow the search. */
const MAX_RESULTS = 60;

/**
 * Finds moves in the PGN grid files — by the moves a line opens with, by a
 * FEN, or by a position — and picks one or more of them for a note. Closes
 * with the picked moves in the order picked, or nothing on Cancel.
 */
@Component({
  selector: 'app-move-picker-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ChessBoard,
    PositionFilterBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Add moves</h2>
    <mat-dialog-content class="picker">
      <div class="picker__bar">
        <mat-button-toggle-group
          aria-label="Search by"
          hideSingleSelectionIndicator
          [value]="mode()"
          (change)="mode.set($event.value)"
        >
          <mat-button-toggle value="pgn">PGN</mat-button-toggle>
          <mat-button-toggle value="fen">FEN</mat-button-toggle>
          <mat-button-toggle value="position">Position</mat-button-toggle>
        </mat-button-toggle-group>

        @switch (mode()) {
          @case ('pgn') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="picker__field">
              <mat-label>Moves a line opens with</mat-label>
              <input
                matInput
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="1. d4 Nf6 2. Bf4"
                [formControl]="pgnControl"
              />
            </mat-form-field>
          }
          @case ('fen') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="picker__field">
              <mat-label>FEN</mat-label>
              <input
                matInput
                type="text"
                autocomplete="off"
                spellcheck="false"
                [formControl]="fenControl"
              />
            </mat-form-field>
          }
          @case ('position') {
            <app-position-filter-bar [(pattern)]="pattern" />
          }
        }
      </div>

      <p class="picker__status" aria-live="polite">{{ status() }}</p>

      @if (shown().length > 0) {
        <ul class="picker__grid" aria-label="Moves found">
          @for (move of shown(); track move.key) {
            <li>
              <button
                type="button"
                class="picker__tile"
                [class.picker__tile--picked]="isPicked(move.key)"
                [attr.aria-pressed]="isPicked(move.key)"
                [attr.aria-label]="move.caption + ', ' + move.title"
                (click)="toggle(move)"
              >
                <app-chess-board
                  [fen]="move.fen"
                  [caption]="move.caption + ', ' + move.title"
                  [from]="move.from"
                  [to]="move.to"
                  [orientation]="move.orientation"
                />
                <span class="picker__caption">
                  @if (isPicked(move.key)) {
                    <span class="picker__check" aria-hidden="true">✓</span>
                  }
                  {{ move.caption }}
                </span>
                <span class="picker__title">{{ move.title }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" [disabled]="picked().length === 0" (click)="add()">
        {{ picked().length > 1 ? 'Add ' + picked().length + ' moves' : 'Add move' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .picker {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .picker__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding-top: 0.5rem;
    }

    .picker__field {
      flex: 1 1 20rem;
    }

    .picker__status {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .picker__grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
      gap: 0.75rem;
    }

    .picker__tile {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.375rem;
      border: 2px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
      text-align: left;
      cursor: pointer;

      &:hover {
        border-color: var(--mat-sys-primary);
      }

      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
    }

    .picker__tile--picked {
      border-color: var(--mat-sys-primary);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .picker__caption {
      font: var(--mat-sys-label-large);
    }

    .picker__check {
      margin-right: 0.25rem;
    }

    .picker__title {
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
  `,
})
export class MovePickerDialog {
  private readonly store = inject(WorkspaceStore);
  private readonly chess = inject(ChessService);
  private readonly dialogRef = inject(MatDialogRef<MovePickerDialog, Omit<MoveRef, 'id'>[]>);

  protected readonly mode = signal<SearchMode>('pgn');
  protected readonly pgnControl = new FormControl('', { nonNullable: true });
  protected readonly fenControl = new FormControl('', { nonNullable: true });
  protected readonly pattern = signal<PositionPattern>({});
  private readonly pgnText = toSignal(this.pgnControl.valueChanges, { initialValue: '' });
  private readonly fenText = toSignal(this.fenControl.valueChanges, { initialValue: '' });

  /** Moves picked so far, in the order picked. */
  protected readonly picked = signal<readonly FoundMove[]>([]);

  /** Every line of every PGN grid file, both sides. */
  private readonly lines = computed(() =>
    searchLines(
      this.store.pgnGridFiles(),
      (id) => this.store.pathOf(id),
      (pgn) => this.chess.parsePgn(pgn),
    ),
  );

  /** The PGN search's moves as SAN; null when there's nothing to search, or it doesn't parse. */
  private readonly sans = computed(() => {
    const text = this.pgnText().trim();
    if (!text) {
      return null;
    }
    const result = this.chess.parsePgn(text);
    const sans = result.positions.flatMap((position) => (position.san ? [position.san] : []));
    return result.valid && sans.length > 0 ? sans : null;
  });

  /** Whether the search for the current mode has anything to search with. */
  private readonly active = computed(() => {
    switch (this.mode()) {
      case 'pgn':
        return this.sans() !== null;
      case 'fen':
        return this.fenText().trim().length > 0;
      case 'position':
        return Object.keys(this.pattern()).length > 0;
    }
  });

  protected readonly found = computed<FoundMove[]>(() => {
    if (!this.active()) {
      return [];
    }
    const mode = this.mode();
    const sans = this.sans();
    const fen = this.fenText();
    const pattern = this.pattern();
    return this.lines().flatMap((line) => {
      const positions =
        mode === 'pgn' && sans
          ? pgnMatches(line, sans)
          : mode === 'fen'
            ? fenMatches(line, fen)
            : patternMatches(line, pattern);
      return positions.map((position) => ({
        key: `${line.fileId}:${line.entryId}:${position.ply}`,
        ref: { fileId: line.fileId, entryId: line.entryId, ply: position.ply },
        fen: position.fen,
        from: position.from,
        to: position.to,
        caption: moveLabel(position),
        title: line.title,
        orientation: line.orientation,
      }));
    });
  });

  protected readonly shown = computed(() => this.found().slice(0, MAX_RESULTS));

  protected readonly status = computed(() => {
    if (this.mode() === 'pgn' && this.pgnText().trim() && !this.sans()) {
      return 'Not a valid PGN yet.';
    }
    if (!this.active()) {
      return this.mode() === 'position'
        ? 'Place pieces with Filter by position to find the moves that reach them.'
        : this.mode() === 'fen'
          ? 'Paste a FEN to find the moves that reach its board.'
          : 'Type the moves a line opens with to find where it gets to.';
    }
    const count = this.found().length;
    if (count === 0) {
      return 'No moves found.';
    }
    const moves = `${count} move${count === 1 ? '' : 's'} found`;
    return count > MAX_RESULTS ? `${moves}; showing the first ${MAX_RESULTS}.` : `${moves}.`;
  });

  protected isPicked(key: string): boolean {
    return this.picked().some((move) => move.key === key);
  }

  protected toggle(move: FoundMove): void {
    this.picked.update((picked) =>
      picked.some((m) => m.key === move.key)
        ? picked.filter((m) => m.key !== move.key)
        : [...picked, move],
    );
  }

  protected add(): void {
    this.dialogRef.close(this.picked().map((move) => move.ref));
  }
}
