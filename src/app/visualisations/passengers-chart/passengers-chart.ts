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
type ViewMode = 'separate' | 'total' | 'pie';

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

    const svg = createSvgElement(element, this.dimensions);
    const chart = svg
      .append('g')
      .attr('transform', `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);

    if (this.viewMode === 'pie') {
      this.drawPieChart(chart, svg);
    } else {
      const { x, y } = createScales(this.rawData, this.viewMode, this.dimensions);
      this.drawLineChart(chart, svg, x, y);
    }
  }

  private drawLineChart(svg: any, chart: any,
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
  ): void {

    addAxes(chart, x, y, this.dimensions.height);
    addGrid(chart, y, this.dimensions.width);

    const { width, margin } = this.dimensions;
    const legend = createLegend(svg, width, margin, -100);

    drawAnnotations(chart, x, this.dimensions, [
      { year: 2012, label: '365€ Ticket' },
      { year: 2020, label: 'COVID-19' },
    ]);

    if (this.viewMode === 'total') {
      this.drawTotalView(chart, x, y, legend);
    } else {
      this.drawSeparateView(chart, x, y, legend);
    }
  }

  private drawPieChart(chart: any, svg: any): void {
    const latestYear = d3.max(this.rawData, (d: any) => d.YEAR)!;
    const yearData = this.rawData.find((d: any) => d.YEAR === latestYear)!;

    const values = [
      { key: 'BUS', value: yearData.BUS, color: COLORS.BUS},
      { key: 'TRAM', value: yearData.TRAM, color: COLORS.TRAM},
      { key: 'UNDERGROUND', value: yearData.UNDERGROUND, color: COLORS.UNDERGROUND, },
    ];

    const total = values.reduce((sum, v) => sum + v.value, 0);
    const { width, height } = this.dimensions;
    const radius = Math.min(width, height) * 0.55;

    const pie = d3
      .pie<any>()
      .value((d: any) => d.value)
      .sort(null);

    const arc = d3.arc<any>().innerRadius(0).outerRadius(radius);

    const pieGroup = chart.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const arcs = pieGroup
      .selectAll('.arc')
      .data(pie(values))
      .enter()
      .append('g')
      .attr('class', 'arc');

    arcs
      .append('path')
      .attr('d', arc as any)
      .attr('fill', (d: any) => d.data.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = event.currentTarget as HTMLElement;
        d3.select(target).attr('opacity', 0.7);
        const pct = ((d.data.value / total) * 100).toFixed(1);
        this.showTooltipPie(event, d.data.key, d.data.value, pct);
      })
      .on('mousemove', (event: MouseEvent) => {
        moveTooltip(event, this.tooltipEl, this.chartContainer);
      })
      .on('mouseout', (event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement;
        d3.select(target).attr('opacity', 1);
        hideTooltip(this.tooltipEl);
      });

    const legend = createLegend(svg, width, this.dimensions.margin, -70);
    values.forEach((v, i) => {
      addLegendItem(legend, v.color, v.key, i);
    });

    pieGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .style('font-size', '20px')
      .style('font-weight', 'bold')
      .attr('dy', '-6em')
      .attr('dx', '5em')
      .text(`${latestYear}`);
  }


  private drawTotalView(
    chart: any,
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    legend: any,
  ): void {
    const totalData = this.rawData.map((d) => ({ YEAR: d.YEAR, TOTAL: d.TOTAL }));

    drawLine(chart, totalData, x, y, COLORS.TOTAL, 'TOTAL');
    this.drawDotsForTotal(chart, totalData, x, y, COLORS.TOTAL);
    addLegendItem(legend, COLORS.TOTAL, 'TOTAL');
  }

  private drawSeparateView(
    chart: any,
    x: ScaleLinear<number, number>,
    y: ScaleLinear<number, number>,
    legend: any,
  ): void {
    const transportKeys: TransportKey[] = ['BUS', 'TRAM', 'UNDERGROUND'];

    transportKeys.forEach((key, index) => {
      drawLine(chart, this.rawData, x, y, COLORS[key], key);
      this.drawDotsForKey(chart, this.rawData, x, y, COLORS[key], key);
      addLegendItem(legend, COLORS[key], key, index);
    });
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
        moveTooltip(event, this.tooltipEl, this.chartContainer);
      })
      .on('mouseout', () => {
        hideTooltip(this.tooltipEl);
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
        moveTooltip(event, this.tooltipEl, this.chartContainer);
      })
      .on('mouseout', () => {
        hideTooltip(this.tooltipEl);
      });
  }

  private showTooltipPie(
    event: MouseEvent,
    label: string,
    value: number,
    percentage: string,
  ): void {
    const elem = this.tooltipEl.nativeElement;
    elem.style.display = 'block';
    elem.innerHTML = `<strong>${label}</strong><br>${value.toLocaleString()} (${percentage}%)`;
    moveTooltip(event, this.tooltipEl, this.chartContainer);
  }

  private showTooltip(event: MouseEvent, year: number, value: number, label: string): void {
    const elem = this.tooltipEl.nativeElement;
    elem.style.display = 'block';
    elem.innerHTML = `<strong>${label}</strong><br>${year}: ${value.toLocaleString()}`;
    moveTooltip(event, this.tooltipEl, this.chartContainer);
  }
}
