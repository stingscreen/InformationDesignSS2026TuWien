import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';

@Component({
  selector: 'app-main-question',
  imports: [MatIcon, RouterLink, MatButton],
  templateUrl: './main-question.component.html',
  styleUrl: './main-question.component.css',
  standalone: true,
})
export class MainQuestion {
  backgroundImage = input<string>('images/wienBezirke.svg');

  startStory() {
    const target = document.getElementById('story-start');

    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    } else {
      window.scrollBy({
        top: window.innerHeight * 0.75,
        behavior: 'smooth'
      });
    }
  }
}
