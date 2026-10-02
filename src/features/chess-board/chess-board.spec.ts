import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChessBoard } from './chess-board';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The coordinate labels in grid order, as `index:label` pairs. */
function coordinates(fixture: ComponentFixture<ChessBoard>, kind: 'rank' | 'file'): string[] {
  const host = fixture.nativeElement as HTMLElement;
  const squares = Array.from(host.querySelectorAll('.square'));
  return squares.flatMap((square, index) => {
    const label = square.querySelector(`.square__coord--${kind}`);
    return label ? [`${index}:${label.textContent?.trim()}`] : [];
  });
}

describe('ChessBoard coordinates', () => {
  let fixture: ComponentFixture<ChessBoard>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChessBoard);
    fixture.componentRef.setInput('fen', START_FEN);
  });

  it('labels the left file and bottom rank from the White side', () => {
    fixture.componentRef.setInput('orientation', 'white');
    fixture.detectChanges();
    // Numbers in column 0, counting down 8→1; letters in the last row, a→h.
    expect(coordinates(fixture, 'rank')).toEqual([
      '0:8', '8:7', '16:6', '24:5', '32:4', '40:3', '48:2', '56:1',
    ]);
    expect(coordinates(fixture, 'file')).toEqual([
      '56:a', '57:b', '58:c', '59:d', '60:e', '61:f', '62:g', '63:h',
    ]);
  });

  it('flips the coordinates with the board for Black', () => {
    fixture.componentRef.setInput('orientation', 'black');
    fixture.detectChanges();
    expect(coordinates(fixture, 'rank')).toEqual([
      '0:1', '8:2', '16:3', '24:4', '32:5', '40:6', '48:7', '56:8',
    ]);
    expect(coordinates(fixture, 'file')).toEqual([
      '56:h', '57:g', '58:f', '59:e', '60:d', '61:c', '62:b', '63:a',
    ]);
  });
});
