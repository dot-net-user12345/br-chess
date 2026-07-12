import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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

  /** True while a valid drag is hovering the blank tree area (drop = move to root). */
  protected readonly rootDropActive = signal(false);

  protected newFolder(): void {
    this.store.createFolder(this.store.targetParentId());
  }

  protected newFile(): void {
    this.store.createFile(this.store.targetParentId(), 'pgn-grid');
  }

  protected onRootDragOver(event: DragEvent): void {
    if (!this.store.canDrop(null)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.rootDropActive.set(true);
  }

  protected onRootDragLeave(): void {
    this.rootDropActive.set(false);
  }

  protected onRootDrop(event: DragEvent): void {
    event.preventDefault();
    this.rootDropActive.set(false);
    const dragId = this.store.draggingId();
    if (dragId) {
      this.store.moveNode(dragId, null);
    }
    this.store.endDrag();
  }
}
