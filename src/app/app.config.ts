import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { FirebaseApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { provideAuth, getAuth } from '@angular/fire/auth';

import { routes } from './app.routes';
import { environment } from '../environment/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore(inject(FirebaseApp), 'chessified')),
    provideStorage(() => getStorage()),
    // Analytics loads lazily and only in production builds. In dev the module is
    // served as its own `@angular_fire_analytics.js` file, which tracker blockers
    // refuse by name — and as a static import that failure stops the whole app
    // from booting. Lazy-loaded, a blocked or failed load only loses analytics.
    provideAppInitializer(() => {
      if (isDevMode()) {
        return;
      }
      const app = inject(FirebaseApp);
      import('firebase/analytics')
        .then(({ getAnalytics, isSupported }) =>
          isSupported().then((supported) => supported && getAnalytics(app)),
        )
        .catch(() => undefined);
    }),
    provideAuth(() => getAuth()),
    // Material Symbols (loaded in index.html) use the `material-symbols-outlined`
    // CSS class, not mat-icon's default `material-icons`.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
  ],
};
