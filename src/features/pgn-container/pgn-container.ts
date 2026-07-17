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
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChessService } from '../../core/chess-service';
import { BoardOrientation, PgnParseResult } from '../../core/chess-models';
import { BoardDialog } from '../board-dialog/board-dialog';
import { ChessBoard } from '../chess-board/chess-board';

interface BoardTile {
  readonly ply: number;
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
    MatIconModule,
    MatTooltipModule,
    ChessBoard,
  ],
  templateUrl: './pgn-container.html',
  styleUrl: './pgn-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PgnContainer implements OnInit {
  private readonly chess = inject(ChessService);
  private readonly dialog = inject(MatDialog);

  /** Seeds the editor once, e.g. when opening a saved file. */
  readonly initialPgn = input<string>('');
  /** Plies whose move diverges from the compared line; drawn in the accent color. */
  readonly highlightedPlies = input<ReadonlySet<number>>(new Set());
  /** User-entered captions per board position, keyed by ply. */
  readonly captions = input<Readonly<Record<number, string>>>({});
  /** Side to view every board from; `black` rotates each board 180°. */
  readonly orientation = input<BoardOrientation>('white');

  readonly contentChange = output<{ pgn: string; result: PgnParseResult }>();
  /** Emits the full updated caption map when the user saves a caption. */
  readonly captionsChange = output<Record<number, string>>();

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

  private readonly value = signal('');

  protected readonly result = computed(() => this.chess.parsePgn(this.value()));

  protected readonly tiles = computed<BoardTile[]>(() => {
    const parsed = this.result();
    if (!parsed.valid) {
      return [];
    }
    return parsed.positions.map((position) => ({
      ply: position.ply,
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
  }

  ngOnInit(): void {
    const seed = this.initialPgn();
    this.control.setValue(seed, { emitEvent: false });
    this.value.set(seed);
  }

  /** Opens a fullscreen modal at the clicked preview, navigable through the whole game. */
  protected openTile(index: number): void {
    const highlights = this.highlightedPlies();
    const tiles = this.tiles().map((tile) => ({
      ...tile,
      highlighted: highlights.has(tile.ply),
    }));
    this.dialog.open(BoardDialog, {
      data: {
        tiles,
        index,
        captions: this.captions(),
        orientation: this.orientation(),
        onCaptionChange: (captions: Record<number, string>) => this.captionsChange.emit(captions),
      },
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
