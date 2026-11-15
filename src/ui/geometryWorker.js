import {createToolset} from "../model/tools.js";

const run = createToolset();
self.onmessage = ({data: {name, input}}) => {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("入力はオブジェクトで指定します。");
    const result = run(name, input);
    const json = JSON.stringify(result, (_, value) => {
      if (value === undefined || (typeof value === "number" && !Number.isFinite(value)))
        throw Error("座標・数値・必須項目を確認してください。");
      return value;
    }, 2);
    const outcome = result === null ? "invalid" : result?.complete === false ? "incomplete" :
      result?.converged === false ? "unconverged" : "complete";
    self.postMessage({json, outcome});
  }
  catch (error) { self.postMessage({error: error.message}); }
};
