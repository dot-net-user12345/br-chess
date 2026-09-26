import { Directive, ElementRef, inject, output, signal } from '@angular/core';

/**
 * Accepts images pasted (Ctrl/Cmd+V) or dragged onto the host — a screenshot
 * from the clipboard, a picture copied or dragged from a browser tab, or files
 * dropped from the desktop — and emits them as files, so they can be attached
 * without going through a file picker.
 *
 * A paste that holds no image is left alone, so pasting text into a field
 * inside the host still works as usual.
 */
@Directive({
  selector: '[appImageDrop]',
  host: {
    '[class.image-drop--over]': 'over()',
    '(document:paste)': 'onPaste($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class ImageDrop {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Emits the image files pasted or dropped onto the host. */
  readonly imageFiles = output<File[]>();

  /** True while images are being dragged over the host, to highlight it as a target. */
  protected readonly over = signal(false);

  /**
   * Heard on the document, since a paste with focus on a plain element (not a
   * text field) can target the page body rather than the focused element.
   * Taken only when the paste or the focus is inside the host.
   */
  protected onPaste(event: ClipboardEvent): void {
    const host = this.host.nativeElement;
    const inside =
      (event.target instanceof Node && host.contains(event.target)) ||
      host.contains(document.activeElement);
    if (!inside || event.defaultPrevented) {
      return;
    }
    const files = imageFilesIn(event.clipboardData);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    this.imageFiles.emit(files);
  }

  protected onDragOver(event: DragEvent): void {
    // Only files are welcome; dragging text or a link over the host is ignored.
    if (!event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.over.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    // Leaving for one of the host's own children is still "over" the host.
    const host = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !host.contains(event.relatedTarget)) {
      this.over.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    this.over.set(false);
    const files = imageFilesIn(event.dataTransfer);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    this.imageFiles.emit(files);
  }
}

/** The image files a paste or drop carries, named so a pasted screenshot reads sensibly. */
export function imageFilesIn(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }
  const files = Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return files.map((file, i) =>
    // A clipboard screenshot arrives as a bare `image.png`; give it a clearer name.
    /^image\.\w+$/.test(file.name)
      ? new File([file], `Pasted image ${i + 1}.${file.type.split('/')[1] ?? 'png'}`, {
          type: file.type,
        })
      : file,
  );
}
