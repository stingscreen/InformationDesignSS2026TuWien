import { Component, input } from '@angular/core';
import { StoryStep } from '../story-page-component/story-page-component';

@Component({
  selector: 'app-story-step',
  standalone: true,
  templateUrl: './story-step.component.html',
  styleUrl: './story-step.component.css'
})
export class StoryStepComponent {
  step = input.required<StoryStep>();
  active = input(false);
}
