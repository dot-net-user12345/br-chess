import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WorkspaceStore } from '../../core/workspace-store';
import { TreeNode } from './tree-node';

/** Sidebar file explorer: a toolbar plus the recursive workspace tree. */
@Component({
  selector: 'app-file-explorer',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TreeNode],
  templateUrl: './file-explorer.html',
  styleUrl: './file-explorer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileExplorer {
  private readonly store = inject(WorkspaceStore);

  protected readonly rootNodes = this.store.rootNodes;

  protected newFolder(): void {
    this.store.createFolder(this.store.targetParentId());
  }

  protected newFile(): void {
    this.store.createFile(this.store.targetParentId(), 'pgn-grid');
  }
}
