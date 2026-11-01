// Loads the multilingual embedding model with the vendored Transformers.js, entirely from the extension.
(() => {
  "use strict";

  const MODEL = Object.freeze({
    id: "hotchpotch/bekko-embedding-v1-a8m",
    // A fixed revision, so a change upstream can't alter the model under users' feet.
    revision: "c721113d59a1d91b447450324f51c4b3332c924a",
    dtype: "fp32",
  });
  const VENDOR_DIRECTORY = "src/vendor/transformers/";
  const LIBRARY_PATH = `${VENDOR_DIRECTORY}transformers.min.js`;

  const importModule = (url) => import(url);

  // Extension pages may only run their own code, so the WASM runtime must never come from a CDN.
  function configure(env) {
    env.allowLocalModels = false;
    const { wasm } = env.backends.onnx;
    wasm.wasmPaths = chrome.runtime.getURL(VENDOR_DIRECTORY);
    // Inference runs in ONNX Runtime's web worker, which keeps the document responsive.
    wasm.proxy = true;
    wasm.numThreads = 1;
  }

  // Reports the library's overall download fraction, which counts every file from the start, so
  // a small file finishing first cannot read as 100%. The model's own loader also sends a
  // "progress_total" for its files only; the largest total seen is the pipeline-wide one.
  function createProgressTracker(onProgress) {
    let largestTotal = 0;
    let reported = 0;

    return ({ status, loaded, total }) => {
      const isOverall = status === "progress_total" && total > 0 && total >= largestTotal;
      if (!isOverall) return;
      largestTotal = total;
      const fraction = Math.min(loaded / total, 1);
      if (fraction <= reported) return;
      reported = fraction;
      onProgress(fraction);
    };
  }

  // Resolves to embed(texts), which returns one L2-normalized vector per text.
  async function load({ onProgress, importLibrary = importModule }) {
    const { env, pipeline } = await importLibrary(chrome.runtime.getURL(LIBRARY_PATH));
    configure(env);
    const extractor = await pipeline("feature-extraction", MODEL.id, {
      revision: MODEL.revision,
      dtype: MODEL.dtype,
      device: "wasm",
      progress_callback: createProgressTracker(onProgress),
    });
    return async (texts) => (await extractor(texts, { pooling: "mean", normalize: true })).tolist();
  }

  globalThis.BetterYT ??= {};
  globalThis.BetterYT.model = Object.freeze({ load });
})();
