// Toolbar popup with the extension's toggles. Open YouTube tabs pick up changes right away.
(() => {
  "use strict";

  const { settings } = globalThis.BetterYT;
  const form = document.getElementById("settings");
  const { enabled, enforce } = form.elements;

  document.documentElement.lang = chrome.i18n.getMessage("lang");
  document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir");
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = chrome.i18n.getMessage(element.dataset.i18n);
  }

  // Enforcement mode builds on opening the custom feed.
  const render = () => {
    enforce.disabled = !enabled.checked;
  };

  form.addEventListener("change", (event) => {
    render();
    settings.save({ [event.target.name]: event.target.checked });
  });

  settings.load().then((values) => {
    enabled.checked = values.enabled;
    enforce.checked = values.enforce;
    render();
  });
})();
