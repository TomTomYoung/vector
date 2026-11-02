import {crossProduct, displacement} from "../utils/geometry.js";
import {clipCell} from "./clipCell.js";
import {triangulatePolygon} from "./polygons.js";
import {signedArea} from "./measurements.js";

function triangleSides(triangle) {
  const sign = Math.sign(signedArea({points: triangle}));
  return triangle.map((a, i) => {
    const v = displacement(a, triangle[(i + 1) % 3]);
    return p => sign * crossProduct(v, displacement(a, p));
  });
}

function intersectionOfCell(cell, sides, clip) {
  for (const side of sides) cell = clip(cell, side);
  return cell;
}

function subtractCells(subject, cutters, clip) {
  let cells = subject;
  for (const sides of cutters) {
    const result = [];
    for (const cell of cells) {
      if (!intersectionOfCell(cell, sides, clip).length) {
        result.push(cell);
        continue;
      }
      let inside = cell;
      for (const side of sides) {
        const outside = clip(inside, p => -side(p));
        if (outside.length) result.push(outside);
        inside = clip(inside, side);
        if (!inside.length) break;
      }
    }
    cells = result;
  }
  return cells;
}

// Cells may share edges. Only their interiors are disjoint. Holes remain uncovered.
export function polygonBoolean({first, second, operation}, ops = {}) {
  const triangulate = ops.triangulatePolygon ?? triangulatePolygon, clip = ops.clipCell ?? clipCell;
  const a = triangulate({points: first}, ops), b = triangulate({points: second}, ops);
  if (!a || !b) return null;
  const cutA = a.map(triangleSides), cutB = b.map(triangleSides);
  switch (operation) {
    case "intersection":
      return a.flatMap(cell => cutB.map(sides => intersectionOfCell(cell, sides, clip)).filter(part => part.length));
    case "difference": return subtractCells(a, cutB, clip);
    case "union": return [...a, ...subtractCells(b, cutA, clip)];
    case "xor": return [...subtractCells(a, cutB, clip), ...subtractCells(b, cutA, clip)];
    default: throw new RangeError("Unknown region operation");
  }
}

// One clipped Voronoi cell per distinct site, in the order of its first occurrence.
export function voronoiCells({sites, box}, ops = {}) {
  const clip = ops.clipCell ?? clipCell;
  if (!(box.width > 0 && box.height > 0)) return null;
  const {x, y, width, height} = box;
  const rectangle = [{x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height}];
  const unique = [], seen = new Map();
  for (let index = 0; index < sites.length; index++) {
    const site = sites[index], key = site.x + "," + site.y;
    if (!seen.has(key)) {seen.set(key, true); unique.push({site, index});}
  }
  return unique.map(({site, index}) => {
    let vertices = rectangle;
    for (const other of unique) {
      if (other.index === index) continue;
      const v = displacement(site, other.site);
      const mid = {x: site.x + v.x / 2, y: site.y + v.y / 2};
      vertices = clip(vertices, p => (mid.x - p.x) * v.x + (mid.y - p.y) * v.y);
      if (!vertices.length) break;
    }
    return {index, site, points: vertices};
  });
}
