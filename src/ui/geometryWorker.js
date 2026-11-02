import {createToolset} from "../model/tools.js";

const run = createToolset();
self.onmessage = ({data: {name, input}}) => {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("入力はオブジェクトで指定します。");
    const json = JSON.stringify(run(name, input), (_, value) => {
      if (value === undefined || (typeof value === "number" && !Number.isFinite(value)))
        throw Error("座標・数値・必須項目を確認してください。");
      return value;
    }, 2);
    self.postMessage({json});
  }
  catch (error) { self.postMessage({error: error.message}); }
};
