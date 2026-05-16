import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    RouterLink,
  ],
  templateUrl: './app.html',
  standalone: true,
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('Public Transport in Vienna (2001-2023)');
  router = inject(Router);

  shareWebsite() {
    const shareData = {
      title: this.title(),
      text: 'Look at this cool website',
      url: this.router.url,
    };

    navigator.share(shareData);
  }
}
