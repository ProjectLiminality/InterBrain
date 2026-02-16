/**
 * Circle Layout Engine
 *
 * Force-simulation-based circle packing using d3-force.
 *
 * Three modes precomputed at construction time:
 *
 * 1. Equal layout: all items at uniform radius, collision + centering.
 *
 * 2. Weighted layout: derived from equal positions, size-based radii,
 *    same force sim repacks them.
 *
 * 3. Reduced layout: derived from equal positions, submodules/readme
 *    keep equal radius, everything else at r=0. Same force sim repacks.
 *
 * All three use the same solveLayout function. Mode switches emit the
 * cached layout instantly — CSS transitions on ExplorerCircle handle
 * the smooth visual interpolation.
 */

import {
  forceSimulation,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import type { ExplorerItem, PositionedItem } from '../types/explorer';

interface ForceNode extends SimulationNodeDatum {
  r: number;
  item: ExplorerItem;
}

// ── Radius computation ────────────────────────────────────────────────

const EQUAL_RADIUS = 40;

function computeWeightedRadius(item: ExplorerItem, maxSize: number): number {
  if (item.type === 'readme') return 50;
  const size = Math.max(item.size, 1);
  const normalized = Math.sqrt(size / maxSize);
  return 20 + normalized * 60; // 20–80
}

function isReducedItem(item: ExplorerItem): boolean {
  return item.type === 'dream-submodule' ||
    item.type === 'dreamer-submodule' ||
    item.type === 'readme';
}

// ── Helpers ───────────────────────────────────────────────────────────

function getEnclosingRadius(nodes: ForceNode[]): number {
  let max = 0;
  for (const n of nodes) {
    const d = Math.sqrt((n.x || 0) ** 2 + (n.y || 0) ** 2) + n.r;
    if (d > max) max = d;
  }
  return max || 1;
}

function scaleToContainer(nodes: ForceNode[], containerRadius: number): PositionedItem[] {
  const encR = getEnclosingRadius(nodes);
  const scale = (containerRadius * 0.95) / encR;
  return nodes.map(n => ({
    item: n.item,
    x: (n.x || 0) * scale,
    y: (n.y || 0) * scale,
    r: n.r * scale,
  }));
}

// ── Universal force sim ──────────────────────────────────────────────

/**
 * Run force simulation: collision + centering. Radii are fixed (no
 * interpolation). Scale result to fit container.
 */
function solveLayout(
  items: ExplorerItem[],
  radii: number[],
  containerRadius: number,
  startPositions?: { x: number; y: number }[],
): PositionedItem[] {
  const nodes: ForceNode[] = items.map((item, i) => ({
    r: radii[i],
    item,
    x: startPositions ? startPositions[i].x : 0,
    y: startPositions ? startPositions[i].y : 0,
  }));

  const sim: Simulation<ForceNode, undefined> = forceSimulation<ForceNode>(nodes)
    .force('collide', forceCollide<ForceNode>(d => d.r + 1).strength(1).iterations(3))
    .force('x', forceX<ForceNode>(0).strength(0.05))
    .force('y', forceY<ForceNode>(0).strength(0.05))
    .stop();

  for (let i = 0; i < 300; i++) {
    sim.tick();
    if (sim.alpha() < 0.001) break;
  }

  return scaleToContainer(nodes, containerRadius);
}

// ── Engine ────────────────────────────────────────────────────────────

export type LayoutMode = 'equal' | 'weighted' | 'reduced';

export class CircleLayoutEngine {
  private equalLayout: PositionedItem[] = [];
  private weightedLayout: PositionedItem[] = [];
  private reducedLayout: PositionedItem[] = [];
  private containerRadius: number;
  private mode: LayoutMode = 'equal';

  /** Called with new positions whenever layout changes */
  onUpdate: ((positions: PositionedItem[]) => void) | null = null;

  constructor(items: ExplorerItem[], containerRadius: number, initialMode: LayoutMode = 'equal') {
    this.containerRadius = containerRadius;
    this.mode = initialMode;

    if (items.length === 0) {
      this.emit();
      return;
    }

    if (items.length === 1) {
      const single: PositionedItem = {
        item: items[0],
        x: 0,
        y: 0,
        r: containerRadius * 0.6,
      };
      this.equalLayout = [single];
      this.weightedLayout = [single];
      this.reducedLayout = [isReducedItem(items[0]) ? single : { ...single, r: 0 }];
      this.emit();
      return;
    }

    // Sort for deterministic identity
    const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path));
    const maxSize = Math.max(...sorted.map(i => Math.max(i.size, 1)));

    const equalRadii = sorted.map(() => EQUAL_RADIUS);
    const weightedRadii = sorted.map(item => computeWeightedRadius(item, maxSize));
    const reducedRadii = sorted.map(item => isReducedItem(item) ? EQUAL_RADIUS : 0);

    // 1. Equal layout: uniform radii, collision + centering
    this.equalLayout = solveLayout(sorted, equalRadii, containerRadius);

    // 2. Weighted layout: start from equal positions, size-based radii
    const equalPositions = this.equalLayout.map(p => ({ x: p.x, y: p.y }));
    this.weightedLayout = solveLayout(sorted, weightedRadii, containerRadius, equalPositions);

    // 3. Reduced layout: start from equal positions, non-reduced items at r=0
    this.reducedLayout = solveLayout(sorted, reducedRadii, containerRadius, equalPositions);

    this.emit();
  }

  /** Switch between layout modes — emits cached layout */
  setMode(mode: LayoutMode, force = false): void {
    if (mode === this.mode && !force) return;
    this.mode = mode;
    this.emit();
  }

  /** Update container radius (e.g. on resize) — rescales cached layouts */
  setContainerRadius(radius: number): void {
    if (radius === this.containerRadius || this.containerRadius <= 0) return;
    const scale = radius / this.containerRadius;
    this.containerRadius = radius;

    const rescale = (layout: PositionedItem[]) => layout.map(p => ({
      ...p,
      x: p.x * scale,
      y: p.y * scale,
      r: p.r * scale,
    }));

    this.equalLayout = rescale(this.equalLayout);
    this.weightedLayout = rescale(this.weightedLayout);
    this.reducedLayout = rescale(this.reducedLayout);

    this.emit();
  }

  /** Cleanup */
  destroy(): void {
    this.onUpdate = null;
  }

  // ── Internal ──────────────────────────────────────────────────────

  private emit(): void {
    if (!this.onUpdate) return;
    switch (this.mode) {
      case 'equal': this.onUpdate(this.equalLayout); break;
      case 'weighted': this.onUpdate(this.weightedLayout); break;
      case 'reduced': this.onUpdate(this.reducedLayout); break;
    }
  }
}
