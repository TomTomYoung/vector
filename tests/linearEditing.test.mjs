import assert from "node:assert/strict";
import test from "node:test";
import {trim, split, extend, localPoints} from "../src/utils/linearEditing.js";

const identity = {
  a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
  inverse() { return this; }, multiply(other) { return other; },
  transformPoint({x,y}) { return {x,y}; }
};
const canvas = { getScreenCTM: () => identity };
globalThis.window = { saveState() {} };

// Only the SVG accessors used by the geometry module are needed here.
function shape(tagName, attributes, matrix = identity) {
  const el = {
    tagName, attributes: {...attributes}, getScreenCTM: () => matrix,
    getAttribute(key) { return this.attributes[key] ?? null; },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    removeAttribute(key) { delete this.attributes[key]; },
    cloneNode() { return shape(this.tagName, this.attributes, matrix); },
    after(other) { this.next = other; },
    get points() {
      return this.attributes.points.split(/\s+/).map(pair => {
        const [x, y] = pair.split(",").map(Number);
        return {x, y};
      });
    }
  };
  for (const key of ["x1","y1","x2","y2"]) Object.defineProperty(el, key, {
    get() { return {baseVal: {value: Number(el.attributes[key])}}; }
  });
  return el;
}
const line = (x1,y1,x2,y2,attrs={}) => shape("line", {x1,y1,x2,y2,...attrs});

test("trimming between duplicate and distinct boundaries preserves both outside pieces and their appearance", () => {
  const target = line(0,0,100,0, {"data-layer":"4", "stroke-dasharray":"10 5", id:"original"});
  const edge = line(20,-10,20,10);
  trim(target,canvas,[edge,edge,line(75,-10,75,10)],{x:45,y:0});
  assert.deepEqual(localPoints(target), [{x:0,y:0},{x:20,y:0}]);
  assert.deepEqual(localPoints(target.next), [{x:75,y:0},{x:100,y:0}]);
  assert.equal(target.next.getAttribute("data-layer"), "4");
  assert.equal(target.next.getAttribute("stroke-dasharray"), "10 5");
  assert.equal(target.next.getAttribute("id"), null);
});

test("trim ignores endpoint-only and missing intersections", () => {
  const target = line(0,0,20,0);
  trim(target,canvas,[line(20,0,20,10),line(10,20,10,30)],{x:8,y:0});
  assert.deepEqual(localPoints(target), [{x:0,y:0},{x:20,y:0}]);
});

test("split an open path at an existing corner, preserving relative and implicit path commands", () => {
  const target = shape("path", {d:"m10 10 20 0 v2e1 h20"});
  split(target,canvas,{x:30,y:10});
  assert.deepEqual(localPoints(target), [{x:10,y:10},{x:30,y:10}]);
  assert.deepEqual(localPoints(target.next), [{x:30,y:10},{x:30,y:30},{x:50,y:30}]);
});

test("preserve curves and closed or compound paths when an unsupported edit is requested", () => {
  for (const d of ["M0 0 Q5 5 10 0","M0 0 L50 0 Z","M4 4 L6 6 M1 2 L3 4","M2 4 L1e999 0"]) {
    const target = shape("path",{d});
    assert.deepEqual(localPoints(target), []);
    split(target,canvas,{x:12,y:6});
    assert.equal(target.getAttribute("d"),d);
  }
});

test("extend polyline endpoints against finite edges, skipping extrapolated intersections", () => {
  const target = shape("polyline",{points:"0,0 10,0 10,10"});
  extend(target,canvas,[line(-8,-3,-8,3),line(-4,17,-4,20),shape("path",{d:"M0 20 H20"})]);
  assert.deepEqual(localPoints(target),[{x:-8,y:0},{x:10,y:0},{x:10,y:20}]);
});

test("geometry stays in local coordinates when a transformed line is split", () => {
  const translate = dx => ({...identity, e: dx, inverse: () => translate(-dx),
    transformPoint: p => ({x:p.x+dx,y:p.y})});
  const target = shape("line",{x1:0,y1:0,x2:50,y2:0},translate(100));
  split(target,canvas,{x:125,y:0});
  assert.deepEqual(localPoints(target),[{x:0,y:0},{x:25,y:0}]);
  assert.deepEqual(localPoints(target.next),[{x:25,y:0},{x:50,y:0}]);
});
