import * as d3 from 'd3';
import { ElementRef } from '@angular/core';
import { ScaleLinear } from 'd3';

export function createSvgElement(
  element: HTMLElement,
  dimensions: {
    width: number;
    height: number;
    margin: { top: number; right: number; bottom: number; left: number };
  },
): d3.Selection<SVGSVGElement, unknown, null, undefined> {
  const { width, height, margin } = dimensions;
  const totalWidth = width + margin.left + margin.right;
  const totalHeight = height + margin.top + margin.bottom;

  return d3
    .select(element)
    .append('svg')
    .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
    .style('width', '100%')
    .style('height', 'auto');
}

export function addAxes(
  chart: any,
  x: ScaleLinear<number, number>,
  y: ScaleLinear<number, number>,
  height: number,
): void {
  chart
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')));

  chart.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('.2s')));
}

export function addGrid(chart: any, y: ScaleLinear<number, number>, width: number): void {
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

export function createLegend(
  svg: any,
  width: number,
  margin: { top: number; right: number; bottom: number; left: number },
  xOffset: number = 20,
): any {
  return svg
    .append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width + margin.left + xOffset}, ${margin.top + 20})`);
}

export function addLegendItem(legend: any, color: string, label: string, index: number = 0): void {
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

export function drawAnnotations(
  chart: any,
  x: ScaleLinear<number, number>,
  dimensions: { width: number; height: number },
  annotations: { year: number; label: string }[],
): void {
  const { width, height } = dimensions;
  const markerGroup = chart.append('g').attr('class', 'markers');

  annotations.forEach(({ year, label }) => {
    const xPos = x(year);
    if (xPos < 0 || xPos > width) return;

    addAnnotationLine(markerGroup, xPos, height);
    addAnnotationLabel(markerGroup, xPos, label);
  });
}

export function addAnnotationLine(markerGroup: any, xPos: number, height: number): void {
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

export function addAnnotationLabel(markerGroup: any, xPos: number, label: string): void {
  markerGroup
    .append('text')
    .attr('x', xPos + 6)
    .attr('y', 14)
    .attr('fill', '#666')
    .attr('font-size', 12)
    .text(label);
}

export function moveTooltip(
  event: MouseEvent,
  tooltipEl: ElementRef<HTMLDivElement>,
  containerEl: ElementRef<HTMLElement>,
): void {
  const elem = tooltipEl.nativeElement;
  const containerRect = containerEl.nativeElement.getBoundingClientRect();
  elem.style.left = event.clientX - containerRect.left + 15 + 'px';
  elem.style.top = event.clientY - containerRect.top - 15 + 'px';
}

export function hideTooltip(tooltipEl: ElementRef<HTMLDivElement>): void {
  tooltipEl.nativeElement.style.display = 'none';
}

export function drawLine(
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

export function createScales(
  rawData: any[],
  viewMode: 'separate' | 'total' | 'pie',
  dimensions: { width: number; height: number },
): { x: d3.ScaleLinear<number, number>; y: d3.ScaleLinear<number, number> } {
  const { width, height } = dimensions;

  const x = d3
    .scaleLinear()
    .domain(d3.extent(rawData, (d: any) => d.YEAR) as [number, number])
    .range([0, width]);

  const yMax =
    viewMode === 'total'
      ? (d3.max(rawData, (d: any) => d.TOTAL) ?? 0)
      : (d3.max(rawData, (d: any) => Math.max(d.BUS, d.TRAM, d.UNDERGROUND)) ?? 0);

  const y = d3
    .scaleLinear()
    .domain([0, yMax * 1.05])
    .nice()
    .range([height, 0]);

  return { x, y };
}
