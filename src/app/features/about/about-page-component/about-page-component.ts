import { Component } from '@angular/core';

@Component({
  selector: 'app-about-page-component',
  imports: [],
  templateUrl: './about-page-component.html',
  styleUrl: './about-page-component.css',
  standalone: true,
})
export class AboutPageComponent {
  title = 'Vienna Public Transport Evolution';
  description = 'Group 01: Müller Leo, Kornacki Cedric, Saad Fabian';
}
