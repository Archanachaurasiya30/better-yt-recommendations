import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { fakeChrome, flush, read, readJson } from "./helpers.js";

const html = read("src/popup.html");
const scripts = ["src/settings.js", "src/popup.js"].map((path) => read(path));
const localeDirectory = new URL("../_locales/", import.meta.url);
const locales = readdirSync(localeDirectory);
const alphabetically = (a, b) => a.localeCompare(b);

async function setup(t, options) {
  const { window } = new JSDOM(html, { runScripts: "outside-only" });
  const chrome = fakeChrome(options);
  window.chrome = chrome;
  for (const script of scripts) window.eval(script);
  await flush();
  t.after(() => window.close());

  const { document } = window;
  const toggle = (name) => document.querySelector(`input[name="${name}"]`);
  return { document, chrome, toggle };
}

test("shows the stored settings", async (t) => {
  const { toggle } = await setup(t, { stored: { enabled: true, enforce: true } });
  assert.equal(toggle("enabled").checked, true);
  assert.equal(toggle("enforce").checked, true);
  assert.equal(toggle("enforce").disabled, false);
});

test("defaults to opening the custom feed without enforcement", async (t) => {
  const { toggle } = await setup(t);
  assert.equal(toggle("enabled").checked, true);
  assert.equal(toggle("enforce").checked, false);
});

test("saves each toggle as it changes", async (t) => {
  const { chrome, toggle } = await setup(t);
  toggle("enforce").click();
  await flush();
  assert.equal(chrome.data.enforce, true);
  toggle("enabled").click();
  await flush();
  assert.equal(chrome.data.enabled, false);
});

test("enforcement mode can only be changed while the custom feed opens automatically", async (t) => {
  const { toggle } = await setup(t, { stored: { enabled: false } });
  assert.equal(toggle("enforce").disabled, true);
  toggle("enabled").click();
  assert.equal(toggle("enforce").disabled, false);
});

test("uses the browser's language and direction", async (t) => {
  const { document } = await setup(t, { locale: "ar" });
  const messages = readJson("_locales/ar/messages.json");
  assert.equal(document.documentElement.lang, "ar");
  assert.equal(document.documentElement.dir, "rtl");
  assert.equal(document.querySelector("#enforce-title").textContent, messages.enforce.message);
});

test("every translation fills every popup text", async (t) => {
  for (const locale of locales) {
    const { document } = await setup(t, { locale });
    for (const element of document.querySelectorAll("[data-i18n]")) {
      assert.notEqual(element.textContent.trim(), "", `${locale}: ${element.dataset.i18n}`);
    }
  }
});

test("translations cover the ten most spoken languages with the same messages as English", () => {
  assert.deepEqual(locales.toSorted(alphabetically), ["ar", "bn", "en", "es", "fr", "hi", "id", "pt", "ru", "zh_CN", "zh_TW"]);
  const keys = Object.keys(readJson("_locales/en/messages.json")).toSorted(alphabetically);
  for (const locale of locales) {
    const messages = readJson(`_locales/${locale}/messages.json`);
    assert.deepEqual(Object.keys(messages).toSorted(alphabetically), keys, locale);
    assert.equal(messages.lang.message.replace("-", "_"), locale, locale);
  }
});

test("the manifest's messages exist in the default locale", () => {
  const manifest = readJson("manifest.json");
  const messages = readJson(`_locales/${manifest.default_locale}/messages.json`);
  for (const [, key] of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) {
    assert.ok(messages[key], key);
  }
});
