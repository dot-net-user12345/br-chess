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

describe('ChessBoard piece outlines', () => {
  it('traces an upright dashed outline on its square, in the mark color', () => {
    const fixture = TestBed.createComponent(ChessBoard);
    fixture.componentRef.setInput('fen', START_FEN);
    fixture.componentRef.setInput('orientation', 'black');
    fixture.componentRef.setInput('drawing', {
      squares: ['f3'],
      arrows: [],
      squareColors: { f3: 'grey' },
      squareMarks: { f3: 'outline-N' },
    });
    fixture.detectChanges();
    const outline = (fixture.nativeElement as HTMLElement).querySelector('svg g[stroke-dasharray]');
    // From Black's side f3 sits in column 2 of row 2 (rank 1 on top), placed there unrotated.
    expect(outline?.getAttribute('transform')).toBe(`translate(2 2) scale(${1 / 45})`);
    expect(outline?.getAttribute('stroke')).toBe('rgba(66, 66, 66, 0.85)');
    expect(outline?.querySelectorAll('path').length).toBe(2);
  });
});

describe('ChessBoard arrow numbers', () => {
  it('puts the number on the arrow, in a disc of its color, shrinking longer ones', () => {
    const fixture = TestBed.createComponent(ChessBoard);
    fixture.componentRef.setInput('fen', START_FEN);
    fixture.componentRef.setInput('drawing', {
      squares: [],
      arrows: [
        { from: 'g1', to: 'f3', color: 'yellow', label: '1' },
        { from: 'b1', to: 'c3', label: '123' },
      ],
    });
    fixture.detectChanges();
    const texts = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('svg text'),
    ) as SVGTextElement[];
    expect(texts.map((t) => t.textContent?.trim())).toEqual(['1', '123']);
    // Dark digits on yellow, white on the default purple.
    expect(texts[0].getAttribute('fill')).toBe('#1f1f1f');
    expect(texts[1].getAttribute('fill')).toBe('#ffffff');
    expect(Number(texts[1].getAttribute('font-size'))).toBeLessThan(
      Number(texts[0].getAttribute('font-size')),
    );
  });
});
