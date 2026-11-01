import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { fakeChrome, runScripts } from "./helpers.js";

const VENDOR_URL = "chrome-extension://better-yt/src/vendor/transformers/";

// Stands in for Transformers.js: replays download events while the pipeline loads.
function fakeLibrary(events = []) {
  const calls = { pipeline: [], extractor: [] };
  const env = { backends: { onnx: { wasm: {} } } };
  const extractor = async (texts, options) => {
    // The options come from the script's realm, so they are copied for deep comparisons.
    calls.extractor.push({ texts, options: { ...options } });
    return { tolist: () => texts.map(() => [1, 0]) };
  };
  const pipeline = async (task, model, options) => {
    calls.pipeline.push({ task, model, options });
    for (const event of events) options.progress_callback(event);
    return extractor;
  };
  return { library: { env, pipeline }, env, calls };
}

async function load(library) {
  const context = vm.createContext({ chrome: fakeChrome() });
  runScripts(context, ["src/model.js"]);
  const urls = [];
  const progress = [];
  const embed = await context.BetterYT.model.load({
    onProgress: (fraction) => progress.push(fraction),
    importLibrary: async (url) => {
      urls.push(url);
      return library;
    },
  });
  return { embed, urls, progress };
}

test("runs the pinned model from the extension's own files, off the main thread", async () => {
  const { library, env, calls } = fakeLibrary();
  const { urls } = await load(library);

  assert.deepEqual(urls, [`${VENDOR_URL}transformers.min.js`]);
  assert.equal(env.allowLocalModels, false);
  assert.deepEqual(env.backends.onnx.wasm, { wasmPaths: VENDOR_URL, proxy: true, numThreads: 1 });
  const [{ task, model, options }] = calls.pipeline;
  assert.equal(task, "feature-extraction");
  assert.equal(model, "hotchpotch/bekko-embedding-v1-a8m");
  assert.equal(options.revision, "c721113d59a1d91b447450324f51c4b3332c924a");
  assert.equal(options.dtype, "fp32");
  assert.equal(options.device, "wasm");
});

test("embeds texts as mean-pooled, normalized vectors", async () => {
  const { library, calls } = fakeLibrary();
  const { embed } = await load(library);

  assert.deepEqual(await embed(["a", "b"]), [[1, 0], [1, 0]]);
  assert.deepEqual(calls.extractor, [{ texts: ["a", "b"], options: { pooling: "mean", normalize: true } }]);
});

// Builds a Transformers.js 4.3.1 "progress_total" event, whose total covers every file up front.
const progressTotal = (loaded, total) => ({ status: "progress_total", name: "m", progress: (loaded / total) * 100, loaded, total, files: {} });

test("reports the overall download fraction, rising through the large model file", async () => {
  const { library } = fakeLibrary([
    { status: "initiate", name: "m", file: "config.json" },
    progressTotal(1, 1000),
    { status: "progress", name: "m", file: "config.json", progress: 100, loaded: 1, total: 1 },
    { status: "done", name: "m", file: "config.json" },
    // The model's own loader also reports a total over its files only, which must not count.
    progressTotal(400, 800),
    progressTotal(400, 1000),
    { status: "progress", name: "m", file: "model.onnx", progress: 50, loaded: 399, total: 799 },
    progressTotal(1000, 1000),
    { status: "done", name: "m", file: "model.onnx" },
    { status: "ready", task: "feature-extraction", model: "m" },
  ]);
  const { progress } = await load(library);

  assert.deepEqual(progress, [0.001, 0.4, 1]);
});

test("never reports the download going backwards", async () => {
  const { library } = fakeLibrary([progressTotal(60, 100), progressTotal(30, 100), progressTotal(90, 100)]);
  const { progress } = await load(library);

  assert.deepEqual(progress, [0.6, 0.9]);
});
