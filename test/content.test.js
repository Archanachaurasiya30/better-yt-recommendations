import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import FakeTimers from "@sinonjs/fake-timers";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("../content.js", import.meta.url), "utf8");

// Structure observed on desktop YouTube. No account data is needed by the tests.
function homeMarkup({ selected = false, label = "Your custom feed", legacy = false } = {}) {
  const content = legacy ? label : `
    <chip-shape role="presentation">
      <button role="tab" aria-selected="${selected}">
        <div class="ytChipShapeText">${label}</div>
      </button>
    </chip-shape>`;
  return `<ytd-browse page-subtype="home">
    <ytd-rich-grid-renderer>
      <ytd-feed-filter-chip-bar-renderer>
        <iron-selector role="tablist">
          <yt-chip-cloud-chip-renderer id="custom" ${selected ? "selected" : ""}>
            ${content}
          </yt-chip-cloud-chip-renderer>
          <yt-chip-cloud-chip-renderer>
            <button id="all" role="tab" aria-selected="${!selected}">All</button>
          </yt-chip-cloud-chip-renderer>
        </iron-selector>
      </ytd-feed-filter-chip-bar-renderer>
    </ytd-rich-grid-renderer>
  </ytd-browse>`;
}

function setup(t, { path = "/", markup = homeMarkup(), acceptClick = () => true } = {}) {
  const dom = new JSDOM(`<a id="logo" href="/">YouTube Home</a>${markup}`, {
    url: `https://www.youtube.com${path}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  const clock = FakeTimers.withGlobal(window).install({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
  });

  // jsdom has no layout engine. Supply only the visibility needed by this script.
  window.Element.prototype.getClientRects = function () {
    return this.isConnected && !this.closest('[hidden], [style*="display: none"]') ? [{}] : [];
  };

  const state = { clicks: 0 };
  document.addEventListener("click", (event) => {
    if (event.target.closest("a")) event.preventDefault();
    if (event.target.closest("#all")) {
      document.querySelector("#custom")?.removeAttribute("selected");
      document.querySelector('#custom [role="tab"]')?.setAttribute("aria-selected", "false");
      document.querySelector("#all").setAttribute("aria-selected", "true");
    }
    if (event.target.closest("#custom")) {
      state.clicks += 1;
      if (acceptClick(state.clicks)) {
        document.querySelector("#custom").setAttribute("selected", "");
        document.querySelector('#custom [role="tab"]')?.setAttribute("aria-selected", "true");
        document.querySelector("#all").setAttribute("aria-selected", "false");
      }
    }
  });

  const dispatch = (name) => document.dispatchEvent(new window.Event(name));
  const navigate = (path, markup = homeMarkup()) => {
    dispatch("yt-navigate-start");
    window.history.pushState({}, "", path);
    document.querySelector("ytd-browse")?.remove();
    document.body.insertAdjacentHTML("beforeend", markup);
    dispatch("yt-navigate-finish");
  };

  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    clock.uninstall();
    window.close();
  });

  window.eval(source);
  return { window, document, clock, state, dispatch, navigate };
}

test("selects the custom feed on initial load and stops all timers", (t) => {
  const { state, document, clock } = setup(t);
  assert.equal(state.clicks, 1);
  assert.equal(document.querySelector('#custom [role="tab"]').getAttribute("aria-selected"), "true");
  assert.equal(clock.countTimers(), 0);
});

test("does not click an already selected custom feed", (t) => {
  const { state, clock } = setup(t, { markup: homeMarkup({ selected: true }) });
  clock.tick(30_000);
  assert.equal(state.clicks, 0);
  assert.equal(clock.countTimers(), 0);
});

test("waits for the asynchronously rendered chip bar", async (t) => {
  const { state, document, clock } = setup(t, { markup: "" });
  clock.tick(2_000);
  assert.equal(state.clicks, 0);
  document.body.insertAdjacentHTML("beforeend", homeMarkup());
  await clock.tickAsync(100);
  assert.equal(state.clicks, 1);
  assert.equal(clock.countTimers(), 0);
});

test("waits for a hidden home page to become visible", async (t) => {
  const { state, document, clock } = setup(t, {
    markup: homeMarkup().replace('<ytd-browse page-subtype="home">', '<ytd-browse page-subtype="home" hidden>'),
  });
  assert.equal(state.clicks, 0);
  document.querySelector("ytd-browse").removeAttribute("hidden");
  await clock.tickAsync(100);
  assert.equal(state.clicks, 1);
});

test("ignores a disabled tab until it becomes available", async (t) => {
  const { state, document, clock } = setup(t, {
    markup: homeMarkup().replace('id="custom"', 'id="custom" aria-disabled="true"'),
  });
  assert.equal(state.clicks, 0);
  document.querySelector("#custom").removeAttribute("aria-disabled");
  await clock.tickAsync(100);
  assert.equal(state.clicks, 1);
});

test("retries when the first click arrives before YouTube is ready", (t) => {
  const { state, clock } = setup(t, { acceptClick: (count) => count === 2 });
  assert.equal(state.clicks, 1);
  clock.tick(999);
  assert.equal(state.clicks, 1);
  clock.tick(1);
  assert.equal(state.clicks, 2);
  assert.equal(clock.countTimers(), 0);
});

test("limits retries when clicks never select the tab", (t) => {
  const { state, clock } = setup(t, { acceptClick: () => false });
  clock.tick(30_000);
  assert.equal(state.clicks, 3);
  assert.equal(clock.countTimers(), 0);
});

test("stops waiting when the feature is missing", async (t) => {
  const { state, document, clock, dispatch } = setup(t, { markup: "" });
  clock.tick(20_000);
  assert.equal(clock.countTimers(), 0);
  document.body.insertAdjacentHTML("beforeend", homeMarkup());
  dispatch("yt-page-data-updated");
  await clock.tickAsync(1_000);
  assert.equal(state.clicks, 0);
  assert.equal(clock.countTimers(), 0);
});

for (const path of ["/watch?v=example", "/results?search_query=example", "/feed/subscriptions", "/shorts/example", "/@channel", "/playlist?list=example"]) {
  test(`does not select even a cached home tab while on ${path}`, (t) => {
    const { state, clock } = setup(t, { path });
    clock.tick(30_000);
    assert.equal(state.clicks, 0);
    assert.equal(clock.countTimers(), 0);
  });
}

test("does not select a similarly named button outside the homepage chip bar", (t) => {
  const { state, clock } = setup(t, {
    markup: '<ytd-browse page-subtype="home"><button id="custom">Your custom feed</button></ytd-browse>',
  });
  clock.tick(30_000);
  assert.equal(state.clicks, 0);
});

test("selects the feed when navigating from a video to Home without a reload", (t) => {
  const { state, navigate } = setup(t, { path: "/watch?v=example", markup: "" });
  navigate("/");
  assert.equal(state.clicks, 1);
  navigate("/feed/subscriptions", "");
  assert.equal(state.clicks, 1);
  navigate("/");
  assert.equal(state.clicks, 2);
});

test("manual All selection survives same-URL navigation events and DOM updates", async (t) => {
  const { state, document, clock, dispatch } = setup(t);
  document.querySelector("#all").click();
  dispatch("yt-navigate-start");
  dispatch("yt-navigate-finish");
  dispatch("yt-page-data-updated");
  document.querySelector("ytd-browse").appendChild(document.createElement("div"));
  await clock.tickAsync(5_000);
  assert.equal(state.clicks, 1);
  assert.equal(document.querySelector("#all").getAttribute("aria-selected"), "true");
  assert.equal(clock.countTimers(), 0);
});

test("a manual tab choice cancels an outstanding automatic retry", (t) => {
  const { state, document, clock } = setup(t, { acceptClick: () => false });
  document.querySelector("#all").click();
  clock.tick(30_000);
  assert.equal(state.clicks, 1);
  assert.equal(clock.countTimers(), 0);
});

test("a Home link starts a new visit even when the URL stays the same", (t) => {
  const { state, document, navigate } = setup(t);
  document.querySelector("#all").click();
  document.querySelector("#logo").click();
  navigate("/");
  assert.equal(state.clicks, 2);
});

test("logo navigation restores the custom feed after a delayed reset to All", async (t) => {
  const { state, document, clock, dispatch } = setup(t);
  document.querySelector("#logo").click();
  dispatch("yt-navigate-start");
  // YouTube can announce navigation completion while the old chip is selected.
  dispatch("yt-navigate-finish");
  await clock.tickAsync(4_000);
  document.querySelector("#custom").removeAttribute("selected");
  document.querySelector('#custom [role="tab"]').setAttribute("aria-selected", "false");
  document.querySelector("#all").setAttribute("aria-selected", "true");
  await clock.tickAsync(100);
  assert.equal(state.clicks, 2);
  assert.equal(document.querySelector("#all").getAttribute("aria-selected"), "false");
  await clock.tickAsync(20_000);
  assert.equal(clock.countTimers(), 0);
});

test("a same-page Home click works without YouTube navigation events", async (t) => {
  const { state, document, clock } = setup(t);
  document.querySelector("#logo").click();
  await clock.tickAsync(1_000);
  document.querySelector("ytd-browse").outerHTML = homeMarkup();
  await clock.tickAsync(100);
  assert.equal(state.clicks, 2);
});

test("a second delayed render cannot undo a successful selection after a logo click", async (t) => {
  const { state, document, clock, navigate } = setup(t);
  document.querySelector("#logo").click();
  navigate("/");
  assert.equal(state.clicks, 2);
  await clock.tickAsync(4_000);
  document.querySelector("ytd-browse").outerHTML = homeMarkup();
  await clock.tickAsync(100);
  assert.equal(state.clicks, 3);
  assert.equal(document.querySelector("#all").getAttribute("aria-selected"), "false");
});

test("manual All selection during the Home refresh guard is respected", async (t) => {
  const { state, document, clock, dispatch } = setup(t);
  document.querySelector("#logo").click();
  dispatch("yt-navigate-start");
  dispatch("yt-navigate-finish");
  document.querySelector("#all").click();
  dispatch("yt-page-data-updated");
  await clock.tickAsync(30_000);
  assert.equal(state.clicks, 1);
  assert.equal(document.querySelector("#all").getAttribute("aria-selected"), "true");
  assert.equal(clock.countTimers(), 0);
});

test("the Home refresh guard expires even when the existing custom tab never resets", async (t) => {
  const { state, document, clock, dispatch } = setup(t);
  document.querySelector("#logo").click();
  dispatch("yt-navigate-finish");
  await clock.tickAsync(30_000);
  assert.equal(state.clicks, 1);
  assert.equal(clock.countTimers(), 0);
});

test("opening Home in a new tab does not reset the current visit", (t) => {
  const { window, state, document, dispatch } = setup(t);
  document.querySelector("#all").click();
  document.querySelector("#logo").dispatchEvent(new window.MouseEvent("click", { bubbles: true, ctrlKey: true }));
  dispatch("yt-navigate-finish");
  assert.equal(state.clicks, 1);
});

test("suspends pending retries during navigation away from Home", (t) => {
  const { state, clock, dispatch, window } = setup(t, { acceptClick: () => false });
  dispatch("yt-navigate-start");
  clock.tick(10_000);
  assert.equal(state.clicks, 1);
  assert.equal(clock.countTimers(), 0);
  window.history.pushState({}, "", "/watch?v=example");
  dispatch("yt-navigate-finish");
  assert.equal(clock.countTimers(), 0);
});

test("retries remain bounded across navigation events from the custom-feed click", (t) => {
  const { state, clock, dispatch } = setup(t, { acceptClick: () => false });
  for (let i = 0; i < 10; i += 1) {
    dispatch("yt-navigate-start");
    dispatch("yt-navigate-finish");
    clock.tick(1_000);
  }
  assert.equal(state.clicks, 3);
  assert.equal(clock.countTimers(), 0);
});

test("restoring Home from the back-forward cache starts a fresh visit", (t) => {
  const { state, document, window } = setup(t);
  document.querySelector("#all").click();
  window.dispatchEvent(new window.Event("pagehide"));
  window.dispatchEvent(new window.PageTransitionEvent("pageshow", { persisted: true }));
  assert.equal(state.clicks, 2);
});

test("browser history navigation can return Home after leaving", (t) => {
  const { state, window, dispatch } = setup(t);
  window.history.pushState({}, "", "/watch?v=example");
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  window.history.pushState({}, "", "/");
  dispatch("yt-page-data-updated");
  // The previous custom tab is still selected; there is no need to click it again.
  assert.equal(state.clicks, 1);
});

test("supports whitespace variations and older chip-renderer markup", (t) => {
  const { state } = setup(t, { markup: homeMarkup({ label: "  Your\n custom   feed ", legacy: true }) });
  assert.equal(state.clicks, 1);
});

test("supports homepage query parameters and the recommended-feed route", (t) => {
  const { state, navigate } = setup(t, { path: "/?app=desktop" });
  assert.equal(state.clicks, 1);
  navigate("/watch?v=example", "");
  navigate("/feed/recommended");
  assert.equal(state.clicks, 2);
});

test("the manifest ships only the local script and restricts access to desktop YouTube", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.youtube.com/*", "https://youtube.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js"]);
});
