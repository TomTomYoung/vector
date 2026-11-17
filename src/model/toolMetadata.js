// Standard implementations; update with doc/algorithms.md when changing an algorithm.
export const toolMetadata = Object.freeze({
  "select": {
    "label": "標準",
    "algorithm": "単体IDの選択・反転。範囲選択は候補の軸平行境界箱が選択矩形に完全包含されるかを判定",
    "source": "src/model/drawing.js"
  },
  "line": {
    "label": "標準",
    "algorithm": "始終点。直交時は水平・垂直の大きい変位側へ拘束",
    "source": "src/model/drawing.js"
  },
  "rectangle": {
    "label": "標準",
    "algorithm": "2点の成分ごとの最小値と差の絶対値",
    "source": "src/model/drawing.js"
  },
  "circle": {
    "label": "標準",
    "algorithm": "中心と明示半径、または中心から入力点までのユークリッド距離で円を構成",
    "source": "src/model/drawing.js"
  },
  "arc": {
    "label": "標準",
    "algorithm": "3点の外心を行列式で求め、中間点を通る符号付き回転角を選ぶ",
    "source": "src/model/drawing.js"
  },
  "polygon": {
    "label": "標準",
    "algorithm": "入力頂点を順に保持",
    "source": "src/model/drawing.js"
  },
  "path": {
    "label": "標準",
    "algorithm": "直線モードは線分列。曲線モードは制御点2個と終点の3個ずつを三次区間にする",
    "source": "src/model/drawing.js"
  },
  "spline": {
    "label": "標準",
    "algorithm": "隣接する通過点から接線と三次ベジェ制御点を構成。Cardinal / Catmull–Rom系の倍率調整版",
    "source": "src/model/drawing.js"
  },
  "quadraticBezier": {
    "label": "標準",
    "algorithm": "3制御点を検証・保持。通常の描画経路ではサンプリングしない",
    "source": "src/model/drawing.js"
  },
  "cubicBezier": {
    "label": "標準",
    "algorithm": "4制御点を検証・保持。通常の描画経路ではサンプリングしない",
    "source": "src/model/drawing.js"
  },
  "nthBezier": {
    "label": "標準",
    "algorithm": "制御点を保持し、描画時に de Casteljau 法でパラメータを等分して評価",
    "source": "src/model/drawing.js"
  },
  "polyline": {
    "label": "標準",
    "algorithm": "入力点列を保持",
    "source": "src/model/drawing.js"
  },
  "vertices": {
    "label": "標準",
    "algorithm": "共有座標配列から番号順に点を取り出し、指定された線分・折れ線・多角形・ベジェ関数へ渡す",
    "source": "src/model/drawing.js"
  },
  "text": {
    "label": "標準",
    "algorithm": "位置と文字列を保持し、空白だけの入力を除く",
    "source": "src/model/drawing.js"
  },
  "dimension": {
    "label": "標準",
    "algorithm": "線形は距離・中点・atan2。角度は2方向の偏角差を一周内に正規化",
    "source": "src/model/drawing.js"
  },
  "offset": {
    "label": "標準",
    "algorithm": "円は半径、矩形は各辺の位置を変更。線分・折れ線は各辺の単位法線で点をずらす",
    "source": "src/model/construction.js"
  },
  "trim": {
    "label": "標準",
    "algorithm": "指定位置の直前・直後にある線分交点を点列上で探し、その間の区間を除く",
    "source": "src/model/linear.js"
  },
  "extend": {
    "label": "標準",
    "algorithm": "端点から前方の境界線分への交点を列挙し、最初の交点を選ぶ",
    "source": "src/model/linear.js"
  },
  "fillet": {
    "label": "標準",
    "algorithm": "2直線の交点、半角の三角関数、指定半径から接点と中心を求める",
    "source": "src/model/construction.js"
  },
  "chamfer": {
    "label": "標準",
    "algorithm": "2直線の交点から各辺方向へ指定距離だけ進んだ2点を求める",
    "source": "src/model/construction.js"
  },
  "split": {
    "label": "標準",
    "algorithm": "点を各辺へ射影して最近位置を選び、その位置で点列を前後に分ける",
    "source": "src/model/linear.js"
  },
  "join": {
    "label": "標準",
    "algorithm": "点列の端点同士を許容距離で照合し、必要に応じ反転して連結",
    "source": "src/model/linear.js"
  },
  "reflectPoint": {
    "label": "標準",
    "algorithm": "直線への直交射影を介した鏡映",
    "source": "src/model/construction.js"
  },
  "polylineLength": {
    "label": "標準",
    "algorithm": "隣接点間のユークリッド距離の総和",
    "source": "src/model/measurements.js"
  },
  "signedArea": {
    "label": "標準",
    "algorithm": "基準頂点からの符号付き三角形面積の和。靴紐公式と同値",
    "source": "src/model/measurements.js"
  },
  "translationMatrix": {
    "label": "標準",
    "algorithm": "2次元アフィン変換の6係数を構成",
    "source": "src/model/affine.js"
  },
  "rotationMatrix": {
    "label": "標準",
    "algorithm": "2次元アフィン変換の6係数を構成",
    "source": "src/model/affine.js"
  },
  "scaleMatrix": {
    "label": "標準",
    "algorithm": "2次元アフィン変換の6係数を構成",
    "source": "src/model/affine.js"
  },
  "shearMatrix": {
    "label": "標準",
    "algorithm": "2次元アフィン変換の6係数を構成",
    "source": "src/model/affine.js"
  },
  "reflectionMatrix": {
    "label": "標準",
    "algorithm": "2次元アフィン変換の6係数を構成",
    "source": "src/model/affine.js"
  },
  "applyToPoint": {
    "label": "標準",
    "algorithm": "行列と座標の積。ベクトルには平行移動を適用しない",
    "source": "src/model/affine.js"
  },
  "applyToVector": {
    "label": "標準",
    "algorithm": "行列と座標の積。ベクトルには平行移動を適用しない",
    "source": "src/model/affine.js"
  },
  "transformPoints": {
    "label": "標準",
    "algorithm": "行列と座標の積。ベクトルには平行移動を適用しない",
    "source": "src/model/affine.js"
  },
  "composeAffine": {
    "label": "標準",
    "algorithm": "行列積・行列式による逆行列・3点対応による変換",
    "source": "src/model/affine.js"
  },
  "invertAffine": {
    "label": "標準",
    "algorithm": "行列積・行列式による逆行列・3点対応による変換",
    "source": "src/model/affine.js"
  },
  "affineFromTriangles": {
    "label": "標準",
    "algorithm": "行列積・行列式による逆行列・3点対応による変換",
    "source": "src/model/affine.js"
  },
  "barycentricCoordinates": {
    "label": "標準",
    "algorithm": "三角形の基底を解く重心座標と、その線形結合",
    "source": "src/model/affine.js"
  },
  "fromBarycentric": {
    "label": "標準",
    "algorithm": "三角形の基底を解く重心座標と、その線形結合",
    "source": "src/model/affine.js"
  },
  "pointFromPolar": {
    "label": "標準",
    "algorithm": "三角関数、長さ、atan2 による極座標変換",
    "source": "src/model/affine.js"
  },
  "polarCoordinates": {
    "label": "標準",
    "algorithm": "三角関数、長さ、atan2 による極座標変換",
    "source": "src/model/affine.js"
  },
  "projectPoint": {
    "label": "標準",
    "algorithm": "同次座標の3×3行列、行列積、余因子による逆行列、射影後の除算",
    "source": "src/model/projective.js"
  },
  "composeProjective": {
    "label": "標準",
    "algorithm": "同次座標の3×3行列、行列積、余因子による逆行列、射影後の除算",
    "source": "src/model/projective.js"
  },
  "invertProjective": {
    "label": "標準",
    "algorithm": "同次座標の3×3行列、行列積、余因子による逆行列、射影後の除算",
    "source": "src/model/projective.js"
  },
  "homographyFromQuads": {
    "label": "標準",
    "algorithm": "4点目の重心座標から各四角形の射影フレームを作り、H = B A⁻¹ で対応づける",
    "source": "src/model/projective.js"
  },
  "segmentContact": {
    "label": "標準",
    "algorithm": "外積で線分のパラメータを解き、共線時は区間の重なりを求める。離れていれば端点から相手線分への射影距離の最小値",
    "source": "src/model/intersections.js"
  },
  "segmentDistance": {
    "label": "標準",
    "algorithm": "外積で線分のパラメータを解き、共線時は区間の重なりを求める。離れていれば端点から相手線分への射影距離の最小値",
    "source": "src/model/intersections.js"
  },
  "lineCircleIntersections": {
    "label": "標準",
    "algorithm": "直線方向への射影と平方根、中心間距離を用いた交点、共通接線の単位法線",
    "source": "src/model/intersections.js"
  },
  "circleIntersections": {
    "label": "標準",
    "algorithm": "直線方向への射影と平方根、中心間距離を用いた交点、共通接線の単位法線",
    "source": "src/model/intersections.js"
  },
  "commonCircleTangents": {
    "label": "標準",
    "algorithm": "直線方向への射影と平方根、中心間距離を用いた交点、共通接線の単位法線",
    "source": "src/model/intersections.js"
  },
  "clipSegmentToBox": {
    "label": "標準",
    "algorithm": "x・yそれぞれのスラブ内に入るパラメータ区間と [0,1] の共通部分。パラメトリックな区間クリッピング",
    "source": "src/model/intersections.js"
  },
  "circleFromDiameter": {
    "label": "標準",
    "algorithm": "中点・距離、外心、辺長で重みづけした内心、外心を用いた垂心の公式",
    "source": "src/model/conics.js"
  },
  "circumcircle": {
    "label": "標準",
    "algorithm": "中点・距離、外心、辺長で重みづけした内心、外心を用いた垂心の公式",
    "source": "src/model/conics.js"
  },
  "triangleIncircle": {
    "label": "標準",
    "algorithm": "中点・距離、外心、辺長で重みづけした内心、外心を用いた垂心の公式",
    "source": "src/model/conics.js"
  },
  "triangleOrthocenter": {
    "label": "標準",
    "algorithm": "中点・距離、外心、辺長で重みづけした内心、外心を用いた垂心の公式",
    "source": "src/model/conics.js"
  },
  "perpendicularBisector": {
    "label": "標準",
    "algorithm": "中点と直交ベクトル、単位方向ベクトルの和と差",
    "source": "src/model/conics.js"
  },
  "angleBisectors": {
    "label": "標準",
    "algorithm": "中点と直交ベクトル、単位方向ベクトルの和と差",
    "source": "src/model/conics.js"
  },
  "arcPoint": {
    "label": "標準",
    "algorithm": "円の三角関数表示と面積公式。境界箱には円弧内の軸方向の極値も含める",
    "source": "src/model/conics.js"
  },
  "arcLength": {
    "label": "標準",
    "algorithm": "円の三角関数表示と面積公式。境界箱には円弧内の軸方向の極値も含める",
    "source": "src/model/conics.js"
  },
  "chordLength": {
    "label": "標準",
    "algorithm": "円の三角関数表示と面積公式。境界箱には円弧内の軸方向の極値も含める",
    "source": "src/model/conics.js"
  },
  "sectorArea": {
    "label": "標準",
    "algorithm": "円の三角関数表示と面積公式。境界箱には円弧内の軸方向の極値も含める",
    "source": "src/model/conics.js"
  },
  "circularSegmentArea": {
    "label": "標準",
    "algorithm": "円の三角関数表示と面積公式。境界箱には円弧内の軸方向の極値も含める",
    "source": "src/model/conics.js"
  },
  "arcBounds": {
    "label": "標準",
    "algorithm": "円の三角関数表示と面積公式。境界箱には円弧内の軸方向の極値も含める",
    "source": "src/model/conics.js"
  },
  "ellipsePoint": {
    "label": "標準",
    "algorithm": "回転した楕円の媒介変数表示・微分・極値。直線との交点は楕円座標系で二次方程式に帰着",
    "source": "src/model/conics.js"
  },
  "ellipseTangent": {
    "label": "標準",
    "algorithm": "回転した楕円の媒介変数表示・微分・極値。直線との交点は楕円座標系で二次方程式に帰着",
    "source": "src/model/conics.js"
  },
  "ellipseArea": {
    "label": "標準",
    "algorithm": "回転した楕円の媒介変数表示・微分・極値。直線との交点は楕円座標系で二次方程式に帰着",
    "source": "src/model/conics.js"
  },
  "ellipseBounds": {
    "label": "標準",
    "algorithm": "回転した楕円の媒介変数表示・微分・極値。直線との交点は楕円座標系で二次方程式に帰着",
    "source": "src/model/conics.js"
  },
  "lineEllipseIntersections": {
    "label": "標準",
    "algorithm": "回転した楕円の媒介変数表示・微分・極値。直線との交点は楕円座標系で二次方程式に帰着",
    "source": "src/model/conics.js"
  },
  "regularPolygon": {
    "label": "標準",
    "algorithm": "中心から等角度ごとの円周点を列挙",
    "source": "src/model/conics.js"
  },
  "pointBounds": {
    "label": "標準",
    "algorithm": "成分ごとの最小・最大、区間の共通部分・包含箱",
    "source": "src/model/polygons.js"
  },
  "boxIntersection": {
    "label": "標準",
    "algorithm": "成分ごとの最小・最大、区間の共通部分・包含箱",
    "source": "src/model/polygons.js"
  },
  "boxUnion": {
    "label": "標準",
    "algorithm": "成分ごとの最小・最大、区間の共通部分・包含箱",
    "source": "src/model/polygons.js"
  },
  "polygonCentroid": {
    "label": "標準",
    "algorithm": "符号付き三角形面積による重心の加重平均",
    "source": "src/model/polygons.js"
  },
  "classifyPointInPolygon": {
    "label": "標準",
    "algorithm": "境界判定後、水平線を横切る辺の向きを加算する winding number。evenOdd / nonzero の意味は",
    "source": "src/model/polygons.js"
  },
  "convexHull": {
    "label": "標準",
    "algorithm": "辞書順ソートと上下の鎖を構築する Andrew の monotone chain",
    "source": "src/model/polygons.js"
  },
  "polygonCrossings": {
    "label": "標準",
    "algorithm": "辺の全組み合わせの交差、符号付き面積、連続する辺の向きを検査。交差列挙は走査線法ではない",
    "source": "src/model/polygons.js"
  },
  "isSimplePolygon": {
    "label": "標準",
    "algorithm": "辺の全組み合わせの交差、符号付き面積、連続する辺の向きを検査。交差列挙は走査線法ではない",
    "source": "src/model/polygons.js"
  },
  "isConvexPolygon": {
    "label": "標準",
    "algorithm": "辺の全組み合わせの交差、符号付き面積、連続する辺の向きを検査。交差列挙は走査線法ではない",
    "source": "src/model/polygons.js"
  },
  "triangulatePolygon": {
    "label": "標準",
    "algorithm": "内部に他頂点のない凸の耳を除く ear clipping（耳切り法）。共線頂点を除去する場合がある",
    "source": "src/model/polygons.js"
  },
  "intersectConvexPolygons": {
    "label": "標準",
    "algorithm": "clipCell で各辺の内側半平面を順次適用する Sutherland–Hodgman型クリッピング",
    "source": "src/model/polygons.js"
  },
  "polygonBoolean": {
    "label": "標準",
    "algorithm": "単純多角形を耳切りで三角形に分け、凸セルの半平面クリッピングで積・差・和・対称差を構成,",
    "source": "src/model/regions.js"
  },
  "voronoiCells": {
    "label": "標準",
    "algorithm": "各点について全ての他点との垂直二等分線の近い側を選び、指定箱を順次クリップ。半平面交差による Voronoi セル",
    "source": "src/model/regions.js"
  },
  "delaunayTriangles": {
    "label": "標準",
    "algorithm": "凸包の扇形分割に残りの点を挿入し、外接円判定による Lawson型の edge flipping（辺反転）",
    "source": "src/model/mesh.js"
  },
  "regionBoundary": {
    "label": "標準",
    "algorithm": "頂点を許容距離で統合、辺上の頂点で分割、逆向き共有辺を相殺、残る辺を角度順に接続して閉路・穴・包含関係を復元",
    "source": "src/model/regionBoundary.js"
  },
  "constrainedDelaunay": {
    "label": "標準",
    "algorithm": "初期Delaunay分割、制約辺を横切る三角形帯の除去と両側の耳切り再分割、制約辺を固定した辺反転、穴・外部の flood fill,,",
    "source": "src/model/constrainedMesh.js"
  },
  "cumulativeLengths": {
    "label": "標準",
    "algorithm": "各辺の長さの累積和",
    "source": "src/model/polyline.js"
  },
  "pointAtLength": {
    "label": "標準",
    "algorithm": "累積長の二分探索と辺内の線形補間。再標本化は折れ線上の等距離",
    "source": "src/model/polyline.js"
  },
  "resamplePolyline": {
    "label": "標準",
    "algorithm": "累積長の二分探索と辺内の線形補間。再標本化は折れ線上の等距離",
    "source": "src/model/polyline.js"
  },
  "slicePolyline": {
    "label": "標準",
    "algorithm": "累積長の二分探索と辺内の線形補間。再標本化は折れ線上の等距離",
    "source": "src/model/polyline.js"
  },
  "simplifyPolyline": {
    "label": "標準",
    "algorithm": "両端を結ぶ線分から最も遠い点で区間を分ける Ramer–Douglas–Peucker系。再帰の代わりにスタックを使う",
    "source": "src/model/polyline.js"
  },
  "dashPolyline": {
    "label": "標準",
    "algorithm": "距離パターンと位相に従って点列を切り出す。SVGの stroke-dasharray を設定する関数ではない",
    "source": "src/model/polyline.js"
  },
  "offsetMiter": {
    "label": "標準",
    "algorithm": "隣接辺の左単位法線の和からmiter交点を構成。長さ比が miterLimit を超えれば null",
    "source": "src/model/polyline.js"
  },
  "splitBezier": {
    "label": "標準",
    "algorithm": "de Casteljau の補間三角形から左右の制御点を取り出す。部分曲線は分割を組み合わせる",
    "source": "src/model/curveAnalysis.js"
  },
  "subBezier": {
    "label": "標準",
    "algorithm": "de Casteljau の補間三角形から左右の制御点を取り出す。部分曲線は分割を組み合わせる",
    "source": "src/model/curveAnalysis.js"
  },
  "bezierDerivative": {
    "label": "標準",
    "algorithm": "制御点の差分から導関数を作って評価し、単位接線・符号付き曲率を算出",
    "source": "src/model/curveAnalysis.js"
  },
  "bezierTangent": {
    "label": "標準",
    "algorithm": "制御点の差分から導関数を作って評価し、単位接線・符号付き曲率を算出",
    "source": "src/model/curveAnalysis.js"
  },
  "bezierCurvature": {
    "label": "標準",
    "algorithm": "制御点の差分から導関数を作って評価し、単位接線・符号付き曲率を算出",
    "source": "src/model/curveAnalysis.js"
  },
  "elevateBezier": {
    "label": "標準",
    "algorithm": "隣接制御点の次数に応じた加重平均による1段階の次数上昇",
    "source": "src/model/curveAnalysis.js"
  },
  "hermiteToBezier": {
    "label": "標準",
    "algorithm": "三次Hermiteの端点微分とベジェ制御点の相互変換。接線係数は1/3・3",
    "source": "src/model/curveAnalysis.js"
  },
  "bezierToHermite": {
    "label": "標準",
    "algorithm": "三次Hermiteの端点微分とベジェ制御点の相互変換。接線係数は1/3・3",
    "source": "src/model/curveAnalysis.js"
  },
  "rationalBezierPoint": {
    "label": "標準",
    "algorithm": "(wx, wy, w) の同次座標で de Casteljau 法を行い、最後に w で除算",
    "source": "src/model/curveAnalysis.js"
  },
  "bezierBounds": {
    "label": "標準",
    "algorithm": "0〜3次について各座標の導関数の根と両端を評価する境界箱",
    "source": "src/model/curveAnalysis.js"
  },
  "flattenBezier": {
    "label": "標準",
    "algorithm": "制御点から弦の線分までの距離を調べ、必要なら t=0.5 で適応分割",
    "source": "src/model/curveAnalysis.js"
  },
  "bezierLengthBounds": {
    "label": "標準",
    "algorithm": "弦長を下限、制御多角形長を上限として、差が小さくなるまで適応分割",
    "source": "src/model/curveAnalysis.js"
  },
  "arcToCubics": {
    "label": "標準",
    "algorithm": "円弧を90度以下に分け、接線方向へ k = (4/3) tan(Δθ/4) 倍の半径を伸ばして三次ベジェ近似",
    "source": "src/model/curveAnalysis.js"
  },
  "bezierIntersections": {
    "label": "標準",
    "algorithm": "制御点の境界箱・射影による除外、de Casteljau再分割、Newton補正。直線の場合はBernstein形式の根探索",
    "source": "src/model/bezierIntersections.js"
  },
  "clampedKnots": {
    "label": "標準",
    "algorithm": "両端を固定する一様ノット列の構成",
    "source": "src/model/splines.js"
  },
  "bSplinePoint": {
    "label": "標準",
    "algorithm": "対象ノット区間の局所制御点を段階的に補間する de Boor 法",
    "source": "src/model/splines.js"
  },
  "nurbsPoint": {
    "label": "標準",
    "algorithm": "同次座標上で de Boor 法を適用して重みで除算",
    "source": "src/model/splines.js"
  },
  "insertSplineKnot": {
    "label": "標準",
    "algorithm": "曲線形状を保つ単一ノット挿入（Boehm系）。有理曲線は重みつきで補間",
    "source": "src/model/splines.js"
  },
  "bSplineDerivative": {
    "label": "標準",
    "algorithm": "ノット間隔で割った制御点差分を作り、次数を1下げて de Boor 法で評価",
    "source": "src/model/splines.js"
  },
  "meanPoint": {
    "label": "標準",
    "algorithm": "最初の点を基準に差分を平均して戻す算術平均",
    "source": "src/model/pointSets.js"
  },
  "principalAxes": {
    "label": "標準",
    "algorithm": "2×2共分散行列の固有値・固有方向を解析式で求めるPCA（主成分分析）",
    "source": "src/model/pointSets.js"
  },
  "fitLine": {
    "label": "標準",
    "algorithm": "平均点を通り、最大主成分の方向を持つ直線。直交距離に対する最小二乗（TLS）",
    "source": "src/model/pointSets.js"
  },
  "fitCircle": {
    "label": "標準",
    "algorithm": "中心化した座標で代数的最小二乗を解く Kåsa型円当てはめ",
    "source": "src/model/pointSets.js"
  },
  "closestPair": {
    "label": "標準",
    "algorithm": "全点対の距離を比較する総当たり。分割統治による最近点対法ではない",
    "source": "src/model/pointSets.js"
  },
  "minimumEnclosingCircle": {
    "label": "標準",
    "algorithm": "入力順の逐次追加。円外の点が現れると1点・2点・3点を支点とする円を三重ループで更新",
    "source": "src/model/pointSets.js"
  },
  "solveConstraints": {
    "label": "標準",
    "algorithm": "Levenberg–Marquardt系の減衰付き最小二乗・解析的Jacobian・部分ピボット付きGauss消去",
    "source": "src/model/constraints.js"
  },
  "bSplineCurve": {
    "label": "de Boor / B-spline",
    "algorithm": "制御点・次数・ノットを検証。不連続ノットに対応し、周期指定時は先頭制御点と一様／非一様ノットを周期延長（継ぎ目を含む重複度は次数まで）",
    "source": "src/model/splineCurves.js"
  },
  "nurbsCurve": {
    "label": "de Boor / NURBS",
    "algorithm": "零・負を含む有限な重みとノットを検証。周期指定時は制御点・重みと一様／非一様ノットを循環（継ぎ目を含む重複度は次数まで）。描画時に同次座標の分母を検査",
    "source": "src/model/splineCurves.js"
  }
});
