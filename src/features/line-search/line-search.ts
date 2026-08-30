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
import { findMatchingSpan, formatSpan, parseMoveQuery } from '../../core/line-search';
import { NodeId } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';

/** Beyond this many queried moves the summary counts them instead of listing them. */
const SUMMARY_MOVE_LIMIT = 4;

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
  /** Where it matched, e.g. `7… Na6`, or `1. e4 – 2. Nf3` across several moves. */
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

  private readonly parsedQuery = computed(() => parseMoveQuery(this.query()));

  /** True while the text so far doesn't name a move yet, e.g. a bare `7.`. */
  protected readonly incomplete = computed(() => this.active() && this.parsedQuery() === null);

  /**
   * How the summary names what was searched for: the moves themselves, or just
   * how many of them once a pasted PGN is too long to read back in the panel.
   */
  protected readonly queryLabel = computed(() => {
    const query = this.parsedQuery();
    if (!query) {
      return '';
    }
    return query.moves.length > SUMMARY_MOVE_LIMIT
      ? `these ${query.moves.length} moves`
      : query.label;
  });

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
      const span = findMatchingSpan(line.positions, query);
      if (span) {
        matches.push({
          fileId: line.fileId,
          filePath: this.store.pathOf(line.fileId),
          lineNumber: line.lineNumber,
          label: line.label,
          moveText: formatSpan(span),
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
