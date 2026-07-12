import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Google's officially-branded "Sign in with Google" button. Emits {@link login}
 * on click; the caller drives the actual Firebase sign-in.
 */
@Component({
  selector: 'app-google-login-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './google-login-button.html',
  styleUrl: './google-login-button.scss',
})
export class GoogleLoginButton {
  /** Disables the button while a sign-in is already in flight. */
  readonly disabled = input(false);
  /** Button text; must be one of Google's approved phrasings. */
  readonly label = input('Sign in with Google');
  /** Emitted when the user clicks the button. */
  readonly login = output<void>();
}
