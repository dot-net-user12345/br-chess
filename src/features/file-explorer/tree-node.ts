import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WorkspaceStore } from '../../core/workspace-store';
import { isFolder, NodeId, WorkspaceNode } from '../../core/workspace-models';

/** One row in the workspace tree; recurses to render a folder's children. */
@Component({
  selector: 'app-tree-node',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule],
  templateUrl: './tree-node.html',
  styleUrl: './tree-node.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeNode {
  private readonly store = inject(WorkspaceStore);

  readonly nodeId = input.required<NodeId>();

  protected readonly node = computed<WorkspaceNode | null>(() => this.store.node(this.nodeId()));
  protected readonly isFolderNode = computed(() => {
    const node = this.node();
    return node ? isFolder(node) : false;
  });
  protected readonly expanded = computed(() => this.store.isExpanded(this.nodeId()));
  protected readonly selected = computed(() => this.store.isSelected(this.nodeId()));
  protected readonly children = computed(() =>
    this.isFolderNode() ? this.store.childrenOf(this.nodeId()) : [],
  );

  protected readonly editing = signal(false);
  protected readonly nameControl = new FormControl('', { nonNullable: true });

  protected activate(): void {
    if (this.isFolderNode()) {
      this.store.toggleExpanded(this.nodeId());
    }
    this.store.select(this.nodeId());
  }

  protected icon(): string {
    if (this.isFolderNode()) {
      return this.expanded() ? 'folder_open' : 'folder';
    }
    return 'grid_on';
  }

  protected startRename(): void {
    this.nameControl.setValue(this.node()?.name ?? '');
    this.editing.set(true);
  }

  protected commitRename(): void {
    if (!this.editing()) {
      return;
    }
    this.store.rename(this.nodeId(), this.nameControl.value);
    this.editing.set(false);
  }

  protected cancelRename(): void {
    this.editing.set(false);
  }

  protected newFileInFolder(): void {
    this.store.createFile(this.nodeId());
  }

  protected remove(): void {
    this.store.deleteNode(this.nodeId());
  }
}
