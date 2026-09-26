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
      drawings: {},
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

  it('keeps drawing edits unsaved until Save, then emits every edited move', () => {
    const { component } = setup();
    const emitted: unknown[] = [];
    component.drawingsChange.subscribe((change) => emitted.push(change));

    (component as unknown as { openBoard(i: number, ply: number): void }).openBoard(0, 1);
    const dialog = TestBed.inject(MatDialog).openDialogs[0].componentInstance as unknown as {
      onDraw(drawing: unknown): void;
      next(): void;
      saveDrawings(): void;
      hasUnsavedDrawings(): boolean;
    };
    const onE4 = { squares: ['e4'], arrows: [] };
    const onE5 = { squares: [], arrows: [{ from: 'g1', to: 'f3' }] };
    dialog.onDraw(onE4);
    dialog.next();
    dialog.onDraw(onE5);

    expect(emitted).toEqual([]);
    expect(dialog.hasUnsavedDrawings()).toBe(true);

    dialog.saveDrawings();

    expect(dialog.hasUnsavedDrawings()).toBe(false);
    expect(emitted).toEqual([{ id: 'line-1', drawings: { 1: onE4, 2: onE5 } }]);
  });

  it('filters to the lines that play a single move, highlighting it', () => {
    TestBed.configureTestingModule({
      imports: [MoveExplorer],
      providers: [provideNoopAnimations()],
    });
    const chess = TestBed.inject(ChessService);
    const line = (id: string, pgn: string): MoveExplorerLine => ({
      id,
      label: id,
      pgn,
      positions: chess.parsePgn(pgn).positions,
      captions: {},
      focusPlies: [],
      moveImages: {},
      drawings: {},
    });
    const fixture = TestBed.createComponent(MoveExplorer);
    fixture.componentRef.setInput('lines', [
      line('A', '1. d4 Nf6 2. Bf4 g6'),
      line('B', '1. d4 d5 2. Bf4 Nf6'),
      line('C', '1. e4 e5 2. Nf3 Nc6'),
    ]);
    fixture.detectChanges();
    const explorer = fixture.componentInstance as unknown as {
      moveControl: { setValue(v: string): void };
      visibleColumns(): { label: string }[];
      isMatch(key: string): boolean;
      filterStatus(): string;
    };
    const labels = () => explorer.visibleColumns().map((c) => c.label);

    // Anywhere in the line: A plays it as Black's first move, B as Black's second.
    explorer.moveControl.setValue('Nf6');
    expect(labels()).toEqual(['A', 'B']);
    expect(explorer.isMatch('0:2')).toBe(true);
    expect(explorer.isMatch('1:4')).toBe(true);
    expect(explorer.filterStatus()).toBe('Showing 2 of 3 lines.');

    // Anchored to a move number and side.
    explorer.moveControl.setValue('1... Nf6');
    expect(labels()).toEqual(['A']);

    // Not a move yet: every line stays.
    explorer.moveControl.setValue('Zz');
    expect(labels()).toEqual(['A', 'B', 'C']);
    expect(explorer.filterStatus()).toContain('Move filter: not a move yet.');
  });

  it('filters to the lines reaching a board with a given piece on a given square', () => {
    TestBed.configureTestingModule({
      imports: [MoveExplorer],
      providers: [provideNoopAnimations()],
    });
    const chess = TestBed.inject(ChessService);
    const line = (id: string, pgn: string): MoveExplorerLine => ({
      id,
      label: id,
      pgn,
      positions: chess.parsePgn(pgn).positions,
      captions: {},
      focusPlies: [],
      moveImages: {},
      drawings: {},
    });
    const fixture = TestBed.createComponent(MoveExplorer);
    fixture.componentRef.setInput('lines', [
      line('A', '1. d4 Nf6 2. Bf4 g6'),
      line('B', '1. d4 d5 2. Nf3 Nf6'),
      line('C', '1. e4 e5 2. Nf3 Nc6'),
    ]);
    fixture.detectChanges();
    const explorer = fixture.componentInstance as unknown as {
      pieceColorControl: { setValue(v: string): void };
      pieceTypeControl: { setValue(v: string): void };
      squareControl: { setValue(v: string): void };
      visibleColumns(): { label: string }[];
      isPositionMatch(key: string): boolean;
      filterStatus(): string;
    };
    const labels = () => explorer.visibleColumns().map((c) => c.label);

    // A white bishop on f4: only line A, from 2. Bf4 (ply 3) onwards.
    explorer.pieceColorControl.setValue('white');
    explorer.pieceTypeControl.setValue('B');
    explorer.squareControl.setValue('F4');
    expect(labels()).toEqual(['A']);
    expect(explorer.isPositionMatch('0:3')).toBe(true);
    expect(explorer.isPositionMatch('0:4')).toBe(true);
    expect(explorer.isPositionMatch('0:2')).toBe(false);

    // Any piece of either color on f3: lines B and C.
    explorer.pieceColorControl.setValue('');
    explorer.pieceTypeControl.setValue('');
    explorer.squareControl.setValue('f3');
    expect(labels()).toEqual(['B', 'C']);

    // A black knight on f6: lines A and B.
    explorer.pieceColorControl.setValue('black');
    explorer.pieceTypeControl.setValue('N');
    explorer.squareControl.setValue('f6');
    expect(labels()).toEqual(['A', 'B']);

    // Not a square yet: nothing is filtered, and the status says why.
    explorer.squareControl.setValue('f');
    expect(labels()).toEqual(['A', 'B', 'C']);
    expect(explorer.filterStatus()).toContain('enter a square like e4');
  });
});
