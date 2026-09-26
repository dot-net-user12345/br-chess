import { Clipboard } from '@angular/cdk/clipboard';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ChessService } from '../../core/chess-service';
import { BoardDialog } from '../board-dialog/board-dialog';
import { MoveExplorer, MoveExplorerLine } from './move-explorer';

describe('MoveExplorer', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [MoveExplorer],
      providers: [provideNoopAnimations()],
    });
    const chess = TestBed.inject(ChessService);
    const line: MoveExplorerLine = {
      id: 'line-1',
      label: 'Line 1',
      pgn: '1. e4 e5 2. Nf3',
      positions: chess.parsePgn('1. e4 e5 2. Nf3').positions,
      captions: {},
      focusPlies: [],
      moveImages: {},
    };
    const fixture = TestBed.createComponent(MoveExplorer);
    fixture.componentRef.setInput('lines', [line]);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('emits the saved caption when one is saved from the large view', () => {
    const { component } = setup();
    const emitted: { id: string; captions: Record<number, string> }[] = [];
    component.captionsChange.subscribe((change) => emitted.push(change));

    // Open the large view at 1… e5 (ply 2), as a right-click → Open large view does.
    (component as unknown as { openBoard(i: number, ply: number): void }).openBoard(0, 2);
    const dialogRef = TestBed.inject(MatDialog).openDialogs[0];
    const dialog = dialogRef.componentInstance as BoardDialog;
    const internals = dialog as unknown as {
      captionControl: { setValue(v: string): void };
      saveCaption(): void;
    };
    internals.captionControl.setValue('Symmetrical reply');
    internals.saveCaption();

    expect(emitted).toEqual([{ id: 'line-1', captions: { 2: 'Symmetrical reply' } }]);
  });

  it("emits the line's image map when a move's images change in the large view", () => {
    const { component } = setup();
    const emitted: unknown[] = [];
    component.moveImagesChange.subscribe((change) => emitted.push(change));
    const image = { id: 'img-1', url: 'https://example.test/a.png', path: 'uploads/u/img-1', name: 'a.png' };

    (component as unknown as { openBoard(i: number, ply: number): void }).openBoard(0, 3);
    const dialog = TestBed.inject(MatDialog).openDialogs[0].componentInstance as unknown as {
      saveImages(ply: number, images: unknown[]): void;
    };
    dialog.saveImages(3, [image]);
    dialog.saveImages(3, []);

    expect(emitted).toEqual([
      { id: 'line-1', moveImages: { 3: [image] } },
      { id: 'line-1', moveImages: {} },
    ]);
  });

  it("copies the right-clicked board's FEN, and its line's moves up to it", () => {
    const { component } = setup();
    const copied: string[] = [];
    vi.spyOn(TestBed.inject(Clipboard), 'copy').mockImplementation((text: string) => {
      copied.push(text);
      return true;
    });
    const internals = component as unknown as {
      onMoveContextMenu(event: MouseEvent, key: string): void;
      copyMenuTargetFen(): void;
      copyMenuTargetPgn(): void;
    };

    // Right-click 2. Nf3 (ply 3), as on a pinned board in the bottom strip.
    internals.onMoveContextMenu(new MouseEvent('contextmenu'), '0:3');
    internals.copyMenuTargetFen();
    internals.copyMenuTargetPgn();

    const chess = TestBed.inject(ChessService);
    expect(copied).toEqual([
      chess.parsePgn('1. e4 e5 2. Nf3').positions[3].fen,
      '1. e4 e5\n2. Nf3',
    ]);
  });
});
