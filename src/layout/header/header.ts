import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../core/theme-service';

@Component({
  selector: 'app-header',
  imports: [NgOptimizedImage, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  readonly menuToggle = output<void>();
  protected readonly themeService = inject(ThemeService);
}
