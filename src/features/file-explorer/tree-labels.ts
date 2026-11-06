import { WorkspaceTree } from '../../core/workspace-models';

/** What the explorer calls each tree and the files in it. */
export const TREE_LABELS: Readonly<
  Record<
    WorkspaceTree,
    { readonly title: string; readonly file: string; readonly fileIcon: string }
  >
> = {
  lines: { title: 'Files', file: 'PGN grid file', fileIcon: 'grid_on' },
  diagrams: { title: 'Board diagrams', file: 'board diagram', fileIcon: 'insert_chart' },
  notes: { title: 'Multi step notes', file: 'notes file', fileIcon: 'sticky_note_2' },
};
