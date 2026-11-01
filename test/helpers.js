import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

export const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
export const readJson = (path) => JSON.parse(read(path));

// Lets pending promises, storage events and mutation observers run.
export const flush = () => new Promise((resolve) => setImmediate(resolve));

// Runs the extension's own script in a blank page, the way the other tests load scripts.
export function loadLabels() {
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  window.eval(read("src/labels.js"));
  const labels = window.BetterYT.CUSTOM_FEED_LABELS;
  window.close();
  return labels;
}

// The parts of the extension APIs the scripts use, backed by memory.
export function fakeChrome({ stored = {}, locale = "en" } = {}) {
  const data = { ...stored };
  const listeners = [];
  const messages = readJson(`_locales/${locale}/messages.json`);

  return {
    data,
    storage: {
      sync: {
        async get(defaults) {
          return { ...defaults, ...data };
        },
        async set(changes) {
          const diff = {};
          for (const [key, newValue] of Object.entries(changes)) {
            diff[key] = { oldValue: data[key], newValue };
            data[key] = newValue;
          }
          // Chrome reports changes after set() resolves.
          queueMicrotask(() => {
            for (const listener of listeners) listener(diff, "sync");
          });
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    },
    i18n: {
      getMessage(key) {
        if (key === "@@bidi_dir") return locale === "ar" ? "rtl" : "ltr";
        return messages[key]?.message ?? "";
      },
    },
  };
}
