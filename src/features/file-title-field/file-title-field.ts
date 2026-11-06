import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NodeId } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';

/**
 * A file's title, which is its name in the explorer. Required: it can't be
 * left blank, so a blank entry is flagged and never saved.
 */
@Component({
  selector: 'app-file-title-field',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="file-title-field">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        type="text"
        required
        autocomplete="off"
        [formControl]="control"
        (blur)="commit()"
        (keydown.enter)="commit()"
        (keydown.escape)="revert()"
      />
      @if (control.invalid) {
        <mat-error>A title is required.</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .file-title-field {
      width: 100%;
      font: var(--mat-sys-title-large);
    }
  `,
})
export class FileTitleField {
  private readonly store = inject(WorkspaceStore);

  readonly fileId = input.required<NodeId>();
  readonly label = input('Title');

  protected readonly control = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });

  constructor() {
    // Follow the file: another file selected, or renamed from the explorer.
    effect(() => {
      const name = this.store.node(this.fileId())?.name ?? '';
      if (name !== this.control.value.trim()) {
        this.control.setValue(name);
      }
    });
  }

  /** Renames the file to what was typed; a blank title stays flagged and isn't saved. */
  protected commit(): void {
    this.control.markAsTouched();
    if (this.control.valid) {
      this.store.rename(this.fileId(), this.control.value);
    }
  }

  protected revert(): void {
    this.control.setValue(this.store.node(this.fileId())?.name ?? '');
  }
}
