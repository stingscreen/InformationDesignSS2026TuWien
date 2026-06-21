import {
  createSvgElement,
  addAxes,
  addGrid,
  createLegend,
  addLegendItem,
  drawAnnotations,
  moveTooltip,
  hideTooltip,
  drawLine,
  createScales,
} from '../../core/services/chart-utils';
import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { HttpClient } from '@angular/common/http';

type TransportKey = 'BUS' | 'TRAM' | 'UNDERGROUND';
type ViewMode = 'separate' | 'total';

interface CsvRow {
  YEAR: number;
  BUS: number;
  TRAM: number;
  UNDERGROUND: number;
  TOTAL: number;
}

const COLORS = {
  BUS: '#1f77b4',
  TRAM: '#ff7f0e',
  UNDERGROUND: '#2ca02c',
  TOTAL: '#6a3dc7',
};

@Component({
  selector: 'app-network-chart',
  imports: [],
  templateUrl: './network-chart.html',
  styleUrl: './network-chart.css',
  standalone: true,
})
export class NetworkChart implements AfterViewInit {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('tooltip') tooltipEl!: ElementRef<HTMLDivElement>;

  viewMode: ViewMode = 'separate';

  private rawData: CsvRow[] = [];
  private http = inject(HttpClient);

  private readonly dimensions = {
    width: 500,
    height: 250,
    margin: { top: 20, right: 150, bottom: 40, left: 60 },
  };

  ngAfterViewInit(): void {
    this.loadAndRender();
  }

  setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.createChart();
  }

  private loadAndRender(): void {
    this.http.get('data/linienlaenge2023.csv', { responseType: 'text' }).subscribe({
      next: (csvText: string) => {
        const sanitizedCsv = csvText.replace(/,/g, '.');
        const parser = d3.dsvFormat(';');
        this.rawData = parser.parse(sanitizedCsv, this.parseCsvRow.bind(this));
        this.createChart();
      },
      error: (err: any) => {
        console.error('Failed to load CSV:', err);
      },
    });
  }

  private parseCsvRow(d: any): CsvRow {
    return {
      YEAR: +d['YEAR']!,
      BUS: +d['BUS']!,
      TRAM: +d['TRAM']!,
      UNDERGROUND: +d['UNDERGROUND']!,
      TOTAL: +d['BUS']! + +d['TRAM']! + +d['UNDERGROUND']!,
    };
  }

  private createChart(): void {
    if (!this.rawData?.length) return;

    const element = this.chartContainer.nativeElement;
    element.innerHTML = '';

    const svg = createSvgElement(element, this.dimensions);
    const chart = svg
      .append('g')
      .attr('transform', `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);

    const { x, y } = createScales(this.rawData, this.viewMode, this.dimensions);
    addAxes(chart, x, y, this.dimensions.height);
    addGrid(chart, y, this.dimensions.width);
    this.drawContent(svg, chart, x, y);
  }

  private drawContent(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
  ): void {
    const { width, margin } = this.dimensions;
    const legend = createLegend(svg, width, margin);

    drawAnnotations(chart, x, this.dimensions, [
      { year: 2008,
      label: 'U2 extension to Stadion', }
    ]);

    if (this.viewMode === 'total') {
      this.drawTotalView(chart, x, y, legend);
    } else {
      this.drawSeparateView(chart, x, y, legend);
    }
  }

  private drawTotalView(
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    legend: d3.Selection<SVGGElement, unknown, null, undefined>,
  ): void {
    const totalData = this.rawData.map((d) => ({ YEAR: d.YEAR, TOTAL: d.TOTAL }));

    this.drawLine(chart, totalData, x, y, COLORS.TOTAL, 'TOTAL');
    this.drawArea(chart, totalData, x, y, COLORS.TOTAL);
    addLegendItem(legend, COLORS.TOTAL, 'TOTAL');
  }

  private drawSeparateView(
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    legend: d3.Selection<SVGGElement, unknown, null, undefined>,
  ): void {
    const transportKeys: TransportKey[] = ['BUS', 'TRAM', 'UNDERGROUND'];

    transportKeys.forEach((key, index) => {
      this.drawLine(chart, this.rawData, x, y, COLORS[key], key);
      this.drawArea(chart, this.rawData, x, y, COLORS[key], key);
      addLegendItem(legend, COLORS[key], key, index);
    });
  }

  private drawLine(
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: any[],
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    color: string,
    key: string,
  ): void {

    drawLine(chart, data, x, y, color, key);

    const lineGenerator = d3
      .line<any>()
      .x((d) => x(d.YEAR))
      .y((d) => y(d[key]))
      .curve(d3.curveMonotoneX);

    chart
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 20)
      .attr('d', lineGenerator)
      .on('mouseover', (event: MouseEvent) => {
        this.showTooltip(event, key);
      })
      .on('mousemove', (event: MouseEvent) => {
        moveTooltip(event, this.tooltipEl, this.chartContainer);
      })
      .on('mouseout', () => {
        hideTooltip(this.tooltipEl);
      });
  }

  private drawArea(
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: any[],
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    color: string,
    key?: string,
  ): void {
    const areaGenerator = d3
      .area<any>()
      .x((d) => x(d.YEAR))
      .y0(() => y(0))
      .y1((d) => y(d[key || 'TOTAL']))
      .curve(d3.curveMonotoneX);

    chart
      .append('path')
      .datum(data)
      .attr('fill', color)
      .attr('fill-opacity', key ? 0.15 : 0.2)
      .attr('d', areaGenerator);
  }

  private showTooltip(event: MouseEvent, label: string): void {
    const elem = this.tooltipEl.nativeElement;
    elem.style.display = 'block';
    elem.innerHTML = `<strong>${label}</strong>`;
    moveTooltip(event, this.tooltipEl, this.chartContainer);
  }
}
