import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PgnParseResult } from '../../core/chess-models';
import { SavedPage } from '../../core/page-models';
import { PageStoreService } from '../../core/page-store-service';
import { PgnContainer } from '../../features/pgn-container/pgn-container';

interface ContainerVm {
  readonly id: number;
  readonly pgn: string;
  readonly result: PgnParseResult | null;
}

interface SaveStatus {
  readonly type: 'success' | 'error';
  readonly text: string;
}

@Component({
  selector: 'app-home',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    PgnContainer,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly store = inject(PageStoreService);

  protected readonly titleControl = new FormControl('', { nonNullable: true });

  protected readonly containers = signal<ContainerVm[]>([{ id: 1, pgn: '', result: null }]);
  protected readonly saving = signal(false);
  protected readonly status = signal<SaveStatus | null>(null);

  private nextId = 2;

  protected readonly canSave = computed(() => {
    const items = this.containers();
    return items.length > 0 && items.every((item) => item.result?.valid === true);
  });

  protected addContainer(): void {
    this.containers.update((items) => [...items, { id: this.nextId++, pgn: '', result: null }]);
  }

  protected removeContainer(id: number): void {
    this.containers.update((items) => items.filter((item) => item.id !== id));
  }

  protected onContentChange(id: number, change: { pgn: string; result: PgnParseResult }): void {
    this.containers.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, pgn: change.pgn, result: change.result } : item,
      ),
    );
  }

  protected async save(): Promise<void> {
    if (!this.canSave() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.status.set(null);

    const page: SavedPage = {
      title: this.titleControl.value.trim() || 'Untitled page',
      createdAt: new Date().toISOString(),
      containers: this.containers().map((item) => {
        const positions = item.result?.positions ?? [];
        return {
          pgn: item.pgn.trim(),
          moves: positions.filter((p) => p.san !== null).map((p) => p.san as string),
          positions: positions.map((p) => p.fen),
        };
      }),
    };

    try {
      const docId = await this.store.savePage(page);
      this.status.set({ type: 'success', text: `Saved “${page.title}” (document ${docId}).` });
    } catch (err) {
      this.status.set({
        type: 'error',
        text: err instanceof Error ? err.message : 'Saving the page failed.',
      });
    } finally {
      this.saving.set(false);
    }
  }
}
