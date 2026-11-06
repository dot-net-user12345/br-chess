import { BoardOrientation } from './chess-models';

export type NodeId = string;

/** The set of file types the workspace supports. */
export type FileType = 'pgn-grid' | 'board-diagram' | 'multi-step-notes';

/**
 * The separate file structures of the workspace, each with its own folders:
 * PGN grid files, board diagrams, and multi step notes.
 */
export type WorkspaceTree = 'lines' | 'diagrams' | 'notes';

/** Which tree each file type lives in. */
export const FILE_TYPE_TREES: Readonly<Record<FileType, WorkspaceTree>> = {
  'pgn-grid': 'lines',
  'board-diagram': 'diagrams',
  'multi-step-notes': 'notes',
};

/** The file type each tree holds. */
export const TREE_FILE_TYPES: Readonly<Record<WorkspaceTree, FileType>> = {
  lines: 'pgn-grid',
  diagrams: 'board-diagram',
  notes: 'multi-step-notes',
};

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
import { BoardDrawing } from './board-drawing';

/** A user's colored squares and arrows on one board, as saved with the file. */
export type { BoardDrawing };

export interface PgnEntry {
  readonly id: string;
  readonly pgn: string;
  /** User-editable display label. Falls back to a positional default when unset. */
  readonly label?: string;
  /** User-entered captions per board position, keyed by ply (0 = starting position). */
  readonly captions?: Readonly<Record<number, string>>;
  /** Plies the user marked as focus points, in ascending order. Absent until one is marked. */
  readonly focusPlies?: readonly number[];
  /** Each move's own reference images, keyed by ply. Absent until one is added. */
  readonly moveImages?: Readonly<Record<number, readonly UploadedImage[]>>;
  /** Each move's drawing (colored squares and arrows), keyed by ply. Absent until one is saved. */
  readonly drawings?: Readonly<Record<number, BoardDrawing>>;
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
  /** What the image shows, written after it's uploaded; used as its alt text when set. */
  readonly caption?: string;
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

/**
 * Content of a `board-diagram` file: a set-up board (it needn't be a legal
 * position) with the user's drawing over it. The file's name is its title.
 */
export interface BoardDiagramContent {
  /** The board part of a FEN, rank 8 first, e.g. `8/8/8/8/8/5N2/8/8`. */
  readonly fen: string;
  /** Side the board is viewed from; absent means `white`. */
  readonly orientation?: BoardOrientation;
  /** Colored squares and arrows over the board. Absent until one is drawn. */
  readonly drawing?: BoardDrawing;
}

/** One move of one line of a pgn-grid file, as picked into a note. */
export interface MoveRef {
  readonly id: string;
  readonly fileId: NodeId;
  /** The {@link PgnEntry} (line) within that file. */
  readonly entryId: string;
  /** Half-move the board sits at; 1 is White's first move. */
  readonly ply: number;
}

/** One note of a multi step notes file: a diagram, its explanation, and moves. */
export interface StepNote {
  readonly id: string;
  /** The `board-diagram` file shown with this note. Absent until one is picked. */
  readonly diagramId?: NodeId;
  /** Explains the diagram and how it fits with the rest of the notes. */
  readonly text?: string;
  /** Moves picked for this note, in the order added. Absent until one is added. */
  readonly moves?: readonly MoveRef[];
}

/**
 * Content of a `multi-step-notes` file: notes in order, optionally tied to a
 * position. The file's name is its title, which is required.
 */
export interface MultiStepNotesContent {
  /**
   * The board part of a FEN the notes are about; it needn't be a legal
   * position. When set, Position search finds the notes by it.
   */
  readonly fen?: string;
  /** Side the position is viewed from; absent means `white`. */
  readonly orientation?: BoardOrientation;
  readonly notes: readonly StepNote[];
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
  /** The tree the folder belongs to; absent means `lines`, as before trees existed. */
  readonly tree?: WorkspaceTree;
}

export interface PgnGridFileNode extends BaseNode {
  readonly kind: 'file';
  readonly fileType: 'pgn-grid';
  readonly content: PgnGridContent;
}

export interface BoardDiagramFileNode extends BaseNode {
  readonly kind: 'file';
  readonly fileType: 'board-diagram';
  readonly content: BoardDiagramContent;
}

export interface MultiStepNotesFileNode extends BaseNode {
  readonly kind: 'file';
  readonly fileType: 'multi-step-notes';
  readonly content: MultiStepNotesContent;
}

/** Union of every file node type. Grows as new file types are added. */
export type FileNode = PgnGridFileNode | BoardDiagramFileNode | MultiStepNotesFileNode;

export type WorkspaceNode = FolderNode | FileNode;

export const isFolder = (node: WorkspaceNode): node is FolderNode => node.kind === 'folder';
export const isFile = (node: WorkspaceNode): node is FileNode => node.kind === 'file';

/** The tree a node belongs to: a file's by its type, a folder's as recorded. */
export function treeOf(node: WorkspaceNode): WorkspaceTree {
  return isFile(node) ? FILE_TYPE_TREES[node.fileType] : (node.tree ?? 'lines');
}

/** Human-readable label for a file type, used in the UI. */
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  'pgn-grid': 'PGN grid',
  'board-diagram': 'Board diagram',
  'multi-step-notes': 'Multi step notes',
};
