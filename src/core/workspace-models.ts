import { BoardOrientation } from './chess-models';

export type NodeId = string;

/** The set of file types the workspace supports. `comparison` is added next. */
export type FileType = 'pgn-grid';

/**
 * Optional per-line study material: what to aim for once the opening is over.
 * Both parts are omitted rather than left empty, so a line without a plan
 * carries no `middleGamePlan` field at all.
 */
export interface MiddleGamePlan {
  /** Free-text notes describing the plan. */
  readonly notes?: string;
  /** Reference images the user attached to the plan, in the order added. */
  readonly images?: readonly UploadedImage[];
}

/** One PGN entry inside a pgn-grid file. */
export interface PgnEntry {
  readonly id: string;
  readonly pgn: string;
  /** User-editable display label. Falls back to a positional default when unset. */
  readonly label?: string;
  /** User-entered captions per board position, keyed by ply (0 = starting position). */
  readonly captions?: Readonly<Record<number, string>>;
  /** Plies the user marked as focus points, in ascending order. Absent until one is marked. */
  readonly focusPlies?: readonly number[];
  /**
   * Cloud Storage download URLs for each rendered board position, in ply order
   * (index 0 is the starting position). Populated on save; absent for entries
   * whose PGN is empty or invalid.
   */
  readonly boardImageUrls?: readonly string[];
  /** Notes and images for this line's middle game. Absent until the user adds one. */
  readonly middleGamePlan?: MiddleGamePlan;
}

/** A user-uploaded image attached to a pgn-grid file. */
export interface UploadedImage {
  readonly id: string;
  /** Cloud Storage download URL used to display the image. */
  readonly url: string;
  /** Storage path (`uploads/{uid}/{id}`), kept so the object can be deleted. */
  readonly path: string;
  /** Original file name, shown as a caption and used as alt text. */
  readonly name: string;
}

/** Content of a `pgn-grid` file: one or more PGNs, each rendered as a board grid. */
export interface PgnGridContent {
  readonly entries: readonly PgnEntry[];
  /**
   * Side every board in this file is viewed from. Absent means `white` (the
   * default), so files saved before this option existed keep their orientation.
   */
  readonly orientation?: BoardOrientation;
  /** Images the user has attached to this file. Absent when none were added. */
  readonly images?: readonly UploadedImage[];
  /** Free-text notes for this file. Absent when the user hasn't written any. */
  readonly notes?: string;
}

interface BaseNode {
  readonly id: NodeId;
  readonly name: string;
  /** Parent folder id, or null when the node lives at the workspace root. */
  readonly parentId: NodeId | null;
  /**
   * UID of the user who owns this node. Every node in a user's workspace carries
   * their uid; Firestore rules only permit reading/writing one's own nodes. An
   * empty string marks a local-only node created before signing in.
   */
  readonly ownerId: string;
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
