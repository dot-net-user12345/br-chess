import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../core/auth-service';
import { ImageUploadService } from '../../core/image-upload-service';
import { WorkspaceRepository } from '../../core/workspace-repository';
import { PgnContainer } from './pgn-container';

/** The protected members the format button drives, which the tests reach through. */
interface Internals {
  readonly control: FormControl<string>;
  canFormat(): boolean;
  formatPgn(): void;
}

describe('PgnContainer', () => {
  function setup(initialPgn: string) {
    TestBed.configureTestingModule({
      imports: [PgnContainer],
      providers: [
        provideNoopAnimations(),
        // The plan panel the template renders reaches for image uploads, which
        // need Firebase. Formatting the PGN does not, so these stand in.
        {
          provide: AuthService,
          useValue: { user: signal(null), isSignedIn: signal(false) },
        },
        { provide: ImageUploadService, useValue: {} },
        { provide: WorkspaceRepository, useValue: { isConfigured: false } },
      ],
    });
    const fixture = TestBed.createComponent(PgnContainer);
    fixture.componentRef.setInput('initialPgn', initialPgn);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    return { fixture, component, internals: component as unknown as Internals };
  }

  it('puts every full move on its own line', () => {
    const { internals } = setup('1. e4 e5 2. Nf3 Nc6 3. Bb5');
    expect(internals.canFormat()).toBe(true);

    internals.formatPgn();

    expect(internals.control.value).toBe('1. e4 e5\n2. Nf3 Nc6\n3. Bb5');
  });

  it("leaves White's last move alone when Black has not replied", () => {
    const { internals } = setup('1. e4 e5 2. Nf3');
    internals.formatPgn();
    expect(internals.control.value).toBe('1. e4 e5\n2. Nf3');
  });

  it('tidies up however the moves were spaced and broken', () => {
    const { internals } = setup('1.e4\n\n   e5    2.Nf3\n   Nc6');
    internals.formatPgn();
    expect(internals.control.value).toBe('1. e4 e5\n2. Nf3 Nc6');
  });

  it('is unavailable once the PGN is already laid out that way', () => {
    const { internals } = setup('1. e4 e5\n2. Nf3 Nc6');
    expect(internals.canFormat()).toBe(false);
  });

  it('is unavailable while the PGN is empty', () => {
    expect(setup('').internals.canFormat()).toBe(false);
  });

  it('is unavailable while the PGN is not valid yet', () => {
    expect(setup('what a move').internals.canFormat()).toBe(false);
  });

  it('saves the reformatted text like any other edit', () => {
    const { component, internals } = setup('1. e4 e5 2. Nf3 Nc6');
    const emitted: string[] = [];
    component.contentChange.subscribe((change) => emitted.push(change.pgn));

    internals.formatPgn();

    expect(emitted).toEqual(['1. e4 e5\n2. Nf3 Nc6']);
  });

  it('keeps only the moves, since the PGN is rebuilt from them', () => {
    const { internals } = setup('[Event "Casual"]\n\n1. e4 {a fine start} e5 2. Nf3');
    internals.formatPgn();
    expect(internals.control.value).toBe('1. e4 e5\n2. Nf3');
  });
});
