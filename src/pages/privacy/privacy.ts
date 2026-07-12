import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Static Privacy Policy page, served at /privacy for the app and app-store listings. */
@Component({
  selector: 'app-privacy-policy',
  imports: [RouterLink],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicy {
  protected readonly effectiveDate = 'July 11, 2026';
  protected readonly contactEmail = 'bjrathbone1@gmail.com';
}
