export type NodeId = string;

/** The set of file types the workspace supports. `comparison` is added next. */
export type FileType = 'pgn-grid';

/** One PGN entry inside a pgn-grid file. */
export interface PgnEntry {
  readonly id: string;
  readonly pgn: string;
  /** User-editable display label. Falls back to a positional default when unset. */
  readonly label?: string;
  /** User-entered captions per board position, keyed by ply (0 = starting position). */
  readonly captions?: Readonly<Record<number, string>>;
  /**
   * Cloud Storage download URLs for each rendered board position, in ply order
   * (index 0 is the starting position). Populated on save; absent for entries
   * whose PGN is empty or invalid.
   */
  readonly boardImageUrls?: readonly string[];
}

/** Content of a `pgn-grid` file: one or more PGNs, each rendered as a board grid. */
export interface PgnGridContent {
  readonly entries: readonly PgnEntry[];
}

interface BaseNode {
  readonly id: NodeId;
  readonly name: string;
  /** Parent folder id, or null when the node lives at the workspace root. */
  readonly parentId: NodeId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FolderNode extends BaseNode {
  readonly kind: 'folder';
}

export interface PgnGridFileNode extends BaseNode {
  readonly kind: 'file';
  readonly fileType: 'pgn-grid';
  readonly content: PgnGridContent;
}

/** Union of every file node type. Grows as new file types are added. */
export type FileNode = PgnGridFileNode;

export type WorkspaceNode = FolderNode | FileNode;

export const isFolder = (node: WorkspaceNode): node is FolderNode => node.kind === 'folder';
export const isFile = (node: WorkspaceNode): node is FileNode => node.kind === 'file';

/** Human-readable label for a file type, used in the UI. */
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  'pgn-grid': 'PGN grid',
};
