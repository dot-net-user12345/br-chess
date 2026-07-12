import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/**
 * Focuses (and, for text fields, selects) the host element once it is rendered.
 * Handy for inputs revealed by `@if`, e.g. an inline rename field.
 */
@Directive({
  selector: '[appFocusOnInit]',
})
export class FocusOnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      const node = this.host.nativeElement;
      node.focus();
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        node.select();
      }
    });
  }
}
