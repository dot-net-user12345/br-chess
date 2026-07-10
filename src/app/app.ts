import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Header } from '../layout/header/header';
import { SideNav } from '../layout/side-nav/side-nav';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatSidenavModule, Header, SideNav],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly sideNavOpen = signal(false);

  protected toggleSideNav(): void {
    this.sideNavOpen.update((open) => !open);
  }

  protected closeSideNav(): void {
    this.sideNavOpen.set(false);
  }
}
