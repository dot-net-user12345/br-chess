import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth-service';
import { BoardImageService } from '../../core/board-image-service';
import { WorkspaceRepository } from '../../core/workspace-repository';
import { WorkspaceStore } from '../../core/workspace-store';
import { ImageAttachments } from '../../shared/image-attachments';
import { BoardDiagramEditor } from '../board-diagram-editor/board-diagram-editor';
import { MultiStepNotesEditor } from './multi-step-notes-editor';

describe('Multi step notes and board diagrams', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
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
        { provide: ImageAttachments, useValue: { ensureSignedIn: async () => false } },
      ],
    });
    const store = TestBed.inject(WorkspaceStore);
    // Run the store's sign-in effect now, which starts a signed-out session
    // empty, so it doesn't clear the files the test is about to create.
    TestBed.tick();
    return store;
  }

  it('shows each note with its diagram, and the lines its moves come from', () => {
    const store = setup();
    const lines = store.createFile(null, 'pgn-grid');
    store.rename(lines.id, 'London');
    store.updatePgnGridContent(lines.id, {
      entries: [{ id: 'line-1', pgn: '1. d4 Nf6 2. Bf4', label: 'Main' }],
    });
    const diagram = store.createFile(null, 'board-diagram');
    store.rename(diagram.id, 'Bishop out');
    const notes = store.createFile(null, 'multi-step-notes');
    store.updateMultiStepNotes(notes.id, {
      fen: '8/8/8/8/5B2/8/8/8',
      notes: [
        {
          id: 'n1',
          diagramId: diagram.id,
          text: 'Develop the bishop first.',
          moves: [{ id: 'm1', fileId: lines.id, entryId: 'line-1', ply: 3 }],
        },
        { id: 'n2' },
      ],
    });

    const fixture = TestBed.createComponent(MultiStepNotesEditor);
    fixture.componentRef.setInput('fileId', notes.id);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('London › Main');
    expect(text).toContain('Bishop out');
    expect(text).toContain('2. Bf4');
    expect(text).toContain('8/8/8/8/5B2/8/8/8');
    // The second note has no diagram yet: a square to click to add one.
    expect(text).toContain('Add board diagram');
    const textareas = fixture.nativeElement.querySelectorAll('textarea');
    expect(textareas[0].value).toBe('Develop the bishop first.');
  });

  it('shows a move whose line was deleted as gone, rather than failing', () => {
    const store = setup();
    const notes = store.createFile(null, 'multi-step-notes');
    store.updateMultiStepNotes(notes.id, {
      notes: [{ id: 'n1', moves: [{ id: 'm1', fileId: 'gone', entryId: 'gone', ply: 1 }] }],
    });

    const fixture = TestBed.createComponent(MultiStepNotesEditor);
    fixture.componentRef.setInput('fileId', notes.id);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Move no longer exists');
  });

  it('draws on a board diagram and keeps the drawing in the file', () => {
    const store = setup();
    const diagram = store.createFile(null, 'board-diagram');
    const fixture = TestBed.createComponent(BoardDiagramEditor);
    fixture.componentRef.setInput('fileId', diagram.id);
    fixture.detectChanges();

    const editor = fixture.componentInstance as unknown as {
      onDraw(drawing: { squares: string[]; arrows: { from: string; to: string }[] }): void;
      dirty(): boolean;
    };
    editor.onDraw({ squares: ['e4'], arrows: [{ from: 'e2', to: 'e4' }] });

    const saved = store.node(diagram.id);
    expect(
      saved?.kind === 'file' && saved.fileType === 'board-diagram' && saved.content.drawing,
    ).toEqual({ squares: ['e4'], arrows: [{ from: 'e2', to: 'e4' }] });
    expect(editor.dirty()).toBe(true);
  });
});
