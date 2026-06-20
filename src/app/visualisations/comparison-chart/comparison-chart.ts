import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ScaleLinear } from 'd3';

type DataKey = 'PASSENGERS' | 'NETWORK' | 'POPULATION' | 'ANNUAL_TICKETS';
type ViewMode = 'separate' | 'average';

interface CsvRow {
  YEAR: number;
  PASSENGERS: number;
  NETWORK: number;
  POPULATION: number;
  ANNUAL_TICKETS: number;
  PASSENGERS_PERCENT?: number;
  NETWORK_PERCENT?: number;
  POPULATION_PERCENT?: number;
  ANNUAL_TICKETS_PERCENT?: number;
  AVERAGE_PERCENT?: number;
}

const COLORS = {
  PASSENGERS: '#1f77b4',
  NETWORK: '#ff7f0e',
  POPULATION: '#2ca02c',
  ANNUAL_TICKETS: '#d62728',
  AVERAGE: '#6a3dc7',
};

@Component({
  selector: 'app-comparison-chart',
  imports: [],
  templateUrl: './comparison-chart.html',
  styleUrl: './comparison-chart.css',
  standalone: true,
})
export class ComparisonChart implements AfterViewInit {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  viewMode: ViewMode = 'separate';

  private rawData: CsvRow[] = [];
  private http = inject(HttpClient);

  private baselineYear = 2005;

  private readonly dimensions = {
    width: 500,
    height: 250,
    margin: { top: 20, right: 160, bottom: 40, left: 60 },
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
    forkJoin({
      tickets: this.http.get('data/fahrgaeste2023.csv', { responseType: 'text' }),
      network: this.http.get('data/linienlaenge2023.csv', { responseType: 'text' }),
      pop: this.http.get('data/viePopulation1869.csv', { responseType: 'text' }),
      annual: this.http.get('data/jahreskarten2023.csv', { responseType: 'text' }),
    }).subscribe({
      next: (data) => {
        this.processData(data);
        this.createChart();
      },
      error: (err: any) => {
        console.error('Failed to load CSV files:', err);
      },
    });
  }

  private processData(data: any): void {
    const parser = d3.dsvFormat(';');
    const tickets = parser.parse(data.tickets, (d: any) => ({
      YEAR: +d.YEAR,
      PASSENGERS: +d.BUS + +d.TRAM + +d.UNDERGROUND,
    }));

    const network = parser.parse(data.network.replace(/,/g, '.'), (d: any) => ({
      YEAR: +d.YEAR,
      NETWORK: +d.BUS + +d.TRAM + +d.UNDERGROUND,
    }));

    const rawPop = parser.parse(data.pop);
    const population = Array.from(
      d3.rollup(
        rawPop,
        (v) => d3.sum(v, (d: any) => +d.POP_TOTAL),
        (d: any) => +d.REF_YEAR,
      ),
      ([year, val]) => ({ YEAR: year, POPULATION: val }),
    );

    const annualTickets = parser.parse(data.annual, (d: any) => ({
      YEAR: +d.YEAR,
      ANNUAL_TICKETS: +d.ANNUAL_TICKETS,
    }));

    const yearMap = new Map<number, CsvRow>();

    tickets.forEach((d) => {
      if (!yearMap.has(d.YEAR)) {
        yearMap.set(d.YEAR, {
          YEAR: d.YEAR,
          PASSENGERS: 0,
          NETWORK: 0,
          POPULATION: 0,
          ANNUAL_TICKETS: 0,
        });
      }
      yearMap.get(d.YEAR)!.PASSENGERS = d.PASSENGERS;
    });

    network.forEach((d) => {
      if (!yearMap.has(d.YEAR)) {
        yearMap.set(d.YEAR, {
          YEAR: d.YEAR,
          PASSENGERS: 0,
          NETWORK: 0,
          POPULATION: 0,
          ANNUAL_TICKETS: 0,
        });
      }
      yearMap.get(d.YEAR)!.NETWORK = d.NETWORK;
    });

    population.forEach((d) => {
      if (!yearMap.has(d.YEAR)) {
        yearMap.set(d.YEAR, {
          YEAR: d.YEAR,
          PASSENGERS: 0,
          NETWORK: 0,
          POPULATION: 0,
          ANNUAL_TICKETS: 0,
        });
      }
      yearMap.get(d.YEAR)!.POPULATION = d.POPULATION;
    });

    annualTickets.forEach((d) => {
      if (!yearMap.has(d.YEAR)) {
        yearMap.set(d.YEAR, {
          YEAR: d.YEAR,
          PASSENGERS: 0,
          NETWORK: 0,
          POPULATION: 0,
          ANNUAL_TICKETS: 0,
        });
      }
      yearMap.get(d.YEAR)!.ANNUAL_TICKETS = d.ANNUAL_TICKETS;
    });

    this.rawData = Array.from(yearMap.values())
      .filter((d) => d.PASSENGERS > 0 || d.NETWORK > 0 || d.POPULATION > 0 || d.ANNUAL_TICKETS > 0)
      .sort((a, b) => a.YEAR - b.YEAR);
    this.rawData = this.rawData.filter((d) => d.YEAR <= 2023);

    this.interpolateMissingTicketData();
    this.calculatePercentages();
  }

  private interpolateMissingTicketData(): void {
    const realDataPoints = this.rawData
      .filter((d) => d.ANNUAL_TICKETS > 0)
      .sort((a, b) => a.YEAR - b.YEAR);

    const missingDataPoints = this.rawData.filter((d) => d.ANNUAL_TICKETS === 0);

    missingDataPoints.forEach((d) => {

      if (d.ANNUAL_TICKETS > 0) return;

      const prev = realDataPoints.filter((p) => p.YEAR < d.YEAR).pop();
      const next = realDataPoints.filter((p) => p.YEAR > d.YEAR)[0];

      let interpolatedValue = 0;
      let isInterpolated = false;

      if (prev && next) {
        const ratio = (d.YEAR - prev.YEAR) / (next.YEAR - prev.YEAR);
        interpolatedValue =
          prev.ANNUAL_TICKETS + (next.ANNUAL_TICKETS - prev.ANNUAL_TICKETS) * ratio;
        isInterpolated = true;
      } else if (prev) {
        interpolatedValue = prev.ANNUAL_TICKETS;
        isInterpolated = true;
      } else if (next) {
        interpolatedValue = next.ANNUAL_TICKETS;
        isInterpolated = true;
      }

      if (isInterpolated) {
        d.ANNUAL_TICKETS = Math.round(interpolatedValue);
      }
    });
  }

  private calculatePercentages(): void {
    const baselineData = this.rawData.find((d) => d.YEAR === this.baselineYear);
    if (!baselineData) return;

    const baselinePassengers = baselineData.PASSENGERS;
    const baselineNetwork = baselineData.NETWORK;
    const baselinePopulation = baselineData.POPULATION;
    const baselineAnnualTickets = baselineData.ANNUAL_TICKETS;

    this.rawData.forEach((d) => {
      d.PASSENGERS_PERCENT = baselinePassengers > 0 ? (d.PASSENGERS / baselinePassengers) * 100 : 0;
      d.NETWORK_PERCENT = baselineNetwork > 0 ? (d.NETWORK / baselineNetwork) * 100 : 0;
      d.POPULATION_PERCENT = baselinePopulation > 0 ? (d.POPULATION / baselinePopulation) * 100 : 0;
      d.ANNUAL_TICKETS_PERCENT =
        baselineAnnualTickets > 0 ? (d.ANNUAL_TICKETS / baselineAnnualTickets) * 100 : 0;
      d.AVERAGE_PERCENT =
        ((d.PASSENGERS_PERCENT || 0) +
          (d.NETWORK_PERCENT || 0) +
          (d.POPULATION_PERCENT || 0) +
          (d.ANNUAL_TICKETS_PERCENT || 0)) /
        4;
    });
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
    this.drawAnnotations(chart, x);
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
      .domain([2001, 2023])
      .range([0, width]);

    let yMax: number;
    if (this.viewMode === 'average') {
      yMax = d3.max(this.rawData, (d) => d.AVERAGE_PERCENT ?? 0) ?? 100;
    } else {
      yMax =
        d3.max(this.rawData, (d) => {
          return Math.max(
            d.PASSENGERS_PERCENT ?? 0,
            d.NETWORK_PERCENT ?? 0,
            d.POPULATION_PERCENT ?? 0,
            d.ANNUAL_TICKETS_PERCENT ?? 0,
          );
        }) ?? 100;
    }

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

  private addGrid(chart: any, y: d3.ScaleLinear<number, number>, width: number): void {
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
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
  ): void {
    const { width, margin } = this.dimensions;
    const legend = this.createLegend(svg, width, margin);

    if (this.viewMode === 'average') {
      this.drawAverageView(chart, x, y, legend);
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

  private drawAverageView(
    chart: any,
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    legend: any,
  ): void {
    const averageData = this.rawData.map((d) => ({
      YEAR: d.YEAR,
      AVERAGE: d.AVERAGE_PERCENT ?? 0,
    }));

    this.addBaselineLine(chart, y);

    this.drawLine(chart, averageData, x, y, COLORS.AVERAGE, 'AVERAGE');
    this.drawDotsForAverage(chart, averageData, x, y, COLORS.AVERAGE);
    this.addLegendItem(legend, COLORS.AVERAGE, 'AVERAGE %');
  }

  private drawSeparateView(
    chart: any,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    legend: any,
  ): void {
    const keys: DataKey[] = ['PASSENGERS', 'NETWORK', 'POPULATION', 'ANNUAL_TICKETS'];
    const labels = {
      PASSENGERS: 'PASSENGERS',
      NETWORK: 'NETWORK LENGTH',
      POPULATION: 'POPULATION',
      ANNUAL_TICKETS: 'TICKET SALES',
    };

    this.addBaselineLine(chart, y);

    keys.forEach((key, index) => {
      const dataWithPercent = this.rawData.map((d) => ({
        YEAR: d.YEAR,
        [key]: d[(key + '_PERCENT') as keyof CsvRow] ?? 0,
      }));

      this.drawLine(chart, dataWithPercent, x, y, COLORS[key], key);
      this.drawDotsForKey(chart, dataWithPercent, x, y, COLORS[key], key);
      this.addLegendItem(legend, COLORS[key], labels[key], index);
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
      .line()
      .x((d: any) => x(d.YEAR))
      .y((d: any) => y(d[key]))
      .curve(d3.curveMonotoneX);

    chart
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', key === 'AVERAGE' ? 3 : 2.5)
      .attr('d', lineGenerator);
  }

  private addBaselineLine(chart: any, y: d3.ScaleLinear<number, number>): void {
    const baselineY = y(100);
    chart
      .append('line')
      .attr('x1', 0)
      .attr('x2', this.dimensions.width)
      .attr('y1', baselineY)
      .attr('y2', baselineY)
      .attr('stroke', '#999')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '6 4')
      .attr('opacity', 0.6);

    chart
      .append('text')
      .attr('x', this.dimensions.width - 150)
      .attr('y', baselineY + 10)
      .attr('text-anchor', 'end')
      .attr('fill', '#999')
      .attr('font-size', 10)
      .attr('font-style', 'italic')
      .text('Baseline 100%');
  }

  private drawDotsForAverage(
    chart: any,
    data: any[],
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    color: string,
  ): void {
    chart
      .selectAll('.dot-total')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: any) => x(d.YEAR))
      .attr('cy', (d: any) => y(d.AVERAGE))
      .attr('r', 4)
      .attr('fill', color);
  }

  private drawDotsForKey(
    chart: any,
    data: any[],
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    color: string,
    key: DataKey,
  ): void {
    chart
      .selectAll(`.dot-${key}`)
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: any) => x(d.YEAR))
      .attr('cy', (d: any) => y(d[key]))
      .attr('r', 4)
      .attr('fill', color);
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

  private drawAnnotations(chart: any, x: d3.ScaleLinear<number, number>): void {
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
}
