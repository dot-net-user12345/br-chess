import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WorkspaceStore } from '../../core/workspace-store';
import { PgnGridFileNode } from '../../core/workspace-models';
import { FileExplorer } from '../../features/file-explorer/file-explorer';
import { PgnGridEditor } from '../../features/pgn-grid-editor/pgn-grid-editor';

@Component({
  selector: 'app-home',
  imports: [FileExplorer, PgnGridEditor],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly store = inject(WorkspaceStore);

  protected readonly status = this.store.status;

  protected readonly selectedFile = computed<PgnGridFileNode | null>(() => {
    const node = this.store.selectedNode();
    return node && node.kind === 'file' && node.fileType === 'pgn-grid' ? node : null;
  });

  constructor() {
    void this.store.init();
  }
}
