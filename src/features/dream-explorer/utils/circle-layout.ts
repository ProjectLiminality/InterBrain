/**
 * Circle Layout Engine
 *
 * Force-simulation-based circle packing using d3-force.
 *
 * Two modes: equal radii and size-weighted radii.
 * Both layouts are precomputed headlessly at construction time.
 * Mode switches emit the cached layout instantly — CSS transitions
 * on ExplorerCircle handle the smooth visual interpolation.
 *
 * Usage:
 *   const engine = new CircleLayoutEngine(items, containerRadius);
 *   engine.onUpdate = (positions) => setPositioned(positions);
 *   engine.setMode('weighted');  // emits cached weighted layout
 *   engine.destroy();            // cleanup
 */

import { forceSimulation, forceCollide, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force';
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

/** Run a fresh simulation to convergence and return scaled positions */
function solveLayout(
  items: ExplorerItem[],
  radii: number[],
  containerRadius: number,
  startPositions?: { x: number; y: number }[]
): PositionedItem[] {
  const nodes: ForceNode[] = items.map((item, i) => ({
    r: radii[i],
    item,
    x: startPositions ? startPositions[i].x : 0,
    y: startPositions ? startPositions[i].y : 0,
  }));

  // Deterministic initial positions on a circle (only if no start positions)
  if (!startPositions && nodes.length > 1) {
    const totalArea = nodes.reduce((s, d) => s + d.r * d.r, 0);
    const initR = Math.sqrt(totalArea) * 1.2;
    for (let i = 0; i < nodes.length; i++) {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      nodes[i].x = Math.cos(angle) * initR;
      nodes[i].y = Math.sin(angle) * initR;
    }
  }

  // Run simulation headlessly to convergence
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

export type LayoutMode = 'equal' | 'weighted';

export class CircleLayoutEngine {
  private equalLayout: PositionedItem[] = [];
  private weightedLayout: PositionedItem[] = [];
  private containerRadius: number;
  private mode: LayoutMode = 'equal';
  private items: ExplorerItem[] = [];

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
      this.items = items;
      this.emit();
      return;
    }

    // Sort for deterministic identity
    const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path));
    this.items = sorted;
    const maxSize = Math.max(...sorted.map(i => Math.max(i.size, 1)));

    const equalRadii = sorted.map(() => EQUAL_RADIUS);
    const weightedRadii = sorted.map(item => computeWeightedRadius(item, maxSize));

    // 1. Solve equal layout from scratch
    this.equalLayout = solveLayout(sorted, equalRadii, containerRadius);

    // 2. Solve weighted layout starting from equal's converged positions
    //    This ensures continuity — the weighted layout is "where things end up
    //    if you grow/shrink radii from the equal arrangement"
    const equalRawPositions = this.equalLayout.map(p => {
      // Reverse the container scaling to get raw simulation coordinates
      const encR = getEnclosingRadius(
        this.equalLayout.map(ep => ({ r: ep.r, x: ep.x, y: ep.y, item: ep.item })) as ForceNode[]
      );
      // Actually, we need unscaled positions. Simpler: just solve with equal positions as starting hint.
      // The scale factor is containerRadius / enclosingRadius, so raw = scaled / scale = scaled * encR / containerRadius
      return { x: p.x, y: p.y };
    });
    this.weightedLayout = solveLayout(sorted, weightedRadii, containerRadius, equalRawPositions);

    this.emit();
  }

  /** Switch between equal and weighted modes — emits cached layout */
  setMode(mode: LayoutMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.emit();
  }

  /** Update container radius (e.g. on resize) — rescales cached layouts */
  setContainerRadius(radius: number): void {
    if (radius === this.containerRadius || this.containerRadius <= 0) return;
    const scale = radius / this.containerRadius;
    this.containerRadius = radius;

    // Rescale both cached layouts
    this.equalLayout = this.equalLayout.map(p => ({
      ...p,
      x: p.x * scale,
      y: p.y * scale,
      r: p.r * scale,
    }));
    this.weightedLayout = this.weightedLayout.map(p => ({
      ...p,
      x: p.x * scale,
      y: p.y * scale,
      r: p.r * scale,
    }));

    this.emit();
  }

  /** Cleanup */
  destroy(): void {
    this.onUpdate = null;
  }

  // ── Internal ──────────────────────────────────────────────────────

  private emit(): void {
    if (!this.onUpdate) return;
    this.onUpdate(this.mode === 'equal' ? this.equalLayout : this.weightedLayout);
  }
}
