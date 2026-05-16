import { AfterViewInit, Component, ElementRef, QueryList, signal, ViewChildren } from '@angular/core';
import { StoryStepComponent } from '../story-step/story-step.component';
import { MainQuestion } from '../../../visualisations/main-question/main-question.component';
import { PassengersChart } from '../../../visualisations/passengers-chart/passengers-chart';
import { NetworkChart } from '../../../visualisations/network-chart/network-chart';
import { ComparisonChart } from '../../../visualisations/comparison-chart/comparison-chart';
import { MapTeaser } from '../../../visualisations/map-teaser/map-teaser';
import scrollama from 'scrollama';

export interface StoryStep {
  id: string;
  smallTitle: string;
  title: string;
  text: string;
  takeaway: string;
}

@Component({
  selector: 'app-story-page-component',
  imports: [StoryStepComponent, MainQuestion, PassengersChart, NetworkChart, ComparisonChart, MapTeaser],
  templateUrl: './story-page-component.html',
  styleUrl: './story-page-component.css',
  standalone: true,
})
export class StoryPageComponent implements AfterViewInit {
  activeStep = signal(0);

  @ViewChildren('stepRef', { read: ElementRef }) stepRefs!: QueryList<ElementRef<HTMLElement>>;

  private scroller = scrollama();

  ngAfterViewInit(): void {
    this.scroller
      .setup({
        step: '.story-step-block',
        offset: 0.5,
        debug: false
      })
      .onStepEnter((response: { index: number }) => {
        this.activeStep.set(response.index);
      });

    window.addEventListener('resize', () => this.scroller.resize());
  }


  steps: StoryStep[] = [
    {
      id: 'intro',
      smallTitle: 'The question',
      title: 'Is Vienna’s public transport really improving?',
      text: 'We want to find out whether growth in use, network size, and long-term demand actually translates into better access across the city.',
      takeaway: 'Improvement should be visible over time and across districts.'
    },
    {
      id: 'passengers',
      smallTitle: 'Passenger trends',
      title: 'Demand has changed strongly over the years',
      text: 'Passenger numbers help show long-term demand and make disruptions or policy changes visible, such as the 365-euro ticket and Covid.',
      takeaway: 'More riders do not automatically mean equal access everywhere.'
    },
    {
      id: 'network',
      smallTitle: 'Network length',
      title: 'Infrastructure growth is only one part of the story',
      text: 'The network length view shows how bus, tram, and underground infrastructure evolved over time.',
      takeaway: 'A larger network can still benefit some areas more than others.'
    },
    {
      id: 'compare',
      smallTitle: 'Comparison',
      title: 'Normalized trends reveal what grew fastest',
      text: 'Using 2005 as a baseline makes annual passes, passengers, network length, and population directly comparable.',
      takeaway: 'Demand, infrastructure, and population do not grow at the same rate.'
    },
    {
      id: 'map',
      smallTitle: 'Districts',
      title: 'The city is not served equally',
      text: 'The map lets users inspect districts, routes, stops, and population context to see where connectivity is stronger or weaker.',
      takeaway: 'Spatial exploration is needed to answer who benefits most.'
    }
  ];

  setActiveStep(index: number) {
    this.activeStep.set(index);
  }
}
