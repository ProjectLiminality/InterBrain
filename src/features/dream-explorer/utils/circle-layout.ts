/**
 * Circle Layout Engine
 *
 * Derivation chain:
 *
 * packCirclesInParent (deterministic, submodules only)
 *     │
 *     ▼
 * ReducedLayout (packed submodules only, everything else r=0 at origin)
 *     │ solveLayout (force sim: all items grow to EQUAL_RADIUS)
 *     ▼
 * EqualLayout
 *     │ solveLayout (force sim: items resize by file weight)
 *     ▼
 * WeightedLayout
 *
 * Reduced is the deterministic base layout (no sim). Equal and weighted
 * are derived from it via force simulation. Mode switches emit the
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
import { packCirclesInParent } from '../../dreamnode/utils/circle-packing';

interface ForceNode extends SimulationNodeDatum {
  r: number;
  item: ExplorerItem;
}

// ── Radius computation ────────────────────────────────────────────────

const EQUAL_RADIUS = 40;

function computeWeightedRadius(item: ExplorerItem, maxSize: number): number {
  const size = Math.max(item.size, 1);
  const normalized = Math.sqrt(size / maxSize);
  return 20 + normalized * 60; // 20–80
}

function isReducedItem(item: ExplorerItem): boolean {
  return item.type === 'dream-submodule' ||
    item.type === 'dreamer-submodule';
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
 *
 * centerStrength controls how aggressively nodes pull toward origin.
 * Default 0.05 is gentle (preserves proto structure). Higher values
 * (e.g. 0.3) force a tighter repack — useful when many nodes have
 * r=0 and surviving nodes need to consolidate.
 */
function solveLayout(
  items: ExplorerItem[],
  radii: number[],
  containerRadius: number,
  startPositions?: { x: number; y: number }[],
  centerStrength = 0.05,
): PositionedItem[] {
  const nodes: ForceNode[] = items.map((item, i) => ({
    r: radii[i],
    item,
    x: startPositions ? startPositions[i].x : 0,
    y: startPositions ? startPositions[i].y : 0,
  }));

  const sim: Simulation<ForceNode, undefined> = forceSimulation<ForceNode>(nodes)
    .force('collide', forceCollide<ForceNode>(d => d.r + 1).strength(1).iterations(3))
    .force('x', forceX<ForceNode>(0).strength(centerStrength))
    .force('y', forceY<ForceNode>(0).strength(centerStrength))
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

    // 1. Identify reduced items and their indices in the sorted array
    const reducedFlags = sorted.map(item => isReducedItem(item));
    const reducedCount = reducedFlags.filter(Boolean).length;

    // 2. Pack reduced items using HolonView's deterministic algorithm
    //    containerRadius * 0.95 matches HolonView's parentRadius computation
    const packed = packCirclesInParent(reducedCount, containerRadius * 0.95, 0);

    // 3. Build reducedLayout directly (no sim needed)
    //    Packed positions are already in container-relative pixel coords.
    //    Non-reduced items get r=0 at origin.
    let packedIdx = 0;
    this.reducedLayout = sorted.map((item, i) => {
      if (reducedFlags[i]) {
        const p = packed[packedIdx++];
        if (!p) return { item, x: 0, y: 0, r: 0 };  // safety: shouldn't happen
        return { item, x: p.x, y: p.y, r: p.radius * 0.95 };  // 0.95 visual gap
      }
      return { item, x: 0, y: 0, r: 0 };
    });

    // 4. Derive equalLayout: start from reduced positions for submodules,
    //    place non-reduced items equidistantly on an outer ring so the
    //    force sim pushes them outward smoothly instead of exploding from origin.
    const nonReducedIndices = sorted.map((_, i) => i).filter(i => !reducedFlags[i]);
    const nonReducedCount = nonReducedIndices.length;

    // Outer ring sits just beyond the submodule arrangement
    const maxSubR = this.reducedLayout.reduce((max, p) => {
      const edge = Math.sqrt(p.x * p.x + p.y * p.y) + p.r;
      return edge > max ? edge : max;
    }, 0);
    const outerRingR = maxSubR + EQUAL_RADIUS * 1.5;

    const equalStartPositions = this.reducedLayout.map(p => ({ x: p.x, y: p.y }));
    for (let i = 0; i < nonReducedCount; i++) {
      const angle = (2 * Math.PI * i) / nonReducedCount - Math.PI / 2;
      equalStartPositions[nonReducedIndices[i]] = {
        x: Math.cos(angle) * outerRingR,
        y: Math.sin(angle) * outerRingR,
      };
    }

    const equalRadii = sorted.map(() => EQUAL_RADIUS);
    this.equalLayout = solveLayout(sorted, equalRadii, containerRadius, equalStartPositions);

    // 4b. Back-fill reduced layout: non-reduced items get their equal-layout
    //     position with r=0, so the reduced↔equal transition only animates radius.
    for (const idx of nonReducedIndices) {
      this.reducedLayout[idx] = {
        ...this.reducedLayout[idx],
        x: this.equalLayout[idx].x,
        y: this.equalLayout[idx].y,
      };
    }

    // 5. Derive weightedLayout from equal positions
    const equalPositions = this.equalLayout.map(p => ({ x: p.x, y: p.y }));
    const weightedRadii = sorted.map(item => computeWeightedRadius(item, maxSize));
    this.weightedLayout = solveLayout(sorted, weightedRadii, containerRadius, equalPositions);

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
