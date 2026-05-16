import { Routes } from '@angular/router';
import { StoryPageComponent } from './features/story/story-page-component/story-page-component';
import { MapPageComponent } from './features/map/map-page-component/map-page-component';
import { AboutPageComponent } from './features/about/about-page-component/about-page-component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'story' },
  { path: 'story', component: StoryPageComponent },
  { path: 'map', component: MapPageComponent },
  { path: 'about', component: AboutPageComponent },
  { path: '**', redirectTo: 'story' }
];
