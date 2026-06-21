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
} from '../../core/services/chart-utils';
import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ScaleLinear } from 'd3';

type DataKey = 'PASSENGERS' | 'NETWORK' | 'POPULATION' | 'TICKETS';
type ViewMode = 'separate' | 'average';

interface CsvRow {
  YEAR: number;
  PASSENGERS: number;
  NETWORK: number;
  POPULATION: number;
  TICKETS: number;
  PASSENGERS_PERCENT?: number;
  NETWORK_PERCENT?: number;
  POPULATION_PERCENT?: number;
  TICKETS_PERCENT?: number;
  AVERAGE_PERCENT?: number;
  TICKETS_INTERPOLATED?: boolean;
}

const COLORS = {
  PASSENGERS: '#1f77b4',
  NETWORK: '#ff7f0e',
  POPULATION: '#2ca02c',
  TICKETS: '#d62728',
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
  @ViewChild('tooltip') tooltipEl!: ElementRef<HTMLDivElement>;

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
      TICKETS: +d.ANNUAL_TICKETS,
    }));

    const yearMap = new Map<number, CsvRow>();

    tickets.forEach((d) => {
      if (!yearMap.has(d.YEAR)) {
        yearMap.set(d.YEAR, {
          YEAR: d.YEAR,
          PASSENGERS: 0,
          NETWORK: 0,
          POPULATION: 0,
          TICKETS: 0,
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
          TICKETS: 0,
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
          TICKETS: 0,
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
          TICKETS: 0,
        });
      }
      yearMap.get(d.YEAR)!.TICKETS = d.TICKETS;
    });

    this.rawData = Array.from(yearMap.values())
      .filter((d) => d.PASSENGERS > 0 || d.NETWORK > 0 || d.POPULATION > 0 || d.TICKETS > 0)
      .sort((a, b) => a.YEAR - b.YEAR);
    this.rawData = this.rawData.filter((d) => d.YEAR <= 2023);

    this.interpolateMissingTicketData();
    this.calculatePercentages();
  }

  private interpolateMissingTicketData(): void {
    const realDataPoints = this.rawData
      .filter((d) => d.TICKETS > 0)
      .sort((a, b) => a.YEAR - b.YEAR);

    const missingDataPoints = this.rawData.filter((d) => d.TICKETS === 0);

    missingDataPoints.forEach((d) => {
      if (d.TICKETS > 0) return;

      const prev = realDataPoints.filter((p) => p.YEAR < d.YEAR).pop();
      const next = realDataPoints.filter((p) => p.YEAR > d.YEAR)[0];

      let interpolatedValue = 0;
      let isInterpolated = false;

      if (prev && next) {
        const ratio = (d.YEAR - prev.YEAR) / (next.YEAR - prev.YEAR);
        interpolatedValue =
          prev.TICKETS + (next.TICKETS - prev.TICKETS) * ratio;
        isInterpolated = true;
      } else if (prev) {
        interpolatedValue = prev.TICKETS;
        isInterpolated = true;
      } else if (next) {
        interpolatedValue = next.TICKETS;
        isInterpolated = true;
      }

      if (isInterpolated) {
        d.TICKETS = Math.round(interpolatedValue);
        d.TICKETS_INTERPOLATED = true;
      }
    });
  }

  private calculatePercentages(): void {
    const baselineData = this.rawData.find((d) => d.YEAR === this.baselineYear);
    if (!baselineData) return;

    const baselinePassengers = baselineData.PASSENGERS;
    const baselineNetwork = baselineData.NETWORK;
    const baselinePopulation = baselineData.POPULATION;
    const baselineTickets = baselineData.TICKETS;

    this.rawData.forEach((d) => {
      d.PASSENGERS_PERCENT = baselinePassengers > 0 ? (d.PASSENGERS / baselinePassengers) * 100 : 0;
      d.NETWORK_PERCENT = baselineNetwork > 0 ? (d.NETWORK / baselineNetwork) * 100 : 0;
      d.POPULATION_PERCENT = baselinePopulation > 0 ? (d.POPULATION / baselinePopulation) * 100 : 0;
      d.TICKETS_PERCENT = baselineTickets > 0 ? (d.TICKETS / baselineTickets) * 100 : 0;
      d.AVERAGE_PERCENT =
        ((d.PASSENGERS_PERCENT || 0) +
          (d.NETWORK_PERCENT || 0) +
          (d.POPULATION_PERCENT || 0) +
          (d.TICKETS_PERCENT || 0)) /
        4;
    });
  }

  private createChart(): void {
    if (!this.rawData?.length) return;

    const element = this.chartContainer.nativeElement;
    element.innerHTML = '';

    const svg = createSvgElement(element, this.dimensions);
    const chart = svg
      .append('g')
      .attr('transform', `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);

    const { x, y } = this.createScales();
    addAxes(chart, x, y, this.dimensions.height);
    addGrid(chart, y, this.dimensions.width);
    this.drawLegendAndLines(svg, chart, x, y);
  }

  private createScales() {
    const { width, height } = this.dimensions;

    const x = d3.scaleLinear().domain([2001, 2023]).range([0, width]);

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
            d.TICKETS_PERCENT ?? 0,
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

  private drawLegendAndLines(
    svg: any,
    chart: any,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
  ): void {
    const { width, margin } = this.dimensions;
    const legend = createLegend(svg, width, margin);

    drawAnnotations(chart, x, this.dimensions, [
      { year: 2012, label: '365€ Ticket' },
      { year: 2020, label: 'COVID-19' },
    ]);

    if (this.viewMode === 'average') {
      this.drawAverageView(chart, x, y, legend);
    } else {
      this.drawSeparateView(chart, x, y, legend);
    }
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

    drawLine(chart, averageData, x, y, COLORS.AVERAGE, 'AVERAGE');
    this.drawDotsForAverage(chart, averageData, x, y, COLORS.AVERAGE);
    addLegendItem(legend, COLORS.AVERAGE, 'AVERAGE %');
  }

  private drawSeparateView(
    chart: any,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    legend: any,
  ): void {
    const keys: DataKey[] = ['PASSENGERS', 'NETWORK', 'POPULATION', 'TICKETS'];
    const labels = {
      PASSENGERS: 'PASSENGERS',
      NETWORK: 'NETWORK LENGTH',
      POPULATION: 'POPULATION',
      TICKETS: 'TICKET SALES',
    };

    this.addBaselineLine(chart, y);

    keys.forEach((key, index) => {
      const dataWithPercent = this.rawData.map((d) => ({
        YEAR: d.YEAR,
        [key]: d[(key + '_PERCENT') as keyof CsvRow] ?? 0,
        interpolated: key === 'TICKETS' ? !!d.TICKETS_INTERPOLATED : false,
      }));

      drawLine(chart, dataWithPercent, x, y, COLORS[key], key);
      this.drawDotsForKey(chart, dataWithPercent, x, y, COLORS[key], key);
      addLegendItem(legend, COLORS[key], labels[key], index);
    });
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
    const dots = chart
      .selectAll('.dot-average')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: any) => x(d.YEAR))
      .attr('cy', (d: any) => y(d.AVERAGE))
      .attr('r', 4)
      .attr('fill', color);

    dots
      .on('mouseover', (event: MouseEvent, d: any) => {
        this.showTooltip(event, d.YEAR, d.AVERAGE, 'AVERAGE', false);
      })
      .on('mousemove', (event: MouseEvent) => {
        moveTooltip(event, this.tooltipEl, this.chartContainer);
      })
      .on('mouseout', () => {
        hideTooltip(this.tooltipEl);
      });
  }

  private drawDotsForKey(
    chart: any,
    data: any[],
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    color: string,
    key: DataKey,
  ): void {
    const dots = chart
      .selectAll(`.dot-${key}`)
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: any) => x(d.YEAR))
      .attr('cy', (d: any) => y(d[key]))
      .attr('r', 4)
      .attr('fill', color);

    dots
      .on('mouseover', (event: MouseEvent, d: any) => {
        this.showTooltip(event, d.YEAR, d[key], key, d.interpolated);
      })
      .on('mousemove', (event: MouseEvent) => {
        moveTooltip(event, this.tooltipEl, this.chartContainer);
      })
      .on('mouseout', () => {
        hideTooltip(this.tooltipEl);
      });
  }

  private showTooltip(
    event: MouseEvent,
    year: number,
    value: number,
    label: string,
    interpolated: boolean = false,
  ): void {
    const elem = this.tooltipEl.nativeElement;
    elem.style.display = 'block';
    let html = `<strong>${label}</strong><br>${year}: ${value.toFixed(1)}%`;
    if (interpolated) {
      html += `<br><span style="color:red;">interpolated</span>`;
    }
    elem.innerHTML = html;
    moveTooltip(event, this.tooltipEl, this.chartContainer);
  }
}
