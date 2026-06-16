import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry, LineString } from 'geojson';
import { SelectionStateService } from '../../../core/services/SelectionState.service';

interface DistrictProps {
  NAMEK: string;
  BEZNR: number;
  BEZ: string;
}
type DistrictFeature = Feature<Geometry, DistrictProps>;

type Mode = 'underground' | 'tram' | 'bus_day' | 'bus_night';
type Layer = 'districts' | Mode;

interface Stop {
  name: string;
  lon: number;
  lat: number;
}
interface LineProps {
  lineId: string;
  name: string;
  longName: string;
  mode: string;
  color: string | null;
  lengthKm?: number;
  stops: Stop[];
}
type LineFeature = Feature<LineString, LineProps>;

interface DistrictLines {
  underground: string[];
  tram: string[];
  bus_day: string[];
  bus_night: string[];
}
interface DistrictFacts {
  name: string;
  areaKm2: number | null;
  population: number | null;
  populationYear: number | null;
  lines: DistrictLines;
}
interface DistrictCard extends Partial<DistrictFacts> {
  nr: number;
  name: string;
}

export const DISTRICT_LINE_GROUPS: { key: keyof DistrictLines; label: string }[] = [
  { key: 'underground', label: 'Underground' },
  { key: 'tram', label: 'Tram' },
  { key: 'bus_day', label: 'Bus (day)' },
  { key: 'bus_night', label: 'Bus (night)' }
];

const MODE_FALLBACK_COLOR: Record<Mode, string> = {
  underground: '#666666',
  tram: '#e2001a',
  bus_day: '#0a6cb3',
  bus_night: '#3b3b8f'
};

// Which GeoJSON file backs each mode (day and night buses share bus.geojson).
const MODE_SOURCE: Record<Mode, string> = {
  underground: 'underground',
  tram: 'tram',
  bus_day: 'bus',
  bus_night: 'bus'
};

const isNightLine = (id: string) => /^N/.test(id);

export const LAYER_TABS: { id: Layer; label: string }[] = [
  { id: 'districts', label: 'Districts' },
  { id: 'underground', label: 'Underground' },
  { id: 'tram', label: 'Tram' },
  { id: 'bus_day', label: 'Bus (day)' },
  { id: 'bus_night', label: 'Bus (night)' }
];

@Component({
  selector: 'app-map-page-component',
  imports: [DecimalPipe],
  templateUrl: './map-page-component.html',
  styleUrl: './map-page-component.css',
  standalone: true,
})
export class MapPageComponent implements AfterViewInit {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private selection = inject(SelectionStateService);

  readonly tabs = LAYER_TABS;
  readonly lineGroups = DISTRICT_LINE_GROUPS;
  readonly activeLayer = signal<Layer>('districts');
  readonly legendOpen = signal(false);
  readonly districts = signal<{ nr: number; name: string }[]>([]);
  readonly lines = signal<{ id: string; name: string; color: string }[]>([]);
  readonly selectedDistrict = signal<DistrictCard | null>(null);
  readonly selectedLine = signal<LineProps | null>(null);

  private districtFacts: Record<number, DistrictFacts> = {};

  private readonly dimensions = { width: 800, height: 640 };
  private projection?: d3.GeoProjection;
  private geoPath?: d3.GeoPath;
  private zoomLayer?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private districtFeatures: DistrictFeature[] = [];
  private fileCache = new Map<string, FeatureCollection<LineString, LineProps>>();
  private activeFeatures: LineFeature[] = [];

  toggleLegend(): void {
    this.legendOpen.update(open => !open);
  }

  setLayer(layer: Layer): void {
    if (this.activeLayer() === layer) return;
    this.clearSelection();
    this.activeLayer.set(layer);
    this.renderLayer();
  }

  selectDistrict(nr: number | null, name?: string): void {
    const id = nr === null ? null : String(nr);
    const next = this.selection.state().selectedDistrictId === id ? null : id;

    this.selection.update({ selectedDistrictId: next });
    if (next === null || nr === null) {
      this.selectedDistrict.set(null);
    } else {
      const facts = this.districtFacts[nr];
      this.selectedDistrict.set({ ...facts, nr, name: name ?? facts?.name ?? '' });
    }

    this.zoomLayer
      ?.selectAll<SVGPathElement, DistrictFeature>('path.district')
      .classed('selected', f => String(f.properties.BEZNR) === next);
  }

  selectLine(props: LineProps | null): void {
    const id = props?.lineId ?? null;
    const next = this.selectedLine()?.lineId === id ? null : props;

    this.selectedLine.set(next);
    this.selection.update({ selectedRouteId: next?.lineId ?? null });
    this.highlightLine(next?.lineId ?? null);
  }

  selectLineById(id: string): void {
    const props = this.activeFeatures.find(f => f.properties.lineId === id)?.properties;
    if (props) this.selectLine(props);
  }

  closeSidebar(): void {
    this.clearSelection();
  }

  private clearSelection(): void {
    this.selectedDistrict.set(null);
    this.selectedLine.set(null);
    this.selection.update({ selectedDistrictId: null, selectedRouteId: null });
    this.zoomLayer?.selectAll('path.district').classed('selected', false);
    this.highlightLine(null);
  }

  private highlightLine(id: string | null): void {
    this.zoomLayer
      ?.selectAll<SVGPathElement, LineFeature>('path.transit-line')
      .classed('selected', d => d.properties.lineId === id);
  }

  ngAfterViewInit(): void {
    this.http.get<Record<number, DistrictFacts>>('data/district-facts.json').subscribe({
      next: facts => (this.districtFacts = facts),
      error: err => console.error('Failed to load district facts:', err)
    });
    this.http.get<Topology>('data/bezirke-topo.json').subscribe({
      next: topology => this.setupMap(topology),
      error: err => console.error('Failed to load district map:', err)
    });
  }

  private setupMap(topology: Topology): void {
    const object = topology.objects['bezirke'] as GeometryCollection<DistrictProps>;
    const districts = feature(topology, object) as FeatureCollection<Geometry, DistrictProps>;
    this.districtFeatures = districts.features;

    this.districts.set(
      districts.features
        .map(f => ({ nr: f.properties.BEZNR, name: f.properties.NAMEK }))
        .sort((a, b) => a.nr - b.nr)
    );

    const element = this.mapContainer.nativeElement;
    element.innerHTML = '';
    const { width, height } = this.dimensions;

    const svg = d3.select(element)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', '100%')
      .style('touch-action', 'none');

    const zoomLayer = svg.append('g');
    this.projection = d3.geoMercator().fitSize([width, height], districts);
    this.geoPath = d3.geoPath(this.projection);
    this.zoomLayer = zoomLayer;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [width, height]])
      .on('zoom', event => zoomLayer.attr('transform', event.transform.toString()));
    svg.call(zoom);

    this.renderLayer();
  }

  private renderLayer(): void {
    if (!this.zoomLayer) return;
    this.zoomLayer.selectAll('*').remove();

    if (this.activeLayer() === 'districts') {
      this.lines.set([]);
      this.drawDistricts();
    } else {
      this.loadAndDrawTransit(this.activeLayer() as Mode);
    }
  }

  private drawDistricts(): void {
    this.zoomLayer!
      .append('g')
      .selectAll<SVGPathElement, DistrictFeature>('path')
      .data(this.districtFeatures)
      .join('path')
      .attr('class', 'district')
      .attr('d', d => this.geoPath!(d))
      .attr('aria-label', d => d.properties.NAMEK)
      .on('click', (_e, d) => this.selectDistrict(d.properties.BEZNR, d.properties.NAMEK))
      .append('title')
      .text(d => `${d.properties.BEZ}. ${d.properties.NAMEK}`);
  }

  private loadAndDrawTransit(mode: Mode): void {
    const file = MODE_SOURCE[mode];
    const cached = this.fileCache.get(file);
    if (cached) {
      this.drawTransit(mode, this.filterForMode(mode, cached));
      return;
    }
    this.http.get<FeatureCollection<LineString, LineProps>>(`data/${file}.geojson`).subscribe({
      next: fc => {
        this.fileCache.set(file, fc);
        if (this.activeLayer() === mode) this.drawTransit(mode, this.filterForMode(mode, fc));
      },
      error: err => console.error(`Failed to load ${file} lines:`, err)
    });
  }

  private filterForMode(mode: Mode, fc: FeatureCollection<LineString, LineProps>): LineFeature[] {
    if (mode === 'bus_day') return fc.features.filter(f => !isNightLine(f.properties.lineId));
    if (mode === 'bus_night') return fc.features.filter(f => isNightLine(f.properties.lineId));
    return fc.features;
  }

  private drawTransit(mode: Mode, features: LineFeature[]): void {
    this.activeFeatures = features;
    const colorOf = (p: LineProps) => p.color ?? MODE_FALLBACK_COLOR[mode];

    // Faint district outlines as geographic context.
    this.zoomLayer!
      .append('g')
      .selectAll<SVGPathElement, DistrictFeature>('path')
      .data(this.districtFeatures)
      .join('path')
      .attr('class', 'district-backdrop')
      .attr('d', d => this.geoPath!(d));

    this.zoomLayer!
      .append('g')
      .selectAll<SVGPathElement, LineFeature>('path')
      .data(features)
      .join('path')
      .attr('class', 'transit-line')
      .attr('d', d => this.geoPath!(d))
      .attr('stroke', d => colorOf(d.properties))
      .on('click', (_e, d) => this.selectLine(d.properties))
      .append('title')
      .text(d => d.properties.name);

    const stops = features.flatMap(f =>
      f.properties.stops.map(s => ({ stop: s, props: f.properties }))
    );
    this.zoomLayer!
      .append('g')
      .selectAll<SVGCircleElement, { stop: Stop; props: LineProps }>('circle')
      .data(stops)
      .join('circle')
      .attr('class', 'transit-stop')
      .attr('cx', d => this.projection!([d.stop.lon, d.stop.lat])![0])
      .attr('cy', d => this.projection!([d.stop.lon, d.stop.lat])![1])
      .attr('r', 2.2)
      .attr('stroke', d => colorOf(d.props))
      .on('click', (_e, d) => this.selectLine(d.props));

    this.lines.set(
      features.map(f => ({
        id: f.properties.lineId,
        name: f.properties.lineId,
        color: colorOf(f.properties)
      }))
    );
  }
}
