import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { WorkspaceStore } from '../../core/workspace-store';
import { isFolder, NodeId, WorkspaceNode } from '../../core/workspace-models';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';

/** One row in the workspace tree; recurses to render a folder's children. */
@Component({
  selector: 'app-tree-node',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './tree-node.html',
  styleUrl: './tree-node.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeNode {
  private readonly store = inject(WorkspaceStore);
  private readonly dialog = inject(MatDialog);

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

  /** True while a valid drag is hovering this folder as a drop target. */
  protected readonly dropActive = signal(false);

  /** Cursor-anchored trigger for the folder right-click menu. */
  private readonly contextTrigger = viewChild<ElementRef<HTMLElement>>('contextTrigger');
  private readonly contextMenu = viewChild(MatMenuTrigger);

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

  protected newFolderInFolder(): void {
    this.store.createFolder(this.nodeId());
  }

  /** Confirms before deleting, since removal is permanent (and recursive for folders). */
  protected confirmRemove(): void {
    const node = this.node();
    if (!node) {
      return;
    }
    const folder = isFolder(node);
    const data: ConfirmDialogData = {
      title: folder ? 'Delete folder?' : 'Delete file?',
      message: folder
        ? `“${node.name}” and everything inside it will be permanently deleted.`
        : `“${node.name}” will be permanently deleted.`,
      confirmLabel: 'Delete',
    };
    this.dialog
      .open(ConfirmDialog, { data, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.store.deleteNode(this.nodeId());
        }
      });
  }

  protected onContextMenu(event: MouseEvent): void {
    if (!this.isFolderNode()) {
      return;
    }
    event.preventDefault();
    const trigger = this.contextMenu();
    const el = this.contextTrigger()?.nativeElement;
    if (!trigger || !el) {
      return;
    }
    // Position the hidden trigger at the cursor, then open the menu there.
    el.style.left = `${event.clientX}px`;
    el.style.top = `${event.clientY}px`;
    trigger.openMenu();
  }

  protected onDragStart(event: DragEvent): void {
    this.store.startDrag(this.nodeId());
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // A payload is required for the drag to be valid in some browsers.
      event.dataTransfer.setData('text/plain', this.nodeId());
    }
  }

  protected onDragEnd(): void {
    this.store.endDrag();
    this.dropActive.set(false);
  }

  protected onDragOver(event: DragEvent): void {
    const target = this.dropTarget();
    if (target === undefined || !this.store.canDrop(target)) {
      return;
    }
    // preventDefault marks this element as a valid drop target.
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dropActive.set(true);
  }

  protected onDragLeave(): void {
    this.dropActive.set(false);
  }

  protected onDrop(event: DragEvent): void {
    const target = this.dropTarget();
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.dropActive.set(false);
    const dragId = this.store.draggingId();
    if (dragId) {
      this.store.moveNode(dragId, target);
    }
    this.store.endDrag();
  }

  /**
   * The folder this row drops into: itself when it's a folder, otherwise its
   * parent folder (or root) so dropping onto a file targets its container.
   * `undefined` when the node is missing.
   */
  private dropTarget(): NodeId | null | undefined {
    const node = this.node();
    if (!node) {
      return undefined;
    }
    return isFolder(node) ? node.id : node.parentId;
  }
}
