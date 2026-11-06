import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WorkspaceStore } from '../../core/workspace-store';
import { TREE_FILE_TYPES, WorkspaceTree } from '../../core/workspace-models';
import { LineSearch } from '../line-search/line-search';
import { TreeNode } from './tree-node';
import { TREE_LABELS } from './tree-labels';

/** Sidebar file explorer: a toolbar, the move search, and one tree of the workspace. */
@Component({
  selector: 'app-file-explorer',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, LineSearch, TreeNode],
  templateUrl: './file-explorer.html',
  styleUrl: './file-explorer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileExplorer {
  private readonly store = inject(WorkspaceStore);

  /** Which file structure this explorer shows. */
  readonly tree = input<WorkspaceTree>('lines');

  protected readonly labels = computed(() => TREE_LABELS[this.tree()]);
  protected readonly rootNodes = computed(() => this.store.rootsOf(this.tree()));

  /** True while a valid drag is hovering the blank tree area (drop = move to root). */
  protected readonly rootDropActive = signal(false);

  /** True while move-search results are showing, which take the tree's place. */
  protected readonly searching = signal(false);

  protected newFolder(): void {
    this.store.createFolder(this.store.targetParentId(this.tree()), this.tree());
  }

  protected newFile(): void {
    this.store.createFile(this.store.targetParentId(this.tree()), TREE_FILE_TYPES[this.tree()]);
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
