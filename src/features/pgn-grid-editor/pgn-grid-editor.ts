import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ChessService } from '../../core/chess-service';
import { PgnParseResult } from '../../core/chess-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { NodeId, PgnEntry, PgnGridFileNode } from '../../core/workspace-models';
import { PgnContainer } from '../pgn-container/pgn-container';

/** Editor for a `pgn-grid` file: manages its PGN entries and their board grids. */
@Component({
  selector: 'app-pgn-grid-editor',
  imports: [MatButtonModule, MatIconModule, PgnContainer],
  templateUrl: './pgn-grid-editor.html',
  styleUrl: './pgn-grid-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PgnGridEditor {
  private readonly store = inject(WorkspaceStore);
  private readonly chess = inject(ChessService);

  readonly fileId = input.required<NodeId>();

  protected readonly file = computed<PgnGridFileNode | null>(() => {
    const node = this.store.node(this.fileId());
    return node && node.kind === 'file' && node.fileType === 'pgn-grid' ? node : null;
  });

  protected readonly entries = computed<readonly PgnEntry[]>(
    () => this.file()?.content.entries ?? [],
  );

  protected readonly summary = computed(() => {
    const items = this.entries();
    const validCount = items.filter((entry) => this.chess.parsePgn(entry.pgn).valid).length;
    return {
      total: items.length,
      valid: validCount,
      allValid: items.length > 0 && validCount === items.length,
    };
  });

  protected onEntryChange(entryId: string, change: { pgn: string; result: PgnParseResult }): void {
    this.writeEntries(
      this.entries().map((entry) =>
        entry.id === entryId ? { ...entry, pgn: change.pgn } : entry,
      ),
    );
  }

  protected onLabelChange(entryId: string, label: string): void {
    this.writeEntries(
      this.entries().map((entry) =>
        entry.id === entryId ? { ...entry, label } : entry,
      ),
    );
  }

  protected addEntry(): void {
    this.writeEntries([...this.entries(), { id: crypto.randomUUID(), pgn: '' }]);
  }

  protected removeEntry(entryId: string): void {
    this.writeEntries(this.entries().filter((entry) => entry.id !== entryId));
  }

  protected save(): void {
    void this.store.saveFile(this.fileId());
  }

  private writeEntries(entries: PgnEntry[]): void {
    this.store.updatePgnGridContent(this.fileId(), { entries });
  }
}
