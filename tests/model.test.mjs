import test from "node:test";
import assert from "node:assert/strict";
import {createToolset} from "../src/model/tools.js";
import {circle, arc, vertices} from "../src/model/drawing.js";
import {split, splitAt} from "../src/model/linear.js";
import {deCasteljau, sampleBezierPoints} from "../src/model/bezier.js";

const p = (x, y) => ({x, y});
const start = p(0, 0), end = p(30, 40);
const run = createToolset();

test("separate hosts can call or compose the same leaves without editor state", () => {
  const payload = {center: start, point: end};
  assert.equal(circle(payload).radius, 50);
  const alternate = createToolset({operations: {distance: (a, b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y)}});
  assert.equal(alternate("circle", payload).radius, 70);
  assert.equal(alternate("dimension", {points: [start, end]}).length, 70);
  const request = JSON.parse('{"tool":"circle","args":{"center":{"x":0,"y":0},"point":{"x":30,"y":40}}}');
  assert.deepEqual(run(request.tool, request.args), circle(payload));
  assert.equal(globalThis.window, undefined);
});

test("indexed geometry reuses the caller's line tool and operations", () => {
  const vectors = [start, end];
  const index = {vectors, indices: [1, 0], method: "line", params: {ortho: true}};
  const overrides = {snapToOrtho: () => p(9, 7)};
  assert.deepEqual(vertices(index, overrides).end, p(9, 7));
  const custom = createToolset({tools: {line: ({start, end}) => ({kind: "segment", start: end, end: start})}});
  assert.deepEqual(custom("vertices", index), {kind: "segment", start, end});
  assert.deepEqual(run("vertices", index), {kind: "segment", start: end, end: p(30, 0)});
  assert.equal(run("vertices", {...index, indices: [3]}), null);
  assert.throws(() => run("constructor", {}), /Unknown tool/);
});

test("linear cuts accept computed positions and points with independent pick policy", () => {
  const points = [start, p(10, 0), p(10, 10)];
  const cut = p(2, 0);
  assert.deepEqual(splitAt(points, 0.2), [[start, cut], [cut, ...points.slice(1)]]);
  assert.deepEqual(split({points, point: cut}), splitAt(points, 0.2));
  assert.deepEqual(split({points, point: cut, endMargin: 5}), []);
  assert.deepEqual(split({points, point: p(4, 5), tolerance: 1}), []);
  const pinned = createToolset({operations: {nearestPosition: () => ({position: 1, distance: 0})}});
  assert.deepEqual(pinned("split", {points, point: start}), [[start, points[1]], points.slice(1)]);
  const edge = [p(5, -2), p(5, 3)];
  assert.deepEqual(run("trim", {points, boundaries: [edge], point: start}), [[p(5, 0), ...points.slice(1)]]);
  assert.deepEqual(run("extend", {points, boundaries: [[p(-3, -2), p(-3, 2)]]}), [[p(-3, 0), ...points.slice(1)]]);
  assert.deepEqual(run("join", {segments: [points.slice(0, 2), points.slice(1).reverse()]}), points);
  assert.deepEqual(points, [p(0, 0), p(10, 0), p(10, 10)]);
});

test("drawing and selection return geometry, text, measures or caller-owned IDs", () => {
  const points = [start, p(10, 20), end, p(12, 23), p(20, 40)];
  assert.deepEqual(run("rectangle", {start: end, end: start}), {kind:"rectangle", x:0, y:0, width:30, height:40});
  assert.equal(run("polygon", {points}).kind, "polygon");
  assert.equal(run("polyline", {points, closed:true}).closed, true);
  assert.deepEqual(run("path", {points, mode:"curve"}).segments.map(s => s.kind), ["cubic", "segment"]);
  assert.equal(run("spline", {points}).segments.length, 4);
  for (const [name, degree] of [["quadraticBezier", 2], ["cubicBezier", 3], ["nthBezier", 4]]) {
    const curve = run(name, {points});
    assert.deepEqual(curve.points, points.slice(0, degree + 1));
    assert.deepEqual(deCasteljau(curve.points, 1), points[degree]);
    assert.deepEqual(sampleBezierPoints(curve.points, 10)[0], start);
  }
  assert.equal(run("text", {point: start, content: "図面"}).content, "図面");
  assert.equal(run("text", {point: start, content: " "}), null);
  const bounds = {x:0, y:0, width:10, height:20};
  assert.deepEqual(run("select", {bounds, candidates:[{id:"ok", box:bounds}, {id:"out", box:{...bounds,x:1}}]}), ["ok"]);
  assert.deepEqual(run("select", {selected:["a","b"], target:"a", toggle:true}), ["b"]);
  assert.equal(run("dimension", {mode:"angular", points:[p(1,0), start, p(0,-1)]}).turn, Math.PI * 1.5);
});

test("three-point arcs honor the intermediate point on major, minor and reversed arcs", () => {
  const a = p(1, 0), b = p(0, 1), c = p(0, -1), left = p(-1, 0);
  assert.equal(arc({start:a, through:left, end:b}).turn, -1.5 * Math.PI);
  assert.equal(arc({start:b, through:left, end:a}).turn, 1.5 * Math.PI);
  assert.equal(arc({start:b, through:a, end:c}).turn, -Math.PI);
  assert.equal(arc({start, through:p(1, 1), end:p(2, 2)}), null);
});

test("construction tools return an edit before the caller changes either original", () => {
  const first = [start, p(10, 0)], second = [start, p(0, 10)];
  const bevel = run("chamfer", {first, second, distance1:3, distance2:4});
  assert.deepEqual(bevel.segments, [[p(3,0), first[1]], [p(0,4), second[1]]]);
  assert.deepEqual(bevel.bridge, {kind:"segment", start:p(3,0), end:p(0,4)});
  const round = run("fillet", {first, second, radius:3}).bridge;
  assert.ok(Math.abs(round.center.x - 3) < 1e-10 && Math.abs(round.center.y - 3) < 1e-10);
  assert.equal(round.turn, -Math.PI / 2);
  assert.deepEqual(first, [p(0,0), p(10,0)]);
  assert.deepEqual(second, [p(0,0), p(0,10)]);
  const parallel = [p(0,1), p(10,1)];
  assert.equal(run("fillet", {first, second:parallel, radius:3}), null);
  const shape = run("line", {start, end:p(10,0)});
  assert.deepEqual(run("offset", {shape, point:p(3,8), amount:2}), {kind:"segment", start:p(0,2), end:p(10,2)});
});
