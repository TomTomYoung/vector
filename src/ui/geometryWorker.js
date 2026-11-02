import {createToolset} from "../model/tools.js";

const run = createToolset();
self.onmessage = ({data: {name, input}}) => {
  try { self.postMessage({value: run(name, input)}); }
  catch (error) { self.postMessage({error: error.message}); }
};
