import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
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

    const svg = this.createSvgElement(element);
    const chart = svg
      .append('g')
      .attr('transform', `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);

    const { x, y } = this.createScales();
    this.addAxes(chart, x, y);
    this.addGrid(chart, y, this.dimensions.width);
    this.drawContent(svg, chart, x, y);
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
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
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

  private drawContent(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
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

  private createLegend(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    width: number,
    margin: any,
  ): d3.Selection<SVGGElement, unknown, null, undefined> {
    return svg
      .append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width + margin.left + 20}, ${margin.top + 20})`);
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
    this.addLegendItem(legend, COLORS.TOTAL, 'TOTAL');
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
      this.addLegendItem(legend, COLORS[key], key, index);
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
        this.moveTooltip(event);
      })
      .on('mouseout', () => {
        this.hideTooltip();
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

  private addLegendItem(
    legend: d3.Selection<SVGGElement, unknown, null, undefined>,
    color: string,
    label: string,
    index: number = 0,
  ): void {
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

  private drawAnnotations(
    chart: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleLinear<number, number>,
  ): void {
    const { width, height } = this.dimensions;
    const markerGroup = chart.append('g').attr('class', 'markers');

    const annotation = { year: 2008, label: 'U2 extension to Stadion' };
    const xPos = x(annotation.year);

    if (xPos >= 0 && xPos <= width) {
      this.addAnnotationLine(markerGroup, xPos, height);
      this.addAnnotationLabel(markerGroup, xPos, annotation.label);
    }
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

  private showTooltip(event: MouseEvent, label: string): void {
    const elem = this.tooltipEl.nativeElement;
    elem.style.display = 'block';
    elem.innerHTML = `<strong>${label}</strong>`;
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
