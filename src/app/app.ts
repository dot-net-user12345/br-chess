import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Header } from '../layout/header/header';
import { SideNav } from '../layout/side-nav/side-nav';
import { ThemeService } from '../core/theme-service';

@Component({
  selector: 'app-root',
  imports: [NgOptimizedImage, RouterOutlet, RouterLink, MatSidenavModule, Header, SideNav],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly sideNavOpen = signal(false);

  protected toggleSideNav(): void {
    this.sideNavOpen.update((open) => !open);
  }

  protected closeSideNav(): void {
    this.sideNavOpen.set(false);
  }
}
