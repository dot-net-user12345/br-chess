import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { boardPart } from '../../core/move-search';
import { NodeId } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { ChessBoard } from '../chess-board/chess-board';

/**
 * Picks a board diagram for a note, searched by title or FEN. Closes with the
 * diagram's id, or nothing on Cancel.
 */
@Component({
  selector: 'app-diagram-picker-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ChessBoard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Add a board diagram</h2>
    <mat-dialog-content class="picker">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="picker__search">
        <mat-label>Search by title or FEN</mat-label>
        <input matInput type="search" autocomplete="off" spellcheck="false" [formControl]="query" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>

      <p class="picker__status" aria-live="polite">{{ status() }}</p>

      @if (results().length > 0) {
        <ul class="picker__grid" aria-label="Board diagrams">
          @for (diagram of results(); track diagram.id) {
            <li>
              <button
                type="button"
                class="picker__tile"
                [attr.aria-label]="'Add ' + diagram.path"
                (click)="pick(diagram.id)"
              >
                <app-chess-board
                  [fen]="diagram.fen"
                  [caption]="diagram.path"
                  [orientation]="diagram.orientation"
                  [drawing]="diagram.drawing"
                />
                <span class="picker__name">{{ diagram.path }}</span>
              </button>
            </li>
          }
        </ul>
      } @else if (total() === 0) {
        <p class="picker__empty">
          Create diagrams on the
          <a routerLink="/diagrams" mat-dialog-close>Board diagrams</a> page.
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
    </mat-dialog-actions>
  `,
  styles: `
    .picker {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .picker__search {
      width: 100%;
      margin-top: 0.5rem;
    }

    .picker__status,
    .picker__empty {
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
      gap: 0.375rem;
      padding: 0.375rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-small);
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

    .picker__name {
      overflow-wrap: anywhere;
    }
  `,
})
export class DiagramPickerDialog {
  private readonly store = inject(WorkspaceStore);
  private readonly dialogRef = inject(MatDialogRef<DiagramPickerDialog, NodeId>);

  protected readonly query = new FormControl('', { nonNullable: true });
  private readonly text = toSignal(this.query.valueChanges, { initialValue: '' });

  /** Every diagram, by path, with what a tile shows. */
  private readonly diagrams = computed(() =>
    this.store
      .boardDiagrams()
      .map((file) => ({
        id: file.id,
        path: this.store.pathOf(file.id),
        fen: file.content.fen,
        orientation: file.content.orientation ?? 'white',
        drawing: file.content.drawing ?? null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );

  protected readonly total = computed(() => this.diagrams().length);

  /**
   * The diagrams whose title (or folder) contains what was typed, or whose
   * board is the typed FEN's board — or contains it, for a partial FEN.
   */
  protected readonly results = computed(() => {
    const text = this.text().trim();
    if (!text) {
      return this.diagrams();
    }
    const lower = text.toLowerCase();
    // Only something with a rank separator is read as a FEN, so a short title
    // search like "8" doesn't match every board.
    const board = text.includes('/') ? boardPart(text) : '';
    return this.diagrams().filter(
      (diagram) =>
        diagram.path.toLowerCase().includes(lower) || (!!board && diagram.fen.includes(board)),
    );
  });

  protected readonly status = computed(() => {
    const count = this.results().length;
    if (this.total() === 0) {
      return 'You have no board diagrams yet.';
    }
    return count === 0
      ? 'No diagram matches that title or FEN.'
      : `${count} diagram${count === 1 ? '' : 's'}`;
  });

  protected pick(id: NodeId): void {
    this.dialogRef.close(id);
  }
}
