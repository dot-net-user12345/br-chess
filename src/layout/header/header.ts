import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth-service';
import { ThemeService } from '../../core/theme-service';
import { LoginDialog } from '../../features/login-dialog/login-dialog';

@Component({
  selector: 'app-header',
  imports: [NgOptimizedImage, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly menuToggle = output<void>();
  protected readonly themeService = inject(ThemeService);
  protected readonly auth = inject(AuthService);

  /** Best available identity for the signed-in user, shown in the header. */
  protected readonly userLabel = computed(() => {
    const user = this.auth.user();
    return user?.displayName || user?.email || user?.phoneNumber || 'Account';
  });

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }

  protected signIn(): void {
    this.dialog.open(LoginDialog, { autoFocus: 'dialog' });
  }

  protected signOut(): void {
    void this.auth.signOut();
  }
}
