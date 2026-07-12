import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  authState,
  ConfirmationResult,
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  User,
} from '@angular/fire/auth';

/** Popup-based social providers the app offers. */
export type SocialProvider = 'google' | 'facebook';

/** Wraps Firebase Authentication: current user plus the app's sign-in flows. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);

  /** The signed-in user, or null when signed out. */
  readonly user = toSignal(authState(this.auth), { initialValue: null });
  readonly isSignedIn = computed(() => this.user() !== null);

  async signInWithProvider(provider: SocialProvider): Promise<User> {
    const authProvider =
      provider === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    const credential = await signInWithPopup(this.auth, authProvider);
    return credential.user;
  }

  async signInWithEmail(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    return credential.user;
  }

  async registerWithEmail(email: string, password: string): Promise<User> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    return credential.user;
  }

  /** Invisible reCAPTCHA verifier anchored to `container`, required for phone sign-in. */
  createRecaptcha(container: HTMLElement): RecaptchaVerifier {
    return new RecaptchaVerifier(this.auth, container, { size: 'invisible' });
  }

  /** Sends an SMS code; the returned result confirms the code the user enters. */
  sendSmsCode(phoneNumber: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
    return signInWithPhoneNumber(this.auth, phoneNumber, verifier);
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
