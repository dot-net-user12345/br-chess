import { inject, Injectable } from '@angular/core';
import { deleteObject, getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';

/** Result of uploading one image to Cloud Storage. */
export interface UploadedImageRef {
  /** Tokenized download URL for displaying the image. */
  readonly url: string;
  /** Storage path the object was written to, kept so it can be deleted later. */
  readonly path: string;
}

/**
 * Uploads user-attached images to Cloud Storage under `uploads/{uid}/{id}`, a
 * per-user namespace the Storage rules gate on ownership (unlike the shared,
 * content-addressed board renders under `moves/`).
 */
@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private readonly storage = inject(Storage);

  /** Uploads `file` for `uid` and resolves its download URL and storage path. */
  async upload(file: File, uid: string): Promise<UploadedImageRef> {
    const path = `uploads/${uid}/${crypto.randomUUID()}`;
    const fileRef = ref(this.storage, path);
    await uploadBytes(fileRef, file, { contentType: file.type });
    return { url: await getDownloadURL(fileRef), path };
  }

  /** Removes a previously uploaded object. Caller decides how to handle failure. */
  delete(path: string): Promise<void> {
    return deleteObject(ref(this.storage, path));
  }
}
