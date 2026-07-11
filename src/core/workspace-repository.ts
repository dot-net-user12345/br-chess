import { inject, Injectable } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
import {
  deleteObject,
  getBytes,
  ref,
  Storage,
  StorageError,
  uploadString,
} from '@angular/fire/storage';
import { environment } from '../environment/environment';
import { NodeId, PgnGridContent, WorkspaceNode } from './workspace-models';

const NODES_COLLECTION = 'nodes';

/** Node without its file content — the shape persisted to Firestore. */
type NodeMetadata = Omit<WorkspaceNode, 'content'>;

/** Default content used when a file's Storage blob is missing. */
const EMPTY_CONTENT: PgnGridContent = { entries: [] };

/** Storage path for a file node's content blob. */
function contentPath(id: NodeId): string {
  return `files/${id}.json`;
}

function isNotFound(err: unknown): boolean {
  return err instanceof StorageError && err.code === 'storage/object-not-found';
}

/**
 * Persists the workspace with a hybrid backend: each node's metadata (name,
 * parent, timestamps, and — for files — its type) lives as a Firestore document
 * in the `nodes` collection, while a file's content is stored as a JSON blob in
 * Cloud Storage at `files/{id}.json`. All methods no-op (or return empty) until
 * Firebase is configured with real credentials, so the app stays usable locally.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceRepository {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);

  get isConfigured(): boolean {
    return environment.firebase.apiKey !== 'YOUR_API_KEY';
  }

  async loadAll(): Promise<WorkspaceNode[]> {
    if (!this.isConfigured) {
      return [];
    }
    const snapshot = await getDocs(collection(this.firestore, NODES_COLLECTION));
    return Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data() as Omit<NodeMetadata, 'id'> & { content?: PgnGridContent };
        const { content: legacyContent, ...rest } = data;
        const meta = { ...rest, id: docSnap.id };
        if (meta.kind === 'file') {
          // Fall back to content embedded by the pre-Storage scheme, if any.
          return { ...meta, content: await this.loadContent(docSnap.id, legacyContent) } as WorkspaceNode;
        }
        return meta as WorkspaceNode;
      }),
    );
  }

  async saveNode(node: WorkspaceNode): Promise<void> {
    if (!this.isConfigured) {
      return;
    }
    const { id, ...data } = this.metadataOf(node);
    await setDoc(doc(this.firestore, NODES_COLLECTION, id), data);
    if (node.kind === 'file') {
      await this.saveContent(node.id, node.content);
    }
  }

  async deleteNode(id: NodeId): Promise<void> {
    if (!this.isConfigured) {
      return;
    }
    await deleteDoc(doc(this.firestore, NODES_COLLECTION, id));
    // Folders have no blob; a missing object is fine to ignore.
    try {
      await deleteObject(ref(this.storage, contentPath(id)));
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
    }
  }

  private metadataOf(node: WorkspaceNode): NodeMetadata {
    if (node.kind === 'file') {
      const { content, ...meta } = node;
      return meta;
    }
    return node;
  }

  private async saveContent(id: NodeId, content: PgnGridContent): Promise<void> {
    await uploadString(ref(this.storage, contentPath(id)), JSON.stringify(content), 'raw', {
      contentType: 'application/json',
    });
  }

  private async loadContent(id: NodeId, fallback?: PgnGridContent): Promise<PgnGridContent> {
    try {
      const bytes = await getBytes(ref(this.storage, contentPath(id)));
      return JSON.parse(new TextDecoder().decode(bytes)) as PgnGridContent;
    } catch (err) {
      if (isNotFound(err)) {
        return fallback ?? EMPTY_CONTENT;
      }
      throw err;
    }
  }
}
