import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ChessService } from '../../core/chess-service';
import { PgnParseResult } from '../../core/chess-models';
import { BoardDialog } from '../board-dialog/board-dialog';
import { ChessBoard } from '../chess-board/chess-board';

interface BoardTile {
  readonly fen: string;
  readonly caption: string;
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * A single text container: takes a PGN as input, validates it, and previews the
 * game as a grid of board images (one per half-move).
 */
@Component({
  selector: 'app-pgn-container',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    ChessBoard,
  ],
  templateUrl: './pgn-container.html',
  styleUrl: './pgn-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PgnContainer implements OnInit {
  private readonly chess = inject(ChessService);
  private readonly dialog = inject(MatDialog);

  /** Seeds the label once; the field is editable thereafter. */
  readonly label = input<string>('Game');
  readonly canRemove = input<boolean>(true);
  /** Seeds the editor once, e.g. when opening a saved file. */
  readonly initialPgn = input<string>('');

  readonly contentChange = output<{ pgn: string; result: PgnParseResult }>();
  readonly labelChange = output<string>();
  readonly remove = output<void>();

  private readonly pgnValidator: ValidatorFn = (control) => {
    const value = (control.value ?? '').trim();
    if (value.length === 0) {
      return null;
    }
    const result = this.chess.parsePgn(value);
    return result.valid ? null : { pgn: result.error };
  };

  protected readonly control = new FormControl('', {
    nonNullable: true,
    validators: [this.pgnValidator],
  });

  protected readonly labelControl = new FormControl('', { nonNullable: true });

  private readonly value = signal('');

  /** Live label text, kept in sync with {@link labelControl} for the aria label. */
  protected readonly labelText = signal('');

  protected readonly result = computed(() => this.chess.parsePgn(this.value()));

  protected readonly tiles = computed<BoardTile[]>(() => {
    const parsed = this.result();
    if (!parsed.valid) {
      return [];
    }
    return parsed.positions.map((position) => ({
      fen: position.fen,
      caption: this.captionFor(position.ply, position.moveNumber, position.color, position.san),
      from: position.from,
      to: position.to,
    }));
  });

  constructor() {
    this.control.valueChanges.subscribe((value) => {
      this.value.set(value);
      this.contentChange.emit({ pgn: value, result: this.chess.parsePgn(value) });
    });
    this.labelControl.valueChanges.subscribe((value) => {
      this.labelText.set(value);
      this.labelChange.emit(value);
    });
  }

  ngOnInit(): void {
    const seed = this.initialPgn();
    this.control.setValue(seed, { emitEvent: false });
    this.value.set(seed);

    const label = this.label();
    this.labelControl.setValue(label, { emitEvent: false });
    this.labelText.set(label);
  }

  protected removeContainer(): void {
    this.remove.emit();
  }

  /** Opens a fullscreen modal at the clicked preview, navigable through the whole game. */
  protected openTile(index: number): void {
    this.dialog.open(BoardDialog, {
      data: { tiles: this.tiles(), index },
      panelClass: 'board-dialog-panel',
      ariaLabel: 'Board preview',
      maxWidth: '98vw',
      maxHeight: '98vh',
      autoFocus: 'dialog',
    });
  }

  private captionFor(
    ply: number,
    moveNumber: number,
    color: 'white' | 'black' | null,
    san: string | null,
  ): string {
    if (ply === 0 || san === null) {
      return 'Start';
    }
    return color === 'white' ? `${moveNumber}. ${san}` : `${moveNumber}… ${san}`;
  }
}
