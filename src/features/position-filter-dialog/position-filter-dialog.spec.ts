import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PieceCode } from '../../core/chess-models';
import { PositionPattern } from '../../core/position-pattern';
import { PositionFilterDialog, PositionFilterDialogData } from './position-filter-dialog';

describe('PositionFilterDialog', () => {
  function setup(pattern: PositionPattern = {}) {
    const close = vi.fn();
    const data: PositionFilterDialogData = { pattern, orientation: 'white' };
    TestBed.configureTestingModule({
      imports: [PositionFilterDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(PositionFilterDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as {
      choose(piece: PieceCode): void;
      activate(square: string): void;
      clear(): void;
      apply(): void;
      summary(): string;
    };
    const square = (name: string) =>
      fixture.nativeElement.querySelector(`[data-square="${name}"]`) as HTMLButtonElement;
    return { fixture, dialog, close, square };
  }

  it('opens on an empty board, rank 8 first, with every square labelled', () => {
    const { fixture, square } = setup();
    const squares = fixture.nativeElement.querySelectorAll('[data-square]');
    expect(squares.length).toBe(64);
    expect(squares[0].dataset.square).toBe('a8');
    expect(square('e4').getAttribute('aria-label')).toBe('e4, empty');
  });

  it('places the selected piece on a square, and removes it again', () => {
    const { fixture, dialog, close, square } = setup({ e4: 'P' });
    dialog.choose('N');
    dialog.activate('f3');
    fixture.detectChanges();
    expect(square('f3').getAttribute('aria-label')).toBe('f3, white knight');
    expect(dialog.summary()).toBe('White knight on f3, white pawn on e4');

    // The same piece again empties the square; with nothing picked, a square is cleared.
    dialog.activate('f3');
    dialog.choose('N');
    dialog.activate('e4');
    dialog.apply();
    expect(close).toHaveBeenCalledWith({});
  });

  it('clears the board', () => {
    const { dialog, close } = setup({ e4: 'P', e5: 'p' });
    dialog.clear();
    dialog.apply();
    expect(close).toHaveBeenCalledWith({});
  });
});
