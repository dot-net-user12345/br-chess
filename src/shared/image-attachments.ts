import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth-service';
import { ImageUploadService } from '../core/image-upload-service';
import { UploadedImage } from '../core/workspace-models';
import { WorkspaceRepository } from '../core/workspace-repository';
import { ConfirmDialog, ConfirmDialogData } from '../features/confirm-dialog/confirm-dialog';
import { LoginDialog } from '../features/login-dialog/login-dialog';

/**
 * Pulls the image files out of a file input's selection and clears it, so
 * picking the same file again still fires a change event.
 */
export function takeImageFiles(event: Event): File[] {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/'));
  input.value = '';
  return files;
}

/**
 * The user-facing half of attaching images: prompts for sign-in, uploads to the
 * signed-in user's Storage namespace, and confirms before detaching. Shared by
 * every place images can be attached (a file, a line's middle-game plan), so
 * they behave identically.
 */
@Injectable({ providedIn: 'root' })
export class ImageAttachments {
  private readonly auth = inject(AuthService);
  private readonly uploads = inject(ImageUploadService);
  private readonly repo = inject(WorkspaceRepository);
  private readonly dialog = inject(MatDialog);

  /**
   * Uploads `files` and resolves the attachments to record, or null when the
   * user dismissed the sign-in prompt. Throws with a message to show when
   * Firebase is unconfigured or an upload fails.
   */
  async upload(files: readonly File[]): Promise<UploadedImage[] | null> {
    if (files.length === 0) {
      return null;
    }
    if (!this.repo.isConfigured) {
      throw new Error('Firebase is not configured, so images can’t be uploaded.');
    }
    if (!(await this.ensureSignedIn())) {
      return null;
    }
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return null;
    }
    const uploaded: UploadedImage[] = [];
    for (const file of files) {
      const { url, path } = await this.uploads.upload(file, uid);
      uploaded.push({ id: crypto.randomUUID(), url, path, name: file.name });
    }
    return uploaded;
  }

  /**
   * Confirms detaching an image, since the stored object is removed too.
   * `from` names what it is being removed from, e.g. `this file`.
   */
  async confirmRemove(image: UploadedImage, from: string): Promise<boolean> {
    const data: ConfirmDialogData = {
      title: 'Delete image?',
      message: `“${image.name}” will be removed from ${from}.`,
      confirmLabel: 'Delete',
    };
    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialog, { data, autoFocus: 'first-tabbable' }).afterClosed(),
    );
    return confirmed === true;
  }

  /** Best-effort cleanup of a detached image's stored object; failures are ignored. */
  detach(image: UploadedImage): void {
    void this.uploads.delete(image.path).catch(() => undefined);
  }

  /** Ensures a signed-in user, prompting the login dialog when needed. */
  async ensureSignedIn(): Promise<boolean> {
    if (this.auth.isSignedIn()) {
      return true;
    }
    const user = await firstValueFrom(
      this.dialog.open(LoginDialog, { autoFocus: 'dialog' }).afterClosed(),
    );
    return !!user;
  }
}
