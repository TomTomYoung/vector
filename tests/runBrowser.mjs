import {spawn} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";

// Wait on the real completion signal. A virtual-time budget can expire while a
// module Worker is still loading, before the test page has produced its report.
const profile = await mkdtemp(join(tmpdir(), "vector-chrome-"));
const chrome = spawn(process.env.CHROME_BIN ?? "google-chrome", [
  "--headless", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
  "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe", "--user-data-dir=" + profile,
], {stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"]});
const pending = new Map(), errors = [];
let sequence = 0, buffer = "", stderr = "", exitError;
chrome.stderr.on("data", chunk => {stderr = (stderr + chunk).slice(-10000);});
const exited = new Promise(resolve => chrome.once("close", resolve));
function fail(error) {
  exitError = error;
  for (const {reject} of pending.values()) reject(error);
  pending.clear();
}
chrome.on("error", fail);
chrome.stdio[3].on("error", fail);
chrome.on("exit", (code, signal) => fail(new Error(`Chrome exited (${code ?? signal})`)));
chrome.stdio[4].on("data", chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\0")) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id && pending.has(message.id)) {
      const {resolve, reject} = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      errors.push(details.exception?.description ?? details.text);
    }
  }
});
async function send(method, params = {}, sessionId) {
  if (exitError) throw exitError;
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {pending.delete(id); reject(new Error("CDP timed out: " + method));}, 15000);
    pending.set(id, {resolve: value => {clearTimeout(timeout); resolve(value);}, reject: error => {clearTimeout(timeout); reject(error);}});
    chrome.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + "\0");
  });
}
try {
  const {targetId} = await send("Target.createTarget", {url: "about:blank"});
  const {sessionId} = await send("Target.attachToTarget", {targetId, flatten: true});
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", {url: process.env.VECTOR_TEST_URL ?? "http://127.0.0.1:8765/tests/editor.html"}, sessionId);
  const deadline = Date.now() + 60000;
  let result;
  do {
    const response = await send("Runtime.evaluate", {expression: `(() => {
      const result = document.querySelector('#result');
      return {status: result?.dataset.status, report: result?.textContent};
    })()`, returnByValue: true}, sessionId);
    result = response.result.value;
    if (result?.status === "passed" || result?.status === "failed") break;
    await delay(100);
  } while (Date.now() < deadline && !errors.length);
  console.log(result?.report ?? "The test page did not report a result.");
  if (errors.length) throw new Error(errors.join("\n"));
  if (result?.status !== "passed") throw new Error("Browser test status: " + (result?.status ?? "missing"));
} catch (error) {
  console.error(error.stack);
  if (exitError) console.error(stderr);
  process.exitCode = 1;
} finally {
  if (!exitError) await send("Browser.close").catch(() => {});
  const killTimer = setTimeout(() => chrome.kill("SIGKILL"), 3000);
  await exited;
  clearTimeout(killTimer);
  await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
