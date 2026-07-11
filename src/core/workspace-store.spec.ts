import { TestBed } from '@angular/core/testing';

import { WorkspaceStore } from './workspace-store';
import { WorkspaceRepository } from './workspace-repository';
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
            loadAll: async () => [],
            saveNode: async () => {},
            deleteNode: async () => {},
          },
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
    expect(store.rootNodes().length).toBe(2);
    // folders sort before files
    expect(store.rootNodes()[0].id).toBe(folder.id);
  });

  it('nests files inside a folder and selects them', () => {
    const folder = store.createFolder(null);
    const file = store.createFile(folder.id, 'pgn-grid');

    expect(store.childrenOf(folder.id).map((n) => n.id)).toEqual([file.id]);
    expect(store.rootNodes().map((n) => n.id)).toEqual([folder.id]);
    expect(store.selectedNode()?.id).toBe(file.id);
  });

  it('deletes a folder and all descendants', () => {
    const folder = store.createFolder(null);
    const child = store.createFolder(folder.id);
    store.createFile(child.id, 'pgn-grid');

    store.deleteNode(folder.id);

    expect(store.rootNodes().length).toBe(0);
    expect(store.node(child.id)).toBeNull();
  });

  it('gives unique default names to siblings', () => {
    const a = store.createFolder(null);
    const b = store.createFolder(null);

    expect(a.name).not.toBe(b.name);
  });

  it('updates pgn-grid content locally', () => {
    const file = store.createFile(null, 'pgn-grid');
    const entryId = file.kind === 'file' ? file.content.entries[0].id : '';

    store.updatePgnGridContent(file.id, { entries: [{ id: entryId, pgn: '1. e4 e5' }] });

    const updated = store.node(file.id);
    expect(updated?.kind === 'file' && updated.content.entries[0].pgn).toBe('1. e4 e5');
  });
});
