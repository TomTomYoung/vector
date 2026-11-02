import {geometryExamples} from "./geometryExamples.js";

const el = id => document.getElementById(id);
const select = el("tool"), input = el("input"), output = el("output"), status = el("status");
const groups = new Map();
for (const [name, {group, label}] of Object.entries(geometryExamples)) {
  if (!groups.has(group)) {
    const category = document.createElement("optgroup");
    category.label = group;
    select.append(category);
    groups.set(group, category);
  }
  groups.get(group).append(new Option(label + " · " + name, name));
}

let worker;
function stop() {
  worker?.terminate();
  worker = undefined;
  el("stop").disabled = true;
}
function reset() {
  stop();
  input.value = JSON.stringify(geometryExamples[select.value].input, null, 2);
  output.textContent = "";
  status.textContent = "";
}
function finish(message, value = "") {
  stop();
  output.textContent = value;
  status.textContent = message;
}
function execute() {
  stop();
  output.textContent = "";
  let data;
  try { data = JSON.parse(input.value); }
  catch (error) { finish("入力 JSON を読めません。 " + error.message); return; }
  try {
    const current = new Worker(new URL("./geometryWorker.js", import.meta.url), {type: "module"});
    worker = current;
    current.onmessage = ({data}) => {
      if (worker !== current) return;
      if (data.error) finish("入力を確認してください。 " + data.error);
      else finish("完了", JSON.stringify(data.value, null, 2));
    };
    current.onerror = event => { if (worker === current) finish("演算を実行できません。 " + event.message); };
    status.textContent = "計算中…";
    el("stop").disabled = false;
    current.postMessage({name: select.value, input: data});
  } catch (error) { finish("演算を開始できません。 " + error.message); }
}
select.onchange = reset;
el("reset").onclick = reset;
el("run").onclick = execute;
el("stop").onclick = () => finish("中止しました。");
select.value = "segmentContact";
reset();
