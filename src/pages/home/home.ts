import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { WorkspaceStore } from '../../core/workspace-store';
import { PgnGridFileNode } from '../../core/workspace-models';
import { FileExplorer } from '../../features/file-explorer/file-explorer';
import { PgnGridEditor } from '../../features/pgn-grid-editor/pgn-grid-editor';
import { SaveStatusDialog } from '../../features/save-status-dialog/save-status-dialog';

/** File-explorer width bounds (px) and keyboard resize step. */
const MIN_EXPLORER_WIDTH = 180;
const MAX_EXPLORER_WIDTH = 750;
const KEYBOARD_STEP = 16;

@Component({
  selector: 'app-home',
  imports: [FileExplorer, PgnGridEditor, SaveStatusDialog],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly store = inject(WorkspaceStore);

  protected readonly selectedFile = computed<PgnGridFileNode | null>(() => {
    const node = this.store.selectedNode();
    return node && node.kind === 'file' && node.fileType === 'pgn-grid' ? node : null;
  });

  /** Current file-explorer width in px, adjusted by dragging its right edge. */
  protected readonly explorerWidth = signal(288);
  protected readonly resizing = signal(false);
  protected readonly minWidth = MIN_EXPLORER_WIDTH;
  protected readonly maxWidth = MAX_EXPLORER_WIDTH;

  private dragStartX = 0;
  private dragStartWidth = 0;

  protected onResizeStart(event: PointerEvent): void {
    event.preventDefault();
    this.dragStartX = event.clientX;
    this.dragStartWidth = this.explorerWidth();
    this.resizing.set(true);
    // Capture so move/up keep firing on the handle even off its 6px hit area.
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onResizeMove(event: PointerEvent): void {
    if (!this.resizing()) {
      return;
    }
    this.explorerWidth.set(this.clamp(this.dragStartWidth + (event.clientX - this.dragStartX)));
  }

  protected onResizeEnd(event: PointerEvent): void {
    if (!this.resizing()) {
      return;
    }
    this.resizing.set(false);
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  protected onResizeKey(event: KeyboardEvent): void {
    const delta =
      event.key === 'ArrowLeft' ? -KEYBOARD_STEP : event.key === 'ArrowRight' ? KEYBOARD_STEP : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    this.explorerWidth.update((width) => this.clamp(width + delta));
  }

  private clamp(width: number): number {
    return Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, width));
  }
}
