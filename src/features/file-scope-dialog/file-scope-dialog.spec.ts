import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { WorkspaceNode } from '../../core/workspace-models';
import { WorkspaceStore } from '../../core/workspace-store';
import { FileScopeDialog } from './file-scope-dialog';

describe('FileScopeDialog', () => {
  // Openings/ (London, Italian), Endgames/ (empty), Scratch
  const nodes = [
    { id: 'openings', name: 'Openings', kind: 'folder', parentId: null },
    { id: 'london', name: 'London', kind: 'file', parentId: 'openings' },
    { id: 'italian', name: 'Italian', kind: 'file', parentId: 'openings' },
    { id: 'endgames', name: 'Endgames', kind: 'folder', parentId: null },
    { id: 'scratch', name: 'Scratch', kind: 'file', parentId: null },
  ] as unknown as WorkspaceNode[];

  function setup(excluded: string[] = []) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [FileScopeDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { excluded: new Set(excluded) } },
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: WorkspaceStore,
          useValue: {
            childrenOf: (parentId: string | null) => nodes.filter((n) => n.parentId === parentId),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(FileScopeDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as {
      rows(): { id: string; depth: number }[];
      state(row: unknown): 'all' | 'some' | 'none';
      toggle(row: unknown): void;
      setAll(include: boolean): void;
      apply(): void;
    };
    const row = (id: string) => dialog.rows().find((r) => r.id === id)!;
    return { fixture, dialog, close, row };
  }

  it('lists every folder and file, nested, all checked by default', () => {
    const { fixture, dialog, row } = setup();
    expect(dialog.rows().map((r) => `${r.id}:${r.depth}`)).toEqual([
      'openings:0',
      'london:1',
      'italian:1',
      'endgames:0',
      'scratch:0',
    ]);
    expect(dialog.state(row('openings'))).toBe('all');
    const boxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBe(5);
    // A folder with no files has nothing to search.
    expect(boxes[3].disabled).toBe(true);
  });

  it('unchecks a folder with everything in it, and shows a part-checked folder', () => {
    const { dialog, close, row } = setup();
    dialog.toggle(row('london'));
    expect(dialog.state(row('openings'))).toBe('some');

    // A part-checked folder checks everything in it again; then unchecks it all.
    dialog.toggle(row('openings'));
    expect(dialog.state(row('london'))).toBe('all');
    dialog.toggle(row('openings'));
    expect(dialog.state(row('openings'))).toBe('none');

    dialog.apply();
    expect(close).toHaveBeenCalledWith(new Set(['london', 'italian']));
  });

  it('checks and unchecks everything at once', () => {
    const { dialog, close } = setup(['london']);
    dialog.setAll(false);
    dialog.apply();
    expect(close).toHaveBeenLastCalledWith(new Set(['london', 'italian', 'scratch']));
    dialog.setAll(true);
    dialog.apply();
    expect(close).toHaveBeenLastCalledWith(new Set());
  });
});
