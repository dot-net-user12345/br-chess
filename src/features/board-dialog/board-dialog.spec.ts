import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ChessService } from '../../core/chess-service';
import { BoardDrawing } from '../../core/workspace-models';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { BoardDialog, BoardDialogData } from './board-dialog';

describe('BoardDialog closing', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const chess = TestBed.inject(ChessService);
    const data: BoardDialogData = {
      tiles: chess.parsePgn('1. e4 e5').positions.map((position) => ({
        ply: position.ply,
        fen: position.fen,
        caption: position.san ?? 'Start',
        san: position.san,
        from: position.from,
        to: position.to,
      })),
      index: 1,
      captions: {},
      onCaptionChange: () => undefined,
      drawings: {},
      onDrawingsChange: () => undefined,
    };
    const dialogs = TestBed.inject(MatDialog);
    const ref: MatDialogRef<BoardDialog> = dialogs.open(BoardDialog, { data });
    TestBed.tick();
    const dialog = ref.componentInstance as unknown as {
      requestClose(): void;
      onDraw(drawing: BoardDrawing): void;
      saveDrawings(): void;
      captionControl: { setValue(text: string): void };
    };
    // Whether the dialog asked to close; afterClosed waits on the close animation.
    const closed = vi.spyOn(ref, 'close');
    const confirm = () =>
      dialogs.openDialogs.find((open) => open.componentInstance instanceof ConfirmDialog);
    return { dialog, closed, confirm };
  }

  it('closes straight away with nothing unsaved', () => {
    const { dialog, closed, confirm } = setup();
    dialog.requestClose();
    expect(confirm()).toBeUndefined();
    TestBed.tick();
    expect(closed).toHaveBeenCalled();
  });

  it('warns before dropping unsaved drawings, and stays open to keep editing', async () => {
    const { dialog, closed, confirm } = setup();
    dialog.onDraw({ squares: ['e4'], arrows: [] });
    dialog.requestClose();
    const warning = confirm();
    expect(warning).toBeDefined();
    expect((warning!.componentInstance as unknown as { data: { message: string } }).data.message).toContain(
      'drawing changes',
    );

    // Keep editing: the warning goes, the dialog stays.
    warning!.close(false);
    await firstValueFrom(warning!.afterClosed());
    expect(closed).not.toHaveBeenCalled();

    // Discard: both go.
    dialog.requestClose();
    const again = confirm()!;
    again.close(true);
    await firstValueFrom(again.afterClosed());
    expect(closed).toHaveBeenCalled();
  });

  it('warns about a caption typed but not saved', () => {
    const { dialog, confirm } = setup();
    dialog.captionControl.setValue('Opens the bishop');
    dialog.requestClose();
    expect(
      (confirm()!.componentInstance as unknown as { data: { message: string } }).data.message,
    ).toContain('caption');
  });
});
