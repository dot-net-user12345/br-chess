import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { FormControl, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChessService } from '../../core/chess-service';
import { BoardOrientation, PgnParseResult } from '../../core/chess-models';
import { MiddleGamePlan } from '../../core/workspace-models';
import { BoardDialog } from '../board-dialog/board-dialog';
import { ChessBoard } from '../chess-board/chess-board';
import { MiddleGamePlanPanel } from '../middle-game-plan/middle-game-plan';

interface BoardTile {
  readonly ply: number;
  readonly fen: string;
  readonly caption: string;
  /** The move that reached this board; null at the starting position. */
  readonly san: string | null;
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
    MatMenuModule,
    MatTooltipModule,
    ChessBoard,
    MiddleGamePlanPanel,
  ],
  templateUrl: './pgn-container.html',
  styleUrl: './pgn-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PgnContainer implements OnInit {
  private readonly chess = inject(ChessService);
  private readonly dialog = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);

  /** Seeds the editor once, e.g. when opening a saved file. */
  readonly initialPgn = input<string>('');
  /** Plies whose move diverges from the compared line; drawn in the accent color. */
  readonly highlightedPlies = input<ReadonlySet<number>>(new Set());
  /** User-entered captions per board position, keyed by ply. */
  readonly captions = input<Readonly<Record<number, string>>>({});
  /** Side to view every board from; `black` rotates each board 180°. */
  readonly orientation = input<BoardOrientation>('white');
  /** This line's optional middle game plan; empty when it has none. */
  readonly middleGamePlan = input<MiddleGamePlan>({});

  readonly contentChange = output<{ pgn: string; result: PgnParseResult }>();
  /** Emits the full updated caption map when the user saves a caption. */
  readonly captionsChange = output<Record<number, string>>();
  /** Emits the whole plan whenever its notes or images change. */
  readonly middleGamePlanChange = output<MiddleGamePlan>();

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

  /** FEN of the tile the right-click menu currently targets. */
  private readonly menuTargetFen = signal<string | null>(null);

  /** Cursor-anchored trigger for the tile right-click menu. */
  private readonly contextTrigger = viewChild<ElementRef<HTMLElement>>('contextTrigger');
  private readonly contextMenu = viewChild(MatMenuTrigger);

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
      san: position.san,
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

  /** Opens the copy-FEN menu anchored at the cursor for the right-clicked board. */
  protected onTileContextMenu(event: MouseEvent, fen: string): void {
    event.preventDefault();
    this.menuTargetFen.set(fen);
    const trigger = this.contextMenu();
    const el = this.contextTrigger()?.nativeElement;
    if (!trigger || !el) {
      return;
    }
    el.style.left = `${event.clientX}px`;
    el.style.top = `${event.clientY}px`;
    trigger.openMenu();
  }

  /** Copies the right-clicked board's FEN to the clipboard. */
  protected copyMenuFen(): void {
    const fen = this.menuTargetFen();
    if (fen) {
      this.clipboard.copy(fen);
    }
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
