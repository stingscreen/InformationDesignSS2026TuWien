import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  ViewChild
} from '@angular/core';
import * as d3 from 'd3';
import { HttpClient } from '@angular/common/http';
import { ScaleLinear } from 'd3';

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
  TOTAL: '#6a3dc7'
};

@Component({
  selector: 'app-passengers-chart',
  imports: [],
  templateUrl: './passengers-chart.html',
  styleUrl: './passengers-chart.css',
  standalone: true,
})
export class PassengersChart implements AfterViewInit {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('tooltip') tooltipEl!: ElementRef<HTMLDivElement>;

  viewMode: ViewMode = 'separate';

  private rawData: CsvRow[] = [];
  private http = inject(HttpClient);

  private readonly dimensions = {
    width: 500,
    height: 250,
    margin: { top: 20, right: 140, bottom: 40, left: 60 },
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
    this.http.get('data/fahrgaeste2023.csv', { responseType: 'text' }).subscribe({
      next: (csvText: string) => {
        const parser = d3.dsvFormat(';');
        this.rawData = parser.parse(csvText, this.parseCsvRow.bind(this));
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

    const svg = this.createSvgElement(element);
    const chart = svg
      .append('g')
      .attr('transform', `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);

    const { x, y } = this.createScales();
    this.addAxes(chart, x, y);
    this.addGrid(chart, y, this.dimensions.width);
    this.drawLegendAndLines(svg, chart, x, y);
  }

  private createSvgElement(
    element: HTMLElement,
  ): d3.Selection<SVGSVGElement, unknown, null, undefined> {
    const { width, height, margin } = this.dimensions;
    const totalWidth = width + margin.left + margin.right;
    const totalHeight = height + margin.top + margin.bottom;

    return d3
      .select(element)
      .append('svg')
      .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
      .style('width', '100%')
      .style('height', 'auto');
  }

  private createScales() {
    const { width, height } = this.dimensions;

    const x = d3
      .scaleLinear()
      .domain(d3.extent(this.rawData, (d) => d.YEAR) as [number, number])
      .range([0, width]);

    const yMax =
      this.viewMode === 'total'
        ? (d3.max(this.rawData, (d) => d.TOTAL) ?? 0)
        : (d3.max(this.rawData, (d) => Math.max(d.BUS, d.TRAM, d.UNDERGROUND)) ?? 0);

    const y = d3
      .scaleLinear()
      .domain([0, yMax * 1.05])
      .nice()
      .range([height, 0]);

    return { x, y };
  }

  private addAxes(
    chart: any,
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
  ): void {
    const { height } = this.dimensions;

    chart
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')));

    chart.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('.2s')));
  }

  private addGrid(chart: any, y: ScaleLinear<number, number>, width: number): void {
    chart
      .append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(y)
          .ticks(6)
          .tickSize(-width)
          .tickFormat(() => ''),
      );
  }

  private drawLegendAndLines(
    svg: any,
    chart: any,
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
  ): void {
    const { width, margin } = this.dimensions;
    const legend = this.createLegend(svg, width, margin);

    this.drawAnnotations(chart, x);

    if (this.viewMode === 'total') {
      this.drawTotalView(chart, x, y, legend);
    } else {
      this.drawSeparateView(chart, x, y, legend);
    }
  }

  private createLegend(svg: any, width: number, margin: any): any {
    return svg
      .append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width + margin.left + 20}, ${margin.top + 20})`);
  }

  private drawTotalView(
    chart: any,
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    legend: any,
  ): void {
    const totalData = this.rawData.map((d) => ({ YEAR: d.YEAR, TOTAL: d.TOTAL }));

    this.drawLine(chart, totalData, x, y, COLORS.TOTAL, 'TOTAL');
    this.drawDotsForTotal(chart, totalData, x, y, COLORS.TOTAL);
    this.addLegendItem(legend, COLORS.TOTAL, 'TOTAL');
  }

  private drawSeparateView(
    chart: any,
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    legend: any,
  ): void {
    const transportKeys: TransportKey[] = ['BUS', 'TRAM', 'UNDERGROUND'];

    transportKeys.forEach((key, index) => {
      this.drawLine(chart, this.rawData, x, y, COLORS[key], key);
      this.drawDotsForKey(chart, this.rawData, x, y, COLORS[key], key);
      this.addLegendItem(legend, COLORS[key], key, index);
    });
  }

  private drawLine(
    chart: any,
    data: any[],
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    color: string,
    key: string,
  ): void {
    const lineGenerator = d3
      .line<any>()
      .x((d) => x(d.YEAR))
      .y((d) => y(d[key]))
      .curve(d3.curveMonotoneX);

    chart
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', key === 'TOTAL' ? 3 : 2.5)
      .attr('d', lineGenerator);
  }

  private drawDotsForTotal(
    chart: any,
    data: any[],
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    color: string,
  ): void {
    const dots = chart
      .selectAll('.dot-total')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: any) => x(d.YEAR))
      .attr('cy', (d: any) => y(d.TOTAL))
      .attr('r', 4)
      .attr('fill', color);

    dots
      .on('mouseover', (event: MouseEvent, d: any) => {
        this.showTooltip(event, d.YEAR, d.TOTAL, 'TOTAL');
      })
      .on('mousemove', (event: MouseEvent) => {
        this.moveTooltip(event);
      })
      .on('mouseout', () => {
        this.hideTooltip();
      });
  }

  private drawDotsForKey(
    chart: any,
    data: CsvRow[],
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    color: string,
    key: TransportKey,
  ): void {
    const dots = chart
      .selectAll(`.dot-${key}`)
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: CsvRow) => x(d.YEAR))
      .attr('cy', (d: CsvRow) => y(d[key]))
      .attr('r', 4)
      .attr('fill', color);

    dots
      .on('mouseover', (event: MouseEvent, d: CsvRow) => {
        this.showTooltip(event, d.YEAR, d[key], key);
      })
      .on('mousemove', (event: MouseEvent) => {
        this.moveTooltip(event);
      })
      .on('mouseout', () => {
        this.hideTooltip();
      });
  }

  private addLegendItem(legend: any, color: string, label: string, index: number = 0): void {
    const row = legend.append('g').attr('transform', `translate(0, ${index * 24})`);

    row
      .append('line')
      .attr('x1', 0)
      .attr('x2', 22)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', color)
      .attr('stroke-width', 3);

    row
      .append('text')
      .attr('x', 30)
      .attr('y', 4)
      .attr('fill', '#444')
      .attr('font-size', 12)
      .text(label);
  }

  private drawAnnotations(chart: any, x: ScaleLinear<number, number>): void {
    const { width, height } = this.dimensions;
    const markerGroup = chart.append('g').attr('class', 'markers');

    const annotations = [
      { year: 2012, label: '365€ Ticket' },
      { year: 2020, label: 'COVID-19' },
    ];

    annotations.forEach(({ year, label }) => {
      const xPos = x(year);
      if (xPos < 0 || xPos > width) return;

      this.addAnnotationLine(markerGroup, xPos, height);
      this.addAnnotationLabel(markerGroup, xPos, label);
    });
  }

  private addAnnotationLine(markerGroup: any, xPos: number, height: number): void {
    markerGroup
      .append('line')
      .attr('x1', xPos)
      .attr('x2', xPos)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#666')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 4');
  }

  private addAnnotationLabel(markerGroup: any, xPos: number, label: string): void {
    markerGroup
      .append('text')
      .attr('x', xPos + 6)
      .attr('y', 14)
      .attr('fill', '#666')
      .attr('font-size', 12)
      .text(label);
  }

  private showTooltip(event: MouseEvent, year: number, value: number, label: string): void {
    const elem = this.tooltipEl.nativeElement;
    elem.style.display = 'block';
    elem.innerHTML = `<strong>${label}</strong><br>${year}: ${value.toLocaleString()}`;
    this.moveTooltip(event);
  }

  private moveTooltip(event: MouseEvent): void {
    const elem = this.tooltipEl.nativeElement;
    const containerRect = this.chartContainer.nativeElement.getBoundingClientRect();
    elem.style.left = event.clientX - containerRect.left + 15 + 'px';
    elem.style.top = event.clientY - containerRect.top - 15 + 'px';
  }

  private hideTooltip(): void {
    this.tooltipEl.nativeElement.style.display = 'none';
  }
}
