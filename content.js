(() => {
  "use strict";

  const HOME = 'ytd-browse[page-subtype="home"]';
  const CHIP_BAR = "ytd-feed-filter-chip-bar-renderer";
  const CHIP = 'yt-chip-cloud-chip-renderer, [role="tab"], button';
  const LABEL = "your custom feed";
  const WAIT_MS = 20_000;
  const RETRY_MS = 1_000;
  const MAX_CLICKS = 3;

  let visit = null;
  let navigating = false;
  let homeRequested = false;
  let clicking = false;
  let observer = null;
  let poll = null;
  let scheduled = null;

  const isHome = () => location.pathname === "/" || location.pathname === "/feed/recommended";
  const normalize = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();

  function newVisit(watchForReset = false) {
    return { done: false, started: performance.now(), lastClick: -Infinity, clicks: 0, watchForReset };
  }

  function visible(element) {
    return !element.closest('[hidden], [aria-hidden="true"]') &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible";
  }

  function findTab() {
    for (const home of document.querySelectorAll(HOME)) {
      if (!visible(home)) continue;

      for (const chip of home.querySelectorAll(`${CHIP_BAR} :is(${CHIP})`)) {
        const label = chip.getAttribute("aria-label") || chip.textContent;
        if (normalize(label) !== LABEL) continue;

        const target = chip.matches("yt-chip-cloud-chip-renderer")
          ? chip.querySelector('[role="tab"], button') || chip
          : chip;

        if (visible(target) && !target.closest('[disabled], [aria-disabled="true"]')) {
          return target;
        }
      }
    }
    return null;
  }

  function selected(tab) {
    const value = tab.getAttribute("aria-selected");
    if (value !== null) return value === "true";
    return tab.hasAttribute("selected") ||
      tab.closest("yt-chip-cloud-chip-renderer")?.hasAttribute("selected");
  }

  function stopWatching() {
    observer?.disconnect();
    observer = null;
    clearInterval(poll);
    clearTimeout(scheduled);
    poll = null;
    scheduled = null;
  }

  function finishVisit() {
    if (visit) visit.done = true;
    stopWatching();
  }

  function attempt() {
    if (navigating || !visit || visit.done) return;
    if (!isHome()) {
      stopWatching();
      visit = null;
      return;
    }

    const now = performance.now();
    if (now - visit.started >= WAIT_MS) {
      finishVisit();
      return;
    }

    const tab = findTab();
    if (!tab) return;
    if (selected(tab)) {
      // Home/logo navigation can reset this selection after navigation finishes.
      if (!visit.watchForReset) finishVisit();
      return;
    }
    if (now - visit.lastClick < RETRY_MS) return;
    if (visit.clicks >= MAX_CLICKS) {
      finishVisit();
      return;
    }

    // Keep the limit across YouTube navigation events triggered by this click.
    visit.clicks += 1;
    visit.lastClick = now;
    clicking = true;
    try {
      tab.click();
    } finally {
      clicking = false;
    }
    if (selected(tab) && !visit?.watchForReset) finishVisit();
  }

  function scheduleAttempt() {
    if (scheduled !== null) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      attempt();
    }, 50);
  }

  function resume() {
    if (navigating) return;
    if (!isHome()) {
      stopWatching();
      visit = null;
      return;
    }

    visit ??= newVisit();
    if (visit.done) return;
    if (!observer) {
      observer = new MutationObserver(scheduleAttempt);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["hidden", "aria-hidden", "aria-selected", "selected", "disabled", "aria-disabled"],
      });
      // Also catches layout becoming visible without a relevant DOM mutation.
      poll = setInterval(attempt, 250);
    }
    attempt();
  }

  document.addEventListener("yt-navigate-start", () => {
    navigating = true;
    stopWatching();
  });

  document.addEventListener("yt-navigate-finish", () => {
    navigating = false;
    if (homeRequested && !visit) visit = newVisit(true);
    homeRequested = false;
    resume();
  });

  document.addEventListener("yt-page-data-updated", resume);
  window.addEventListener("popstate", resume);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      stopWatching();
      visit = null;
      navigating = false;
    }
    resume();
  });

  document.addEventListener("click", (event) => {
    if (clicking || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    const anchor = event.target.closest("a[href]");
    if (anchor && !anchor.hasAttribute("download") && (!anchor.target || anchor.target === "_self")) {
      const url = new URL(anchor.href, location.href);
      if (url.origin === location.origin && ["/", "/feed/recommended"].includes(url.pathname)) {
        // Home/logo clicks also count when the URL is already the homepage.
        homeRequested = true;
        stopWatching();
        visit = newVisit(true);
        // Same-page refreshes do not always dispatch navigation events.
        if (isHome()) {
          scheduled = setTimeout(() => {
            scheduled = null;
            resume();
          }, 0);
        }
        return;
      }
    }

    // Let an explicit choice win, including while the default tab is loading.
    if (isHome() && event.target.closest(`${HOME} ${CHIP_BAR}`)) finishVisit();
  }, true);

  window.addEventListener("pagehide", stopWatching);
  resume();
})();
