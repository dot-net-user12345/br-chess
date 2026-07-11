import { inject, Injectable } from '@angular/core';
import { addDoc, collection, Firestore } from '@angular/fire/firestore';
import { environment } from '../environment/environment';
import { SavedPage } from './page-models';

@Injectable({ providedIn: 'root' })
export class PageStoreService {
  private readonly firestore = inject(Firestore);

  /** True once the Firebase project has real credentials (not the placeholder config). */
  get isConfigured(): boolean {
    return environment.firebase.apiKey !== 'YOUR_API_KEY';
  }

  /**
   * Persists a page to the `pages` collection and returns the new document id.
   * Throws if Firebase has not been configured or the write fails.
   */
  async savePage(page: SavedPage): Promise<string> {
    if (!this.isConfigured) {
      throw new Error(
        'Firebase is not configured. Add your project credentials in src/environment/environment.ts to enable saving.',
      );
    }
    const ref = await addDoc(collection(this.firestore, 'pages'), page);
    return ref.id;
  }
}
