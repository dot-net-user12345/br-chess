import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { BoardOrientation } from '../../core/chess-models';
import { BoardDrawing, EMPTY_DRAWING, isEmptyDrawing } from '../../core/board-drawing';
import { BoardDiagramContent, BoardDiagramFileNode, NodeId } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { ImageAttachments } from '../../shared/image-attachments';
import { DrawingPreference } from '../board-dialog/drawing-preference';
import { DrawingTools } from '../board-dialog/drawing-tools';
import { ChessBoard } from '../chess-board/chess-board';
import { FileTitleField } from '../file-title-field/file-title-field';
import { BoardSetup } from '../position-filter-dialog/board-setup';

/**
 * Edits a board diagram: its title, the pieces (set up on the position
 * filter's board), and arrows and marks drawn over them with the right mouse
 * button. Edits stay local until Save.
 */
@Component({
  selector: 'app-board-diagram-editor',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    ChessBoard,
    DrawingTools,
    FileTitleField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (file(); as file) {
      <div class="diagram">
        <header class="diagram__header">
          <app-file-title-field class="diagram__title" [fileId]="file.id" label="Diagram title" />
          <mat-button-toggle-group
            [value]="orientation()"
            (change)="setOrientation($event.value)"
            aria-label="Board perspective"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="white">White</mat-button-toggle>
            <mat-button-toggle value="black">Black</mat-button-toggle>
          </mat-button-toggle-group>
          <button matButton="filled" type="button" (click)="save()">
            <mat-icon>save</mat-icon>
            Save
          </button>
        </header>
        @if (dirty()) {
          <p class="diagram__status" role="status">Unsaved changes</p>
        }

        <div class="diagram__body">
          <div class="diagram__board">
            <app-chess-board
              [fen]="file.content.fen"
              [caption]="'Board diagram ' + file.name"
              [orientation]="orientation()"
              [drawing]="file.content.drawing ?? null"
              [drawable]="true"
              [drawColor]="drawPref.color()"
              [drawArrowStyle]="drawPref.arrowStyle()"
              [drawArrowLabel]="drawPref.arrowLabel()"
              [drawSquareMark]="drawPref.squareMark()"
              (drawingChange)="onDraw($event)"
            />
          </div>

          <div class="diagram__side">
            <section class="diagram__section" aria-labelledby="diagram-position-heading">
              <h3 id="diagram-position-heading" class="diagram__heading">Position</h3>
              <div class="diagram__actions">
                <button matButton="outlined" type="button" aria-haspopup="dialog" (click)="setUp()">
                  <mat-icon>grid_on</mat-icon>
                  Set up board
                </button>
                <button matButton type="button" (click)="copyFen()">
                  <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
                  {{ copied() ? 'Copied' : 'Copy FEN' }}
                </button>
              </div>
              <code class="diagram__fen">{{ file.content.fen }}</code>
            </section>

            <section class="diagram__section" aria-labelledby="diagram-drawing-heading">
              <h3 id="diagram-drawing-heading" class="diagram__heading">Drawing</h3>
              <p class="diagram__hint">
                Right-click a square to mark it; right-drag between squares to draw a line.
              </p>
              <app-drawing-tools />
              <div class="diagram__actions">
                <button
                  matButton
                  type="button"
                  [disabled]="drawingEmpty()"
                  (click)="clearDrawing()"
                >
                  <mat-icon>ink_eraser</mat-icon>
                  Clear drawing
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .diagram {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .diagram__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }

    .diagram__title {
      flex: 1 1 18rem;
    }

    .diagram__status {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-primary);
    }

    .diagram__body {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      align-items: flex-start;
    }

    .diagram__board {
      flex: 0 0 auto;
      width: min(100%, 36rem, 75vh);
      aspect-ratio: 1;
    }

    .diagram__side {
      flex: 1 1 24rem;
      max-width: 32rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .diagram__section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .diagram__heading {
      margin: 0;
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .diagram__hint {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .diagram__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    /* Selectable, so it can be copied out by hand too. */
    .diagram__fen {
      overflow-x: auto;
      white-space: nowrap;
      font: var(--mat-sys-body-medium);
      font-family: ui-monospace, monospace;
      user-select: all;
    }
  `,
})
export class BoardDiagramEditor {
  private readonly store = inject(WorkspaceStore);
  private readonly setup = inject(BoardSetup);
  private readonly attachments = inject(ImageAttachments);
  private readonly clipboard = inject(Clipboard);
  protected readonly drawPref = inject(DrawingPreference);

  readonly fileId = input.required<NodeId>();

  protected readonly file = computed<BoardDiagramFileNode | null>(() => {
    const node = this.store.node(this.fileId());
    return node && node.kind === 'file' && node.fileType === 'board-diagram' ? node : null;
  });

  protected readonly orientation = computed<BoardOrientation>(
    () => this.file()?.content.orientation ?? 'white',
  );

  protected readonly drawingEmpty = computed(() => isEmptyDrawing(this.file()?.content.drawing));

  /** Whether there are edits since the file was opened or last saved. */
  protected readonly dirty = linkedSignal({ source: this.fileId, computation: () => false });
  protected readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected async setUp(): Promise<void> {
    const file = this.file();
    if (!file) {
      return;
    }
    const fen = await this.setup.open(file.content.fen, this.orientation());
    if (fen !== null) {
      this.update((content) => ({ ...content, fen }));
    }
  }

  protected setOrientation(orientation: BoardOrientation): void {
    // White is left out, as for a new diagram.
    this.update(({ orientation: _dropped, ...rest }) =>
      orientation === 'white' ? rest : { ...rest, orientation },
    );
  }

  protected onDraw(drawing: BoardDrawing): void {
    const before = this.file()?.content.drawing ?? null;
    this.update(({ drawing: _dropped, ...rest }) =>
      isEmptyDrawing(drawing) ? rest : { ...rest, drawing },
    );
    this.drawPref.recordDraw(before, drawing);
  }

  protected clearDrawing(): void {
    this.onDraw(EMPTY_DRAWING);
  }

  protected copyFen(): void {
    const fen = this.file()?.content.fen;
    if (!fen || !this.clipboard.copy(fen)) {
      return;
    }
    this.copied.set(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.copied.set(false), 1500);
  }

  protected async save(): Promise<void> {
    // Saving persists to the cloud, so require a signed-in user first.
    if (!(await this.attachments.ensureSignedIn())) {
      return;
    }
    await this.store.saveFile(this.fileId());
    this.dirty.set(false);
  }

  private update(change: (content: BoardDiagramContent) => BoardDiagramContent): void {
    const file = this.file();
    if (file) {
      this.store.updateBoardDiagram(file.id, change(file.content));
      this.dirty.set(true);
    }
  }
}
