import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { WorkspaceStore } from '../../core/workspace-store';

/** How long a success message lingers before dismissing itself. */
const SUCCESS_DISMISS_MS = 2500;

/**
 * A centered, backdropped status dialog for the save flow: light blue while
 * saving, light green on success, light red on failure. Reads the store's
 * status signal, so it appears and updates on its own.
 */
@Component({
  selector: 'app-save-status-dialog',
  imports: [A11yModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.status(); as status) {
      <div class="ssd__scrim" (click)="dismiss()">
        <div
          class="ssd__card"
          [class.ssd__card--info]="status.type === 'info'"
          [class.ssd__card--success]="status.type === 'success'"
          [class.ssd__card--error]="status.type === 'error'"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="status.text"
          tabindex="-1"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
          (keydown.escape)="dismiss()"
        >
          <span class="ssd__icon" aria-hidden="true">
            @switch (status.type) {
              @case ('info') {
                <mat-spinner [diameter]="26" [strokeWidth]="3" />
              }
              @case ('success') {
                <mat-icon>check_circle</mat-icon>
              }
              @default {
                <mat-icon>error</mat-icon>
              }
            }
          </span>
          <p class="ssd__text">{{ status.text }}</p>
          @if (status.type !== 'info') {
            <button matButton type="button" class="ssd__dismiss" (click)="dismiss()">Dismiss</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    /* Generate no box when idle so the host never occupies layout space; the
       scrim below is position:fixed, so it's unaffected. */
    :host { display: contents; }

    .ssd__scrim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(0, 0, 0, 0.5);
      animation: ssd-fade 120ms ease-out;
    }

    .ssd__card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      text-align: center;
      box-sizing: border-box;
      min-width: 16rem;
      max-width: min(28rem, 92vw);
      padding: 1.75rem 1.75rem 1.25rem;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 14px;
      box-shadow: 0 14px 44px rgba(0, 0, 0, 0.35);
      outline: none;
      animation: ssd-pop 140ms ease-out;
    }

    /* Fixed light tints so the state colors read the same in either theme. */
    .ssd__card--info { background: #e3f2fd; color: #0d47a1; }
    .ssd__card--success { background: #e8f5e9; color: #1b5e20; }
    .ssd__card--error { background: #ffebee; color: #b71c1c; }

    .ssd__icon {
      display: inline-flex;
    }
    .ssd__icon mat-icon {
      font-size: 2.25rem;
      width: 2.25rem;
      height: 2.25rem;
    }
    .ssd__card--success .ssd__icon mat-icon { color: #2e7d32; }
    .ssd__card--error .ssd__icon mat-icon { color: #c62828; }

    .ssd__text {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: inherit;
    }

    .ssd__dismiss {
      color: inherit;
    }

    @keyframes ssd-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes ssd-pop {
      from { opacity: 0; transform: translateY(6px) scale(0.98); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .ssd__scrim,
      .ssd__card { animation: none; }
    }
  `,
})
export class SaveStatusDialog {
  protected readonly store = inject(WorkspaceStore);

  constructor() {
    // A success message clears itself after a short delay; the timer resets if
    // the status changes first.
    effect((onCleanup) => {
      if (this.store.status()?.type === 'success') {
        const timer = setTimeout(() => this.store.clearStatus(), SUCCESS_DISMISS_MS);
        onCleanup(() => clearTimeout(timer));
      }
    });
  }

  protected dismiss(): void {
    this.store.clearStatus();
  }
}
