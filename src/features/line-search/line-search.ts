import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ChessService } from '../../core/chess-service';
import { GamePosition } from '../../core/chess-models';
import { findMatchingPosition, formatMove, parsePlyQuery } from '../../core/line-search';
import { NodeId } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';

/** One line of one file, parsed once so queries only have to scan it. */
interface IndexedLine {
  readonly fileId: NodeId;
  /** 1-based position of the line within its file. */
  readonly lineNumber: number;
  /** The line's custom label, or `Line N` when unset. */
  readonly label: string;
  readonly positions: readonly GamePosition[];
}

/** A line that plays the searched-for move, with where to find it. */
export interface LineMatch {
  readonly fileId: NodeId;
  /** Folder names down to the file, e.g. `Openings / White / London System`. */
  readonly filePath: string;
  readonly lineNumber: number;
  readonly label: string;
  /** The matched move in the app's notation, e.g. `7… Na6`. */
  readonly moveText: string;
}

/**
 * Searches every line in the workspace for a move — `7. Na6`, `7… Na6`, or a
 * bare `Bf4` — and lists the file path and line of each line that plays it.
 */
@Component({
  selector: 'app-line-search',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './line-search.html',
  styleUrl: './line-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineSearch {
  private readonly store = inject(WorkspaceStore);
  private readonly chess = inject(ChessService);

  /** Emits whether results are on screen, so the tree can make room for them. */
  readonly searching = output<boolean>();

  protected readonly control = new FormControl('', { nonNullable: true });

  private readonly query = signal('');

  /** True once the user has typed something, whether or not it names a move. */
  protected readonly active = computed(() => this.query().trim().length > 0);

  private readonly parsedQuery = computed(() => parsePlyQuery(this.query()));

  /** True while the text so far doesn't name a move yet, e.g. a bare `7.`. */
  protected readonly incomplete = computed(() => this.active() && this.parsedQuery() === null);

  /** The query echoed back in the app's move notation, for the result summary. */
  protected readonly queryLabel = computed(() => this.parsedQuery()?.label ?? '');

  /**
   * Every line in the workspace, parsed. Only recomputed when a file changes —
   * not on each keystroke — so typing merely rescans the parsed moves.
   */
  private readonly index = computed<IndexedLine[]>(() =>
    this.store.pgnGridFiles().flatMap((file) =>
      file.content.entries.map((entry, i) => ({
        fileId: file.id,
        lineNumber: i + 1,
        label: entry.label?.trim() || `Line ${i + 1}`,
        positions: this.chess.parsePgn(entry.pgn).positions,
      })),
    ),
  );

  protected readonly matches = computed<LineMatch[]>(() => {
    const query = this.parsedQuery();
    if (!query) {
      return [];
    }
    const matches: LineMatch[] = [];
    for (const line of this.index()) {
      const position = findMatchingPosition(line.positions, query);
      if (position) {
        matches.push({
          fileId: line.fileId,
          filePath: this.store.pathOf(line.fileId),
          lineNumber: line.lineNumber,
          label: line.label,
          moveText: formatMove(position),
        });
      }
    }
    return matches.sort(
      (a, b) => a.filePath.localeCompare(b.filePath) || a.lineNumber - b.lineNumber,
    );
  });

  constructor() {
    this.control.valueChanges.subscribe((value) => this.apply(value));
  }

  /** Opens the file a result belongs to, revealing it in the tree. */
  protected open(match: LineMatch): void {
    this.store.reveal(match.fileId);
  }

  protected clear(): void {
    this.control.setValue('', { emitEvent: false });
    this.apply('');
  }

  protected describe(match: LineMatch): string {
    return `${match.label} in ${match.filePath}, playing ${match.moveText}`;
  }

  private apply(value: string): void {
    this.query.set(value);
    this.searching.emit(value.trim().length > 0);
  }
}
