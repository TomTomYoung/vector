import assert from "node:assert/strict";
import test from "node:test";
import {projectOnLine, closestOnSegment, circleTangentPoints, pointToLineDistance} from "../src/utils/geometry.js";
import {nearestPosition} from "../src/model/linear.js";
import {createToolset} from "../src/model/tools.js";

const run = createToolset();
const p = (x, y) => ({x, y});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test("projection keeps the line parameter, while the closest segment point includes endpoints", () => {
  const point = p(6, 3), start = p(0, 0), end = p(4, 0);
  assert.deepEqual(projectOnLine(point, start, end), {point:p(6, 0), t:1.5});
  assert.deepEqual(closestOnSegment(point, start, end), {point:end, t:1});
  near(pointToLineDistance(point, {x1:0, y1:0, x2:4, y2:0}), Math.sqrt(13));
  assert.equal(projectOnLine(point, start, start), null);
  assert.deepEqual(closestOnSegment(point, end, end), {point:end, t:0});
  assert.deepEqual(nearestPosition([start, start], point), {position:0, distance:Infinity});
});

test("reflecting twice across an oblique line restores the point, including beyond either endpoint", () => {
  const start = p(2, 2), end = p(3, 3);
  const reflect = point => run("reflectPoint", {point, start, end});
  assert.deepEqual(reflect(p(0, 4)), p(4, 0));
  assert.deepEqual(reflect(reflect(p(-2, 6))), p(-2, 6));
  assert.deepEqual(reflect(p(4, 4)), p(4, 4));
  assert.equal(run("reflectPoint", {point:start, start:end, end}), null);
  const alternate = createToolset({operations:{projectOnLine: () => ({t:0.5, point:p(1, 1)})}});
  assert.deepEqual(alternate("reflectPoint", {point:p(0, 0), start, end}), p(2, 2));
});

test("external tangents satisfy both radius and orthogonality and a boundary point has one contact", () => {
  const center = p(1, 2), exterior = p(6, 2), radius = 3;
  const hits = circleTangentPoints(exterior, center, radius);
  assert.equal(hits.length, 2);
  near(hits[0].x, 2.8); near(hits[0].y, -0.4);
  near(hits[1].x, 2.8); near(hits[1].y, 4.4);
  for (const q of hits) {
    near(Math.hypot(q.x-center.x, q.y-center.y), radius);
    near((q.x-center.x)*(exterior.x-q.x) + (q.y-center.y)*(exterior.y-q.y), 0);
  }
  assert.deepEqual(circleTangentPoints(p(4, 2), center, radius), [p(4, 2)]);
  assert.deepEqual(circleTangentPoints(center, center, radius), []);
  assert.deepEqual(circleTangentPoints(exterior, center, 0), []);
});

test("length, perimeter and algebraic area handle winding, translation and repeated vertices", () => {
  const points = [p(0,0), p(3,0), p(3,4)];
  assert.equal(run("polylineLength", {points}), 7);
  assert.equal(run("polylineLength", {points, closed:true}), 12);
  assert.equal(run("signedArea", {points}), 6);
  assert.equal(run("signedArea", {points:points.toReversed()}), -6);
  const translated = [...points, points[0]].map(q => p(q.x + 1e12, q.y - 1e12));
  assert.equal(run("signedArea", {points:translated}), 6);
  assert.equal(run("polylineLength", {points:translated, closed:true}), 12);
  assert.equal(run("signedArea", {points:[p(0,0), p(2,2), p(0,2), p(2,0)]}), 0);
  assert.equal(run("polylineLength", {points:[]}), 0);
  assert.equal(run("signedArea", {points:points.slice(0,2)}), 0);
  const manhattan = createToolset({operations:{distance:(a,b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y)}});
  assert.equal(manhattan("polylineLength", {points, closed:true}), 14);
});
