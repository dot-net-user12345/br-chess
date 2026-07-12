import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ConfirmationResult, RecaptchaVerifier, User } from '@angular/fire/auth';
import { AuthService, SocialProvider } from '../../core/auth-service';

/** Which set of controls the dialog is showing. */
type LoginView = 'main' | 'phone';

/**
 * Prompts the user to sign in — by email/password, phone, Google, or Facebook.
 * Closes with the signed-in `User` on success, or `null` when dismissed, so a
 * caller can gate an action on `afterClosed()`.
 */
@Component({
  selector: 'app-login-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
})
export class LoginDialog {
  private readonly auth = inject(AuthService);
  private readonly ref = inject(MatDialogRef<LoginDialog, User | null>);

  private readonly recaptcha = viewChild<ElementRef<HTMLElement>>('recaptcha');
  private verifier: RecaptchaVerifier | null = null;

  protected readonly view = signal<LoginView>('main');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Set once an SMS code has been sent; drives the code-entry step. */
  protected readonly confirmation = signal<ConfirmationResult | null>(null);

  protected readonly emailForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });

  protected readonly phoneControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\+[1-9]\d{6,14}$/)],
  });

  protected readonly codeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.resetVerifier());
  }

  protected async signInSocial(provider: SocialProvider): Promise<void> {
    await this.run(() => this.auth.signInWithProvider(provider));
  }

  protected async signInEmail(): Promise<void> {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    const { email, password } = this.emailForm.getRawValue();
    await this.run(() => this.auth.signInWithEmail(email, password));
  }

  protected async registerEmail(): Promise<void> {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    const { email, password } = this.emailForm.getRawValue();
    await this.run(() => this.auth.registerWithEmail(email, password));
  }

  protected showPhone(): void {
    this.error.set(null);
    this.view.set('phone');
  }

  protected back(): void {
    this.error.set(null);
    this.confirmation.set(null);
    this.codeControl.reset();
    this.resetVerifier();
    this.view.set('main');
  }

  protected async sendCode(): Promise<void> {
    if (this.busy() || this.phoneControl.invalid) {
      this.phoneControl.markAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.auth.sendSmsCode(this.phoneControl.value, this.ensureVerifier());
      this.confirmation.set(result);
    } catch (err) {
      this.error.set(this.describe(err));
      // A used/failed verifier can't be reused; a retry needs a fresh one.
      this.resetVerifier();
    } finally {
      this.busy.set(false);
    }
  }

  protected async verifyCode(): Promise<void> {
    const confirmation = this.confirmation();
    if (this.busy() || !confirmation || this.codeControl.invalid) {
      this.codeControl.markAsTouched();
      return;
    }
    await this.run(async () => (await confirmation.confirm(this.codeControl.value)).user);
  }

  /** Runs a sign-in action with shared busy/error handling; closes on success. */
  private async run(action: () => Promise<User>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      this.ref.close(await action());
    } catch (err) {
      this.error.set(this.describe(err));
      this.busy.set(false);
    }
  }

  private ensureVerifier(): RecaptchaVerifier {
    if (!this.verifier) {
      const container = this.recaptcha()?.nativeElement;
      if (!container) {
        throw new Error('The reCAPTCHA container is not ready.');
      }
      this.verifier = this.auth.createRecaptcha(container);
    }
    return this.verifier;
  }

  private resetVerifier(): void {
    this.verifier?.clear();
    this.verifier = null;
  }

  private describe(err: unknown): string {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    switch (code) {
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/email-already-in-use':
        return 'An account already exists for this email. Try signing in instead.';
      case 'auth/weak-password':
        return 'Choose a password of at least 6 characters.';
      case 'auth/invalid-phone-number':
        return 'Enter a valid phone number, including the country code.';
      case 'auth/invalid-verification-code':
        return 'That code is incorrect. Check it and try again.';
      case 'auth/code-expired':
        return 'That code has expired. Request a new one.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a while and try again.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Your browser blocked the sign-in popup. Allow popups and try again.';
      case 'auth/account-exists-with-different-credential':
        return 'An account already exists with this email using a different provider.';
      case 'auth/operation-not-allowed':
        return 'That sign-in method is not enabled yet in Firebase.';
      default:
        return 'Sign-in failed. Please try again.';
    }
  }
}
