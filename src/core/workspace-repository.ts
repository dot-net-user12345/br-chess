import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  query,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { environment } from '../environment/environment';
import { NodeId, WorkspaceNode } from './workspace-models';

const NODES_COLLECTION = 'nodes';

/**
 * Persists the workspace to Firestore: each node is a document in the `nodes`
 * collection. File nodes embed their content (PGN entries) directly in the
 * document — Firestore stores the nested arrays/objects natively. Cloud Storage
 * is reserved for binary assets (images), not structured data. All methods
 * no-op (or return empty) until Firebase is configured, so the app stays usable
 * locally.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceRepository {
  private readonly firestore = inject(Firestore);

  get isConfigured(): boolean {
    return environment.firebase.apiKey !== 'YOUR_API_KEY';
  }

  /** Loads only the nodes owned by `uid`; the rules forbid reading others'. */
  async loadForUser(uid: string): Promise<WorkspaceNode[]> {
    if (!this.isConfigured) {
      return [];
    }
    const snapshot = await getDocs(
      query(collection(this.firestore, NODES_COLLECTION), where('ownerId', '==', uid)),
    );
    return snapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }) as WorkspaceNode);
  }

  async saveNode(node: WorkspaceNode): Promise<void> {
    if (!this.isConfigured) {
      return;
    }
    const { id, ...data } = node;
    await setDoc(doc(this.firestore, NODES_COLLECTION, id), data);
  }

  async deleteNode(id: NodeId): Promise<void> {
    if (!this.isConfigured) {
      return;
    }
    await deleteDoc(doc(this.firestore, NODES_COLLECTION, id));
  }
}
