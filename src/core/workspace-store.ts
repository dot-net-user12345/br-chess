import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth-service';
import { BoardImageService } from './board-image-service';
import { ChessService } from './chess-service';
import { comparisonIndex, divergentPlies } from './move-comparison';
import { WorkspaceRepository } from './workspace-repository';
import {
  FileType,
  FolderNode,
  isFile,
  isFolder,
  NodeId,
  PgnEntry,
  PgnGridContent,
  WorkspaceNode,
} from './workspace-models';

export interface StatusMessage {
  readonly type: 'success' | 'error' | 'info';
  readonly text: string;
}

function sortNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return [...nodes].sort((a, b) => {
    // Folders before files, then alphabetical by name.
    if (a.kind !== b.kind) {
      return a.kind === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * In-memory source of truth for the folder/file tree, backed by
 * {@link WorkspaceRepository} for per-node Firestore persistence. Structural
 * changes (create/rename/delete) sync automatically; file content is saved
 * explicitly via {@link saveFile}.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly repo = inject(WorkspaceRepository);
  private readonly chess = inject(ChessService);
  private readonly boardImages = inject(BoardImageService);
  private readonly auth = inject(AuthService);

  private readonly nodes = signal<Record<NodeId, WorkspaceNode>>({});
  private readonly selectedId = signal<NodeId | null>(null);
  private readonly expandedIds = signal<ReadonlySet<NodeId>>(new Set());

  /** The uid whose workspace is currently loaded; guards against re-loading. */
  private loadedUid: string | null | undefined = undefined;

  constructor() {
    // The workspace follows the signed-in user: load their nodes when they sign
    // in (or when a session is restored on startup) and clear them on sign-out,
    // so one user's data never leaks into another's session.
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.loadedUid) {
        return;
      }
      this.loadedUid = uid;
      if (uid) {
        void this.loadForUser(uid);
      } else {
        this.clearWorkspace();
      }
    });
  }

  /** Id of the node currently being dragged in the explorer, if any. */
  readonly draggingId = signal<NodeId | null>(null);

  readonly status = signal<StatusMessage | null>(null);
  readonly configured = this.repo.isConfigured;

  readonly selectedNode = computed<WorkspaceNode | null>(() => {
    const id = this.selectedId();
    return id ? (this.nodes()[id] ?? null) : null;
  });

  readonly rootNodes = computed(() => this.childrenOf(null));

  /** Reactive list of a folder's direct children, sorted for display. */
  childrenOf(parentId: NodeId | null): WorkspaceNode[] {
    return sortNodes(Object.values(this.nodes()).filter((node) => node.parentId === parentId));
  }

  node(id: NodeId): WorkspaceNode | null {
    return this.nodes()[id] ?? null;
  }

  isSelected(id: NodeId): boolean {
    return this.selectedId() === id;
  }

  isExpanded(id: NodeId): boolean {
    return this.expandedIds().has(id);
  }

  /**
   * Loads the signed-in user's persisted nodes. Any local-only nodes created
   * before signing in (ownerId still empty) are claimed by the user and synced,
   * so scratch work isn't lost when they sign in.
   */
  private async loadForUser(uid: string): Promise<void> {
    if (!this.repo.isConfigured) {
      return;
    }
    try {
      const orphans = Object.values(this.nodes()).filter((node) => !node.ownerId);
      const loaded = await this.repo.loadForUser(uid);
      const record: Record<NodeId, WorkspaceNode> = {};
      for (const node of loaded) {
        record[node.id] = node;
      }
      for (const orphan of orphans) {
        const claimed = { ...orphan, ownerId: uid };
        record[claimed.id] = claimed;
        void this.persist(claimed);
      }
      this.nodes.set(record);
    } catch (err) {
      this.status.set({ type: 'error', text: this.describe(err, 'Could not load your workspace.') });
    }
  }

  /** Drops all in-memory workspace state; used when the user signs out. */
  private clearWorkspace(): void {
    this.nodes.set({});
    this.selectedId.set(null);
    this.expandedIds.set(new Set());
  }

  select(id: NodeId): void {
    this.selectedId.set(id);
  }

  toggleExpanded(id: NodeId): void {
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** The folder new nodes should be created in, based on the current selection. */
  targetParentId(): NodeId | null {
    const selected = this.selectedNode();
    if (!selected) {
      return null;
    }
    return isFolder(selected) ? selected.id : selected.parentId;
  }

  createFolder(parentId: NodeId | null): FolderNode {
    const now = this.now();
    const folder: FolderNode = {
      id: this.id(),
      kind: 'folder',
      name: this.uniqueName(parentId, 'New folder'),
      parentId,
      ownerId: this.ownerId(),
      createdAt: now,
      updatedAt: now,
    };
    this.put(folder);
    this.expand(parentId);
    this.select(folder.id);
    void this.persist(folder);
    return folder;
  }

  createFile(parentId: NodeId | null, fileType: FileType = 'pgn-grid'): WorkspaceNode {
    const now = this.now();
    const file: WorkspaceNode = {
      id: this.id(),
      kind: 'file',
      fileType,
      name: this.uniqueName(parentId, 'New Comparison'),
      parentId,
      ownerId: this.ownerId(),
      createdAt: now,
      updatedAt: now,
      content: { entries: [{ id: this.id(), pgn: '' }] },
    };
    this.put(file);
    this.expand(parentId);
    this.select(file.id);
    void this.persist(file);
    return file;
  }

  rename(id: NodeId, name: string): void {
    const node = this.nodes()[id];
    const trimmed = name.trim();
    if (!node || trimmed.length === 0 || trimmed === node.name) {
      return;
    }
    const updated = { ...node, name: trimmed, updatedAt: this.now() };
    this.put(updated);
    void this.persist(updated);
  }

  /** Deletes a node and all of its descendants. */
  deleteNode(id: NodeId): void {
    const ids = this.collectSubtree(id);
    this.nodes.update((record) => {
      const next = { ...record };
      for (const nodeId of ids) {
        delete next[nodeId];
      }
      return next;
    });
    if (ids.includes(this.selectedId() ?? '')) {
      this.selectedId.set(null);
    }
    for (const nodeId of ids) {
      void this.persistDelete(nodeId);
    }
  }

  startDrag(id: NodeId): void {
    this.draggingId.set(id);
  }

  endDrag(): void {
    this.draggingId.set(null);
  }

  /**
   * Whether the node currently being dragged can be dropped under `targetId`
   * (a folder id, or null for the root). False when nothing is being dragged,
   * the target is where it already lives, or the drop would nest a folder inside
   * itself or one of its descendants.
   */
  canDrop(targetId: NodeId | null): boolean {
    const dragId = this.draggingId();
    if (dragId === null) {
      return false;
    }
    const node = this.nodes()[dragId];
    if (!node || targetId === node.parentId) {
      return false;
    }
    if (targetId !== null) {
      const target = this.nodes()[targetId];
      if (!target || !isFolder(target) || this.collectSubtree(dragId).includes(targetId)) {
        return false;
      }
    }
    return true;
  }

  /** Moves a node under a new parent folder, or to the root when `newParentId` is null. */
  moveNode(id: NodeId, newParentId: NodeId | null): void {
    const node = this.nodes()[id];
    if (!node || !this.isValidMove(id, newParentId)) {
      return;
    }
    const updated: WorkspaceNode = {
      ...node,
      name: this.uniqueName(newParentId, node.name),
      parentId: newParentId,
      updatedAt: this.now(),
    };
    this.put(updated);
    this.expand(newParentId);
    void this.persist(updated);
  }

  /** Structural validity of moving `id` under `newParentId`, independent of drag state. */
  private isValidMove(id: NodeId, newParentId: NodeId | null): boolean {
    const node = this.nodes()[id];
    if (!node || newParentId === node.parentId) {
      return false;
    }
    if (newParentId !== null) {
      const target = this.nodes()[newParentId];
      if (!target || !isFolder(target) || this.collectSubtree(id).includes(newParentId)) {
        return false;
      }
    }
    return true;
  }

  /** Replaces a pgn-grid file's content locally. Persist with {@link saveFile}. */
  updatePgnGridContent(id: NodeId, content: PgnGridContent): void {
    const node = this.nodes()[id];
    if (!node || !isFile(node) || node.fileType !== 'pgn-grid') {
      return;
    }
    this.put({ ...node, content, updatedAt: this.now() });
  }

  /** Dismisses the current status message. */
  clearStatus(): void {
    this.status.set(null);
  }

  /** Explicitly persists a file document to Firestore. */
  async saveFile(id: NodeId): Promise<void> {
    const node = this.nodes()[id];
    if (!node) {
      return;
    }
    if (!this.repo.isConfigured) {
      this.status.set({
        type: 'info',
        text: 'Firebase is not configured — changes are kept locally only. Add credentials in src/environment/environment.ts to save.',
      });
      return;
    }
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.status.set({ type: 'error', text: 'Sign in to save your work.' });
      return;
    }
    try {
      this.status.set({ type: 'info', text: `Rendering boards and saving “${node.name}”…` });
      // Stamp ownership so a file created before signing in becomes the user's.
      const rendered = { ...(await this.withRenderedBoards(node)), ownerId: uid };
      await this.repo.saveNode(rendered);
      // Keep the local copy in sync with the persisted image URLs and owner.
      this.put(rendered);
      this.status.set({ type: 'success', text: `Saved “${rendered.name}”.` });
    } catch (err) {
      this.status.set({ type: 'error', text: this.describe(err, 'Saving the file failed.') });
    }
  }

  /**
   * Returns a copy of the node with each pgn-grid entry's board positions
   * rendered to Storage and their URLs attached. Non-file nodes and non-grid
   * files pass through unchanged; invalid/empty entries have any stale image
   * URLs dropped.
   */
  private async withRenderedBoards(node: WorkspaceNode): Promise<WorkspaceNode> {
    if (!isFile(node) || node.fileType !== 'pgn-grid') {
      return node;
    }
    // Parse every entry up front so each can be compared against its neighbor.
    const source = node.content.entries;
    const orientation = node.content.orientation ?? 'white';
    const parsed = source.map((entry) => this.chess.parsePgn(entry.pgn));
    const entries = await Promise.all(
      source.map(async (entry, index): Promise<PgnEntry> => {
        const result = parsed[index];
        if (!result.valid) {
          // Drop any stale board URLs; keep id, pgn, label, and captions.
          return {
            id: entry.id,
            pgn: entry.pgn,
            ...(entry.label !== undefined ? { label: entry.label } : {}),
            ...(entry.captions !== undefined ? { captions: entry.captions } : {}),
          };
        }
        const reference = parsed[comparisonIndex(index, parsed.length)];
        const highlighted = reference?.valid
          ? divergentPlies(result.positions, reference.positions)
          : new Set<number>();
        const boardImageUrls = await this.boardImages.urlsForPositions(
          result.positions,
          highlighted,
          orientation,
        );
        return { ...entry, boardImageUrls };
      }),
    );
    // Preserve the file's orientation alongside the freshly rendered entries.
    return { ...node, content: { ...node.content, entries } };
  }

  private put(node: WorkspaceNode): void {
    this.nodes.update((record) => ({ ...record, [node.id]: node }));
  }

  private expand(parentId: NodeId | null): void {
    if (parentId) {
      this.expandedIds.update((set) => new Set(set).add(parentId));
    }
  }

  private collectSubtree(rootId: NodeId): NodeId[] {
    const record = this.nodes();
    const result: NodeId[] = [];
    const stack: NodeId[] = [rootId];
    while (stack.length > 0) {
      const current = stack.pop() as NodeId;
      if (!record[current]) {
        continue;
      }
      result.push(current);
      for (const node of Object.values(record)) {
        if (node.parentId === current) {
          stack.push(node.id);
        }
      }
    }
    return result;
  }

  private uniqueName(parentId: NodeId | null, base: string): string {
    const siblings = new Set(this.childrenOf(parentId).map((node) => node.name));
    if (!siblings.has(base)) {
      return base;
    }
    let index = 2;
    while (siblings.has(`${base} ${index}`)) {
      index++;
    }
    return `${base} ${index}`;
  }

  /** Current user's uid, or '' when signed out (local-only nodes). */
  private ownerId(): string {
    return this.auth.user()?.uid ?? '';
  }

  private async persist(node: WorkspaceNode): Promise<void> {
    // Persistence requires a signed-in user; while signed out, changes stay
    // local and are synced once the user signs in (their nodes get claimed).
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    // Ensure the document is written under the current user, satisfying the
    // ownership rules even for a node created moments before signing in.
    const owned = node.ownerId === uid ? node : { ...node, ownerId: uid };
    if (owned !== node) {
      this.put(owned);
    }
    try {
      await this.repo.saveNode(owned);
    } catch (err) {
      this.status.set({ type: 'error', text: this.describe(err, 'Could not sync a change.') });
    }
  }

  private async persistDelete(id: NodeId): Promise<void> {
    if (!this.auth.user()) {
      return;
    }
    try {
      await this.repo.deleteNode(id);
    } catch (err) {
      this.status.set({ type: 'error', text: this.describe(err, 'Could not delete a node remotely.') });
    }
  }

  private describe(err: unknown, fallback: string): string {
    return err instanceof Error ? `${fallback} ${err.message}` : fallback;
  }

  private id(): NodeId {
    return crypto.randomUUID();
  }

  private now(): string {
    return new Date().toISOString();
  }
}
