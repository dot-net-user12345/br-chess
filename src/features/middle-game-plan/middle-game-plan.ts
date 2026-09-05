import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MiddleGamePlan, UploadedImage } from '../../core/workspace-models';
import { ImageAttachments, takeImageFiles } from '../../shared/image-attachments';

/**
 * Optional per-line section for what to play once the opening ends: free-text
 * notes plus reference images. Presents the saved plan and emits a whole
 * replacement whenever either part changes; the owner persists it.
 */
@Component({
  selector: 'app-middle-game-plan',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './middle-game-plan.html',
  styleUrl: './middle-game-plan.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiddleGamePlanPanel {
  private readonly attachments = inject(ImageAttachments);

  /** The line's saved plan; an empty object when it has none yet. */
  readonly plan = input<MiddleGamePlan>({});

  /** Emits the complete plan whenever its notes or images change. */
  readonly planChange = output<MiddleGamePlan>();

  /** Whether the panel is expanded; closed by default, since the plan is optional. */
  protected readonly expanded = signal(false);

  /** True while one or more selected images are being uploaded. */
  protected readonly uploading = signal(false);

  /** Last image-upload error to surface in the panel, or null when clear. */
  protected readonly error = signal<string | null>(null);

  protected readonly images = computed<readonly UploadedImage[]>(() => this.plan().images ?? []);

  /** Free-text notes for this line. Kept in sync with the saved plan. */
  protected readonly notesControl = new FormControl('', { nonNullable: true });

  /** What the collapsed header reports the plan holds. */
  protected readonly summary = computed(() => {
    const count = this.images().length;
    const parts: string[] = [];
    if ((this.plan().notes ?? '').trim().length > 0) {
      parts.push('Notes');
    }
    if (count > 0) {
      parts.push(`${count} ${count === 1 ? 'image' : 'images'}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Empty';
  });

  constructor() {
    // Seed notes when a different plan is shown, without clobbering a live edit
    // (the value we just emitted comes back unchanged, so setValue is skipped).
    effect(() => {
      const notes = this.plan().notes ?? '';
      if (notes !== this.notesControl.value) {
        this.notesControl.setValue(notes, { emitEvent: false });
      }
    });
    this.notesControl.valueChanges.subscribe((notes) => this.emit({ notes }));
  }

  /** Uploads the chosen image files and attaches them to this line's plan. */
  protected async onImagesSelected(event: Event): Promise<void> {
    const files = takeImageFiles(event);
    if (files.length === 0) {
      return;
    }
    this.error.set(null);
    this.uploading.set(true);
    try {
      const uploaded = await this.attachments.upload(files);
      if (uploaded) {
        this.emit({ images: [...this.images(), ...uploaded] });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Uploading the image failed.');
    } finally {
      this.uploading.set(false);
    }
  }

  /** Confirms before detaching an image, since the stored file is also removed. */
  protected async confirmRemoveImage(image: UploadedImage): Promise<void> {
    if (!(await this.attachments.confirmRemove(image, 'this line’s middle game plan'))) {
      return;
    }
    this.emit({ images: this.images().filter((img) => img.id !== image.id) });
    this.attachments.detach(image);
  }

  /**
   * Emits the plan with `patch` applied. Parts that carry nothing are left out
   * entirely, so an emptied plan emits `{}` and the owner can drop it.
   */
  private emit(patch: Partial<MiddleGamePlan>): void {
    const next = { ...this.plan(), ...patch };
    this.planChange.emit({
      ...(next.notes ? { notes: next.notes } : {}),
      ...(next.images?.length ? { images: next.images } : {}),
    });
  }
}
