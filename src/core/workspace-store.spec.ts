import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkspaceStore } from './workspace-store';
import { WorkspaceRepository } from './workspace-repository';
import { AuthService } from './auth-service';
import { BoardImageService } from './board-image-service';
import { isFile, isFolder } from './workspace-models';

describe('WorkspaceStore', () => {
  let store: WorkspaceStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceRepository,
          useValue: {
            isConfigured: false,
            loadForUser: async () => [],
            saveNode: async () => {},
            deleteNode: async () => {},
          },
        },
        {
          // Signed out: the store stays local, so no Firebase Auth is needed.
          provide: AuthService,
          useValue: { user: signal(null), isSignedIn: signal(false) },
        },
        {
          // Board rendering hits Cloud Storage, which these tests don't exercise.
          provide: BoardImageService,
          useValue: { urlsForPositions: async () => [] },
        },
      ],
    });
    store = TestBed.inject(WorkspaceStore);
  });

  it('creates folders and files at the root', () => {
    const folder = store.createFolder(null);
    const file = store.createFile(null, 'pgn-grid');

    expect(isFolder(folder)).toBe(true);
    expect(isFile(file)).toBe(true);
    expect(store.rootsOf('lines').length).toBe(2);
    // folders sort before files
    expect(store.rootsOf('lines')[0].id).toBe(folder.id);
  });

  it('nests files inside a folder and selects them', () => {
    const folder = store.createFolder(null);
    const file = store.createFile(folder.id, 'pgn-grid');

    expect(store.childrenOf(folder.id).map((n) => n.id)).toEqual([file.id]);
    expect(store.rootsOf('lines').map((n) => n.id)).toEqual([folder.id]);
    expect(store.selectedIn('lines')?.id).toBe(file.id);
  });

  it('deletes a folder and all descendants', () => {
    const folder = store.createFolder(null);
    const child = store.createFolder(folder.id);
    store.createFile(child.id, 'pgn-grid');

    store.deleteNode(folder.id);

    expect(store.rootsOf('lines').length).toBe(0);
    expect(store.node(child.id)).toBeNull();
  });

  it('gives unique default names to siblings', () => {
    const a = store.createFolder(null);
    const b = store.createFolder(null);

    expect(a.name).not.toBe(b.name);
  });

  it('updates pgn-grid content locally', () => {
    const file = store.createFile(null, 'pgn-grid');
    const entryId =
      file.kind === 'file' && file.fileType === 'pgn-grid' ? file.content.entries[0].id : '';

    store.updatePgnGridContent(file.id, { entries: [{ id: entryId, pgn: '1. e4 e5' }] });

    const updated = store.node(file.id);
    expect(
      updated?.kind === 'file' && updated.fileType === 'pgn-grid' && updated.content.entries[0].pgn,
    ).toBe('1. e4 e5');
  });
});

describe('WorkspaceStore trees', () => {
  let store: WorkspaceStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceRepository,
          useValue: {
            isConfigured: false,
            loadForUser: async () => [],
            saveNode: async () => {},
            deleteNode: async () => {},
          },
        },
        { provide: AuthService, useValue: { user: signal(null), isSignedIn: signal(false) } },
        { provide: BoardImageService, useValue: { urlsForPositions: async () => [] } },
      ],
    });
    store = TestBed.inject(WorkspaceStore);
  });

  it('keeps each tree to its own folders and files', () => {
    const lines = store.createFile(null, 'pgn-grid');
    const folder = store.createFolder(null, 'diagrams');
    const diagram = store.createFile(folder.id, 'board-diagram');
    const notes = store.createFile(null, 'multi-step-notes');

    expect(store.rootsOf('lines').map((n) => n.id)).toEqual([lines.id]);
    expect(store.rootsOf('diagrams').map((n) => n.id)).toEqual([folder.id]);
    expect(store.childrenOf(folder.id, 'diagrams').map((n) => n.id)).toEqual([diagram.id]);
    expect(store.rootsOf('notes').map((n) => n.id)).toEqual([notes.id]);
    expect(store.boardDiagrams().map((n) => n.id)).toEqual([diagram.id]);
    expect(store.multiStepNotes().map((n) => n.id)).toEqual([notes.id]);
  });

  it('keeps a selection per tree', () => {
    const lines = store.createFile(null, 'pgn-grid');
    const diagram = store.createFile(null, 'board-diagram');

    expect(store.selectedIn('lines')?.id).toBe(lines.id);
    expect(store.selectedIn('diagrams')?.id).toBe(diagram.id);
    expect(store.isSelected(lines.id)).toBe(true);
  });

  it('only creates new files in a folder of the same tree', () => {
    store.createFolder(null, 'diagrams');

    expect(store.targetParentId('lines')).toBeNull();
  });

  it("won't move a node into another tree's folder", () => {
    const linesFolder = store.createFolder(null);
    const diagram = store.createFile(null, 'board-diagram');

    store.moveNode(diagram.id, linesFolder.id);

    expect(store.node(diagram.id)?.parentId).toBeNull();
  });

  it('starts new diagrams on an empty board and notes with one note', () => {
    const diagram = store.createFile(null, 'board-diagram');
    const notes = store.createFile(null, 'multi-step-notes');

    expect(
      diagram.kind === 'file' && diagram.fileType === 'board-diagram' && diagram.content.fen,
    ).toBe('8/8/8/8/8/8/8/8');
    expect(
      notes.kind === 'file' && notes.fileType === 'multi-step-notes' && notes.content.notes.length,
    ).toBe(1);
  });
});
