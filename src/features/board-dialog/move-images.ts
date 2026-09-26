import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UploadedImage } from '../../core/workspace-models';
import { ImageAttachments, takeImageFiles } from '../../shared/image-attachments';
import { ImageDrop } from '../../shared/image-drop';

/**
 * One move's own reference images, shown in the large board view: upload,
 * view full size, and delete. Emits the whole replacement list whenever it
 * changes; the owner records and saves it.
 */
@Component({
  selector: 'app-move-images',
  imports: [MatButtonModule, MatIconModule, ImageDrop],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="move-images"
      [attr.aria-labelledby]="headingId"
      appImageDrop
      (imageFiles)="addFiles($event)"
    >
      <div class="move-images__header">
        <h3 [id]="headingId" class="move-images__heading">Images</h3>
        <input
          #imageInput
          type="file"
          accept="image/*"
          multiple
          hidden
          (change)="onImagesSelected($event)"
        />
        <button
          matButton="outlined"
          type="button"
          [disabled]="uploading()"
          [attr.aria-label]="uploading() ? 'Uploading image' : 'Upload image for ' + move()"
          (click)="imageInput.click()"
        >
          <mat-icon>upload</mat-icon>
          {{ uploading() ? 'Uploading…' : 'Upload' }}
        </button>
      </div>

      <!-- Focusable, so a keyboard user can land here and paste. -->
      <p class="move-images__dropzone" tabindex="0">
        Paste (Ctrl+V) or drop images here
      </p>

      @if (error(); as message) {
        <p class="move-images__error" role="alert">{{ message }}</p>
      }

      @if (images().length > 0) {
        <ul class="move-images__grid">
          @for (image of images(); track image.id) {
            <li class="move-images__item">
              <a
                class="move-images__thumb"
                [href]="image.url"
                target="_blank"
                rel="noopener noreferrer"
                [attr.aria-label]="'View ' + image.name + ' full size'"
              >
                <img [src]="image.url" [alt]="image.name" loading="lazy" />
              </a>
              <button
                matIconButton
                type="button"
                class="move-images__remove"
                [attr.aria-label]="'Delete ' + image.name + ' from ' + move()"
                (click)="confirmRemove(image)"
              >
                <mat-icon>delete_outline</mat-icon>
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="move-images__empty">No images for this move yet.</p>
      }
    </section>
  `,
  styles: `
    .move-images {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .move-images__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .move-images__heading {
      margin: 0;
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .move-images__dropzone {
      margin: 0;
      padding: 0.5rem 0.75rem;
      border: 1px dashed var(--mat-sys-outline);
      border-radius: var(--mat-sys-corner-small);
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      text-align: center;

      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
    }

    /* Images dragged over the section: highlight it as the drop target. */
    .image-drop--over .move-images__dropzone {
      border-style: solid;
      border-color: var(--mat-sys-primary);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .move-images__error {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }

    .move-images__empty {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .move-images__grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
      gap: 0.5rem;
    }

    .move-images__item {
      position: relative;
    }

    .move-images__thumb {
      display: block;
      aspect-ratio: 1;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-small);
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
    }

    .move-images__remove {
      position: absolute;
      top: 0.125rem;
      right: 0.125rem;
      background: color-mix(in srgb, var(--mat-sys-surface) 70%, transparent);
    }
  `,
})
export class MoveImages {
  private readonly attachments = inject(ImageAttachments);

  /** The move's images, in the order added. */
  readonly images = input<readonly UploadedImage[]>([]);
  /** The move they belong to, e.g. `5… O-O`, for labels and the delete prompt. */
  readonly move = input.required<string>();
  /** The move's ply, returned with each change so it lands on the right move. */
  readonly ply = input.required<number>();

  /**
   * Emits the move's whole updated list after an upload or a delete. Carries
   * the ply the change was started on, since an upload can finish after the
   * view has moved on to another move.
   */
  readonly imagesChange = output<{ ply: number; images: UploadedImage[] }>();

  protected readonly headingId = `move-images-${crypto.randomUUID()}`;
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected onImagesSelected(event: Event): void {
    void this.addFiles(takeImageFiles(event));
  }

  /** Uploads `files` and adds them to the move — picked, pasted, or dropped alike. */
  async addFiles(files: readonly File[]): Promise<void> {
    if (files.length === 0 || this.uploading()) {
      return;
    }
    const ply = this.ply();
    const images = this.images();
    this.error.set(null);
    this.uploading.set(true);
    try {
      const uploaded = await this.attachments.upload(files);
      if (uploaded) {
        this.imagesChange.emit({ ply, images: [...images, ...uploaded] });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Uploading the image failed.');
    } finally {
      this.uploading.set(false);
    }
  }

  /** Confirms before detaching an image, since the stored file is also removed. */
  protected async confirmRemove(image: UploadedImage): Promise<void> {
    if (!(await this.attachments.confirmRemove(image, this.move()))) {
      return;
    }
    this.imagesChange.emit({
      ply: this.ply(),
      images: this.images().filter((img) => img.id !== image.id),
    });
    this.attachments.detach(image);
  }
}
