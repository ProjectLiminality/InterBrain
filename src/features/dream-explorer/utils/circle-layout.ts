/**
 * Circle Layout Utility
 *
 * Uses d3-hierarchy's packSiblings + packEnclose for deterministic
 * circle packing that handles both equal-size and size-weighted layouts.
 */

import { packSiblings, packEnclose } from 'd3-hierarchy';
import type { ExplorerItem, PositionedItem } from '../types/explorer';

interface PackableCircle {
  r: number;
  x?: number;
  y?: number;
  _item: ExplorerItem;
  _isReadme: boolean;
}

/**
 * Pack explorer items into circles within a container.
 *
 * @param items - Items to pack
 * @param containerRadius - Available radius for the containing circle
 * @param sizeWeighted - Use file size to determine circle radius
 * @returns Positioned items scaled to fit within containerRadius
 */
export function packExplorerItems(
  items: ExplorerItem[],
  containerRadius: number,
  sizeWeighted: boolean = false
): PositionedItem[] {
  if (items.length === 0) return [];

  // Single item: center it
  if (items.length === 1) {
    const r = containerRadius * 0.6;
    return [{ item: items[0], x: 0, y: 0, r }];
  }

  // Separate README from other items
  const readmeItem = items.find(i => i.type === 'readme');
  const otherItems = items.filter(i => i.type !== 'readme');

  // Calculate radii
  const equalRadius = 40;
  let circles: PackableCircle[];

  if (sizeWeighted) {
    // Size-weighted: radius proportional to sqrt of file size
    const sizes = otherItems.map(i => Math.max(i.size, 1));
    const maxSize = Math.max(...sizes);
    const minRadius = 20;
    const maxRadius = 80;

    circles = otherItems.map((item, idx) => {
      const normalized = Math.sqrt(sizes[idx] / maxSize);
      const r = minRadius + normalized * (maxRadius - minRadius);
      return { r, _item: item, _isReadme: false };
    });
  } else {
    // Equal size: all circles same radius
    circles = otherItems.map(item => ({
      r: equalRadius,
      _item: item,
      _isReadme: false,
    }));
  }

  // Add README circle
  if (readmeItem) {
    // In equal mode: same size as everything else. In weighted mode: slightly larger.
    const readmeRadius = sizeWeighted ? 50 : equalRadius;
    circles.unshift({ r: readmeRadius, _item: readmeItem, _isReadme: true });
  }

  // Pack siblings using d3-hierarchy
  packSiblings(circles as any);

  // Get the enclosing circle
  const enclosing = packEnclose(circles as any);
  if (!enclosing) {
    return items.map((item, i) => ({
      item,
      x: 0,
      y: 0,
      r: containerRadius * 0.3,
    }));
  }

  // Scale factor to fit within containerRadius
  const padding = 1.0; // Use full container
  const scale = (containerRadius * padding) / enclosing.r;

  // Map back to positioned items, centered and scaled
  return circles.map(c => ({
    item: c._item,
    x: (c.x! - enclosing.x) * scale,
    y: (c.y! - enclosing.y) * scale,
    r: c.r * scale,
  }));
}
