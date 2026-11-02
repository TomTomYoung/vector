// Each entry contains a label and an editable input for the same public model contract.
const p = (x, y) => ({x, y});
const start = p(0, 0), end = p(6, 0), point = p(2, 1), center = start;
const triangle = [start, end, p(0, 4)];
const square = [start, p(4, 0), p(4, 4), p(0, 4)];
const shifted = square.map(p => ({x: p.x + 2, y: p.y + 1}));
const points = [start, p(2, 4), p(4, 4), end];
const matrix = {a: 0, b: 1, c: -1, d: 0, e: 3, f: 2};
const projective = [1, 0, 3, 0, 1, 2, 0.1, 0, 1];
const box = {x: 0, y: 0, width: 4, height: 4};
const boxes = {first: box, second: {...box, x: 2, y: 1}};
const legs = {first: [start, end], second: [start, p(0, 4)]};
const cross = {first: [start, end], second: [p(3, -2), p(3, 2)]};
const circles = {first: {center, radius: 3}, second: {center: p(4, 0), radius: 2}};
const arc = {center, start: p(3, 0), radius: 3, turn: Math.PI / 2};
const angle = Math.PI / 4, sweep = {radius: 3, turn: Math.PI / 2};
const ellipse = {center, rx: 4, ry: 2, angle};
const spline = {points, degree: 2, knots: [0, 0, 0, 0.5, 1, 1, 1], t: 0.25};
const curves = {points, t: 0.5};
const sites = [...square, p(2, 1)];
const groups = {
  "作図・編集・計測": {
    select: ["範囲選択", {bounds: box, candidates: [{id: "A", box: {...box, width: 2}}]}],
    line: ["線分", {start, end}], rectangle: ["矩形", {start, end: p(4, 3)}],
    circle: ["中心と通過点から円", {center, point}], arc: ["3点を通る円弧", {start: p(3, 0), through: p(0, 3), end: p(-3, 0)}],
    polygon: ["多角形", {points: square}], path: ["パス", {points, mode: "cubic"}],
    spline: ["点を通るスプライン", {points}], quadraticBezier: ["2次ベジェ", {points: triangle}],
    cubicBezier: ["3次ベジェ", {points}], nthBezier: ["任意次数のベジェ", {points, degree: 3}],
    polyline: ["折れ線", {points}], vertices: ["頂点番号から作図", {vectors: triangle, indices: [2, 0], method: "line"}],
    text: ["文字", {point, content: "原点の近く"}], dimension: ["寸法", {points: [start, end]}],
    offset: ["図形をオフセット", {shape: {kind: "circle", center, radius: 2}, point: end, amount: 1}],
    trim: ["境界でトリム", {points: [start, end], boundaries: [cross.second], point}],
    extend: ["境界まで延長", {points: [start, end], boundaries: [[p(8, -2), p(8, 2)]]}],
    fillet: ["角丸め", {...legs, radius: 1}], chamfer: ["面取り", {...legs, distance1: 1, distance2: 2}],
    split: ["線を分割", {points: [start, end], point}],
    join: ["端点で結合", {segments: [[start, end], [end, p(6, 3)]]}],
    reflectPoint: ["直線に関する鏡映", {start, end, point}], polylineLength: ["長さ・周長", {points: square, closed: true}],
    signedArea: ["符号付き面積", {points: square}],
  },
  "座標・変換": {
    translationMatrix: ["平行移動", {dx: 3, dy: -2}], rotationMatrix: ["中心のまわりの回転", {angle, center: point}],
    scaleMatrix: ["拡大・縮小", {sx: 2, sy: 3, center: point}], shearMatrix: ["せん断", {kx: 0.5}],
    reflectionMatrix: ["鏡映行列", {start, end}], applyToPoint: ["点を変換", {matrix, point}],
    applyToVector: ["方向を変換", {matrix, vector: point}], transformPoints: ["点列を変換", {matrix, points}],
    composeAffine: ["アフィン変換の合成", {first: matrix, then: {...matrix, e: 0}}],
    invertAffine: ["アフィン逆変換", {matrix}], affineFromTriangles: ["三角形の対応から変換", {source: triangle, target: shifted.slice(0, 3)}],
    barycentricCoordinates: ["点から重心座標", {triangle, point}], fromBarycentric: ["重心座標から点", {triangle, weights: [0.25, 0.5, 0.25]}],
    pointFromPolar: ["極座標から点", {center, radius: 3, angle}], polarCoordinates: ["点から極座標", {center, point}],
    projectPoint: ["射影変換", {matrix: projective, point}], composeProjective: ["射影変換の合成", {first: projective, then: projective}],
    invertProjective: ["射影逆変換", {matrix: projective}], homographyFromQuads: ["4点対応から射影変換", {source: square, target: [start, end, p(4, 3), p(1, 3)]}],
  },
  "交差・円・楕円": {
    segmentContact: ["線分の交差・重なり", cross], segmentDistance: ["線分間の最短距離", {first: [start, end], second: [p(2, 2), p(4, 2)]}],
    lineCircleIntersections: ["直線と円の交点", {start, end, center, radius: 3}],
    circleIntersections: ["2円の交点", circles], commonCircleTangents: ["2円の共通接線", {...circles, second: {center: end, radius: 2}}],
    clipSegmentToBox: ["矩形で線分を切る", {start: p(-2, 1), end: p(6, 3), box}],
    circleFromDiameter: ["直径から円", {start, end}], circumcircle: ["外接円", {triangle}],
    triangleIncircle: ["内接円", {triangle}], triangleOrthocenter: ["垂心", {triangle}],
    perpendicularBisector: ["垂直二等分線", {start, end}], angleBisectors: ["角の二等分線", {vertex: start, first: end, second: p(0, 4)}],
    regularPolygon: ["正多角形", {center, radius: 3, sides: 6}], arcPoint: ["円弧上の点", {arc, t: 0.5}],
    arcLength: ["弧長", sweep], chordLength: ["弦長", sweep], sectorArea: ["扇形の面積", sweep],
    circularSegmentArea: ["弓形の面積", sweep], arcBounds: ["円弧の外接矩形", {arc}],
    ellipsePoint: ["楕円上の点", {ellipse, angle}], ellipseTangent: ["楕円の単位接線", {ellipse, angle}],
    ellipseArea: ["楕円の面積", {ellipse}], ellipseBounds: ["楕円の外接矩形", {ellipse}],
    lineEllipseIntersections: ["直線と楕円の交点", {start, end, ellipse}],
  },
  "輪郭・領域・点群": {
    pointBounds: ["点群の外接矩形", {points}], boxIntersection: ["矩形の共通部分", boxes], boxUnion: ["2矩形を囲む矩形", boxes],
    polygonCentroid: ["面積重心", {points: square}], classifyPointInPolygon: ["点の内外・境界", {points: square, point}],
    convexHull: ["凸包", {points: sites}], polygonCrossings: ["輪郭の自己交差", {points: [square[0], square[2], square[1], square[3]]}],
    isSimplePolygon: ["単純多角形の判定", {points: square}], isConvexPolygon: ["凸性の判定", {points: square}],
    triangulatePolygon: ["凹多角形の三角形分割", {points: [square[0], square[1], square[2], point, square[3]]}],
    intersectConvexPolygons: ["凸多角形の共通部分", {first: square, second: shifted}],
    polygonBoolean: ["領域の和・積・差・排他的論理和", {first: square, second: shifted, operation: "difference"}],
    voronoiCells: ["矩形内のボロノイ領域", {sites: [p(1, 1), p(3, 1), p(2, 3)], box}],
    delaunayTriangles: ["点群のドロネー三角形分割", {points: sites}],
    meanPoint: ["点群の平均", {points}], principalAxes: ["点群の主軸と分散", {points}],
    fitLine: ["直線当てはめ", {points}], fitCircle: ["円当てはめ", {points: square}],
    closestPair: ["最近点対", {points: sites}], minimumEnclosingCircle: ["最小包含円", {points: sites}],
  },
  "折れ線・距離": {
    cumulativeLengths: ["各頂点までの長さ", {points}], pointAtLength: ["距離から位置", {points, length: 3}],
    resamplePolyline: ["等距離に分割", {points, intervals: 5}], slicePolyline: ["距離区間を切り出す", {points, from: 1, to: 7}],
    simplifyPolyline: ["許容差で頂点を削減", {points, tolerance: 1}], dashPolyline: ["破線の描画区間", {points, pattern: [2, 1], phase: 0.25}],
    offsetMiter: ["折れ線の平行線", {points, amount: 1, miterLimit: 4}],
  },
  "ベジェ・Bスプライン": {
    splitBezier: ["ベジェを分割", curves], subBezier: ["部分ベジェ", {points, from: 0.2, to: 0.7}],
    bezierDerivative: ["導関数", curves], bezierTangent: ["単位接線", curves], bezierCurvature: ["符号付き曲率", curves],
    elevateBezier: ["次数上げ", {points}], hermiteToBezier: ["エルミートからベジェ", {start, end, startTangent: p(1, 3), endTangent: p(1, -3)}],
    bezierToHermite: ["ベジェからエルミート", {points}], rationalBezierPoint: ["有理ベジェの評価", {points: [p(1, 0), p(1, 1), p(0, 1)], weights: [1, Math.SQRT1_2, 1], t: 0.5}],
    bezierBounds: ["ベジェの外接矩形", {points}], flattenBezier: ["許容差で折れ線化", {points, tolerance: 0.1}],
    bezierLengthBounds: ["曲線長の上下限", {points, tolerance: 0.01}], arcToCubics: ["円弧を3次ベジェで近似", {arc}],
    clampedKnots: ["両端固定のノット列", {count: 4, degree: 2}], bSplinePoint: ["Bスプラインの評価", spline],
    nurbsPoint: ["NURBSの評価", {...spline, weights: [1, 2, 2, 1]}], insertSplineKnot: ["ノット挿入", spline],
    bSplineDerivative: ["Bスプラインの微分", spline],
  },
};

export const geometryExamples = Object.fromEntries(Object.entries(groups).flatMap(([group, entries]) =>
  Object.entries(entries).map(([name, [label, input]]) => [name, {group, label, input}])));
