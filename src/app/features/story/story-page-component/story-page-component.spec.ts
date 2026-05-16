import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoryPageComponent } from './story-page-component';

describe('StoryPageComponent', () => {
  let component: StoryPageComponent;
  let fixture: ComponentFixture<StoryPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StoryPageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StoryPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
