import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { NodeId, isFolder } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';

/** What the dialog opens with: the files left out of the search. */
export interface FileScopeDialogData {
  readonly excluded: ReadonlySet<NodeId>;
}

/** One folder or file of the workspace, as a row of the checklist. */
interface ScopeRow {
  readonly id: NodeId;
  readonly name: string;
  readonly folder: boolean;
  /** How deeply the row is nested, for its indent. */
  readonly depth: number;
  /** The file itself, or every file anywhere inside the folder. */
  readonly fileIds: readonly NodeId[];
}

/**
 * The workspace's folders and files, each with a checkbox, for choosing which
 * files a search looks through. A folder's checkbox stands for everything in
 * it. Closes with the files left out on Apply, and with nothing on Cancel.
 */
@Component({
  selector: 'app-file-scope-dialog',
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Files to search</h2>
    <mat-dialog-content>
      @if (rows().length === 0) {
        <p class="scope__empty">No files yet. Create PGN grid files on the Home page.</p>
      } @else {
        <ul class="scope__list" aria-label="Folders and files">
          @for (row of rows(); track row.id) {
            <li class="scope__row" [style.padding-left.rem]="row.depth * 1.5">
              <mat-checkbox
                [checked]="state(row) === 'all'"
                [indeterminate]="state(row) === 'some'"
                [disabled]="row.fileIds.length === 0"
                (change)="toggle(row)"
              >
                <span class="scope__label">
                  <mat-icon class="scope__icon" aria-hidden="true">
                    {{ row.folder ? 'folder' : 'grid_view' }}
                  </mat-icon>
                  {{ row.name }}
                </span>
              </mat-checkbox>
            </li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" (click)="setAll(true)">Check all</button>
      <button matButton type="button" (click)="setAll(false)">Uncheck all</button>
      <span class="scope__spacer"></span>
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" (click)="apply()">Apply</button>
    </mat-dialog-actions>
  `,
  styles: `
    .scope__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .scope__label {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .scope__icon {
      color: var(--mat-sys-on-surface-variant);
    }

    .scope__empty {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .scope__spacer {
      flex: 1;
    }
  `,
})
export class FileScopeDialog {
  private readonly store = inject(WorkspaceStore);
  private readonly data = inject<FileScopeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<FileScopeDialog, ReadonlySet<NodeId>>);

  protected readonly excluded = signal<ReadonlySet<NodeId>>(new Set(this.data.excluded));

  /** Every folder and file, depth first, in the order the file explorer lists them. */
  protected readonly rows = computed<ScopeRow[]>(() => {
    const rows: ScopeRow[] = [];
    const visit = (parentId: NodeId | null, depth: number): NodeId[] => {
      const files: NodeId[] = [];
      for (const node of this.store.childrenOf(parentId)) {
        if (isFolder(node)) {
          const index = rows.length;
          rows.push({ id: node.id, name: node.name, folder: true, depth, fileIds: [] });
          const inside = visit(node.id, depth + 1);
          rows[index] = { ...rows[index], fileIds: inside };
          files.push(...inside);
        } else {
          rows.push({ id: node.id, name: node.name, folder: false, depth, fileIds: [node.id] });
          files.push(node.id);
        }
      }
      return files;
    };
    visit(null, 0);
    return rows;
  });

  /** Whether all, some or none of a row's files are searched. */
  protected state(row: ScopeRow): 'all' | 'some' | 'none' {
    const excluded = this.excluded();
    const left = row.fileIds.filter((id) => excluded.has(id)).length;
    return left === 0 ? 'all' : left === row.fileIds.length ? 'none' : 'some';
  }

  /** Checks every file of the row, unless they all are already; then unchecks them. */
  protected toggle(row: ScopeRow): void {
    const include = this.state(row) !== 'all';
    this.excluded.update((excluded) => {
      const next = new Set(excluded);
      for (const id of row.fileIds) {
        if (include) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }

  protected setAll(include: boolean): void {
    this.excluded.set(
      include ? new Set() : new Set(this.rows().flatMap((row) => (row.folder ? [] : [row.id]))),
    );
  }

  protected apply(): void {
    this.dialogRef.close(this.excluded());
  }
}
