import { Injectable, signal } from '@angular/core';

export interface AppSelectionState {
  year: number;
  selectedDistrictId: string | null;
  selectedRouteId: string | null;
  activeModes: ('bus_night' | 'bus_day' | 'tram' | 'underground')[];
  showStops: boolean;
  showRoutes: boolean;
  normalized: boolean;
}

@Injectable({ providedIn: 'root' })
export class SelectionStateService {
  readonly state = signal<AppSelectionState>({
    year: 2024,
    selectedDistrictId: null,
    selectedRouteId: null,
    activeModes: ['bus_night', 'bus_day', 'tram', 'underground'],
    showStops: true,
    showRoutes: true,
    normalized: true
  });

  update(patch: Partial<AppSelectionState>) {
    this.state.update(current => ({ ...current, ...patch }));
  }
}
