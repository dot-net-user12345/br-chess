import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BoardOrientation } from '../../core/chess-models';
import { PgnGridFileNode } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { ImageAttachments } from '../../shared/image-attachments';
import { BoardDialog } from '../../features/board-dialog/board-dialog';
import { PositionSearch } from './position-search';

describe('PositionSearch', () => {
  function file(id: string, orientation: BoardOrientation, pgns: string[]): PgnGridFileNode {
    return {
      id,
      name: id,
      kind: 'file',
      fileType: 'pgn-grid',
      parentId: null,
      ownerId: 'me',
      createdAt: '',
      updatedAt: '',
      content: {
        orientation,
        entries: pgns.map((pgn, i) => ({
          id: `${id}-${i}`,
          pgn,
          // Every line has e4 marked at its third move.
          drawings: { 3: { squares: ['e4'], arrows: [] } },
        })),
      },
    } as PgnGridFileNode;
  }

  function setup() {
    const files = [
      file('London', 'white', ['1. d4 Nf6 2. Bf4 g6 3. e3 Bg7', '1. d4 d5 2. Nf3 Nf6']),
      file('Italian', 'white', ['1. e4 e5 2. Nf3 Nc6 3. Bc4']),
      file('Caro', 'black', ['1. e4 c6 2. Nf3 d5']),
    ];
    TestBed.configureTestingModule({
      imports: [PositionSearch],
      providers: [
        provideNoopAnimations(),
        { provide: ImageAttachments, useValue: { ensureSignedIn: async () => false } },
        {
          provide: WorkspaceStore,
          useValue: {
            pgnGridFiles: signal(files),
            pathOf: (id: string) => id,
            node: (id: string) => files.find((f) => f.id === id) ?? null,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PositionSearch);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      pattern: { set(pattern: Record<string, string>): void };
      orientation: { set(side: BoardOrientation): void };
      groups(): { line: { title: string }; tiles: { ply: number; caption: string }[] }[];
      status(): string;
      view: { set(view: 'grid' | 'large'): void };
      largeMode: { set(mode: 'single' | 'row'): void };
      open(group: unknown, ply: number): void;
    };
    return { fixture, page };
  }

  it('finds the move each line first reaches the pieces, in files of the chosen side', () => {
    const { fixture, page } = setup();
    expect(page.groups()).toEqual([]);

    // A white knight on f3: once per line, where it lands, though it stays there.
    page.pattern.set({ f3: 'N' });
    fixture.detectChanges();
    expect(page.groups().map((g) => g.line.title)).toEqual(['Italian › Line 1', 'London › Line 2']);
    expect(page.groups().map((g) => g.tiles.map((t) => t.caption))).toEqual([['2. Nf3'], ['2. Nf3']]);
    expect(page.status()).toBe('2 moves in 2 lines of your White files.');
    expect(fixture.nativeElement.querySelectorAll('.search__button').length).toBe(2);
    // The move's own drawing comes with it: 2. Nf3 is ply 3, where e4 is marked.
    expect(fixture.nativeElement.querySelectorAll('.square--marked').length).toBe(2);

    // Black's files are searched only when Black is chosen.
    page.orientation.set('black');
    expect(page.groups().map((g) => g.line.title)).toEqual(['Caro › Line 1']);
  });

  it('shows the boards large, one at a time or all in a row', () => {
    const { fixture, page } = setup();
    page.pattern.set({ f3: 'N' });
    page.view.set('large');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const caption = () => element.querySelector('.search__single .search__caption')?.textContent;
    const button = (label: string) =>
      element.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;

    expect(element.querySelectorAll('.search__button').length).toBe(1);
    expect(element.querySelector('.search__count')?.textContent).toContain('1 of 2');
    expect(button('Previous move').disabled).toBe(true);
    button('Next move').click();
    fixture.detectChanges();
    expect(element.querySelector('.search__count')?.textContent).toContain('2 of 2');
    expect(button('Next move').disabled).toBe(true);
    expect(caption()).toContain('2. Nf3');
    expect(element.querySelector('.search__single .search__path')?.textContent).toContain(
      'London › Line 2',
    );

    page.largeMode.set('row');
    fixture.detectChanges();
    expect(element.querySelectorAll('.search__row .search__button').length).toBe(2);
  });

  it('opens the large view with the line beside it', () => {
    const { fixture, page } = setup();
    page.pattern.set({ f4: 'B', g7: 'b' });
    const [group] = page.groups();
    // The bishop is on f4 from ply 3, but both pieces only once Black plays 3… Bg7.
    expect(group.tiles.map((t) => t.ply)).toEqual([6]);

    page.open(group, 6);
    fixture.detectChanges();
    expect(TestBed.inject(MatDialog).openDialogs[0].componentInstance).toBeInstanceOf(BoardDialog);
    const line = document.querySelector('.board-dialog__line') as HTMLElement;
    expect(line.getAttribute('aria-label')).toBe('Moves of London › Line 1');
    expect(line.querySelector('[aria-current="step"]')?.textContent?.trim()).toBe('Bg7');
  });
});
