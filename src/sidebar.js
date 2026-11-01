// Finds, reads and marks the recommended videos next to the one being watched.
// All of YouTube's markup lives in the selectors below, so a redesign is a one-line change.
(() => {
  "use strict";

  // The recommendations list. YouTube moves it under the video in narrow windows, so it isn't looked up by column.
  const CONTAINER = "ytd-watch-flexy ytd-watch-next-secondary-results-renderer";
  // Current layout first, then the older one.
  const ITEM = "yt-lockup-view-model, ytd-compact-video-renderer";
  // Sponsored slots and shelves can hold lockups too, but aren't recommendations.
  const EXCLUDED = "ytd-ad-slot-renderer, ytd-reel-shelf-renderer, ytd-horizontal-card-list-renderer";
  const ID_HOST = "div.ytLockupViewModelHost";
  const ID_CLASS_PREFIX = "content-id-";
  const WATCH_LINK = 'a[href*="/watch?v="]';
  const TITLE_ATTRIBUTE_HOLDER = "h3[title]";
  // In order of preference: current, older BEM and legacy markup.
  const TITLE_TEXT = ["a.ytLockupMetadataViewModelTitle", ".yt-lockup-metadata-view-model__title", "#video-title"];
  const CHANNEL_TEXT = [
    ".ytContentMetadataViewModelMetadataText",
    ".yt-content-metadata-view-model__metadata-text",
    "ytd-channel-name #text",
  ];
  const OFF_TOPIC_ATTRIBUTE = "data-better-yt-off-topic";
  const MAX_TITLE_LENGTH = 200;
  const MAX_CHANNEL_LENGTH = 100;

  const clean = (text, maxLength) => (text ?? "").replaceAll(/\s+/gu, " ").trim().slice(0, maxLength).trim();

  function container(root = document) {
    return root.querySelector(CONTAINER);
  }

  function findItems(root = document) {
    const results = container(root);
    if (!results) return [];
    return [...results.querySelectorAll(`:is(${ITEM})`)].filter((item) => !item.closest(EXCLUDED));
  }

  function firstMatch(item, selectors) {
    for (const selector of selectors) {
      const element = item.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function readId(item) {
    const host = item.querySelector(ID_HOST);
    const idClass = host && [...host.classList].find((name) => name.startsWith(ID_CLASS_PREFIX));
    if (idClass) return idClass.slice(ID_CLASS_PREFIX.length);
    const link = item.querySelector(WATCH_LINK);
    return link ? new URL(link.href, location.href).searchParams.get("v") : null;
  }

  function readTitle(item) {
    const title = item.querySelector(TITLE_ATTRIBUTE_HOLDER)?.getAttribute("title");
    return clean(title || firstMatch(item, TITLE_TEXT)?.textContent, MAX_TITLE_LENGTH);
  }

  // Returns the video an item shows, or null when the item isn't a readable video.
  function readVideo(item) {
    const id = readId(item);
    const title = readTitle(item);
    if (!id || !title) return null;
    const channel = clean(firstMatch(item, CHANNEL_TEXT)?.textContent, MAX_CHANNEL_LENGTH);
    return { id, title, channel };
  }

  // The id tells a marked item apart from the same element recycled for another video.
  function markOffTopic(item, id) {
    item.setAttribute(OFF_TOPIC_ATTRIBUTE, id);
  }

  function unmark(item) {
    item.removeAttribute(OFF_TOPIC_ATTRIBUTE);
  }

  // Returns the id of the video an item was hidden for, or null when it isn't hidden.
  function markedId(item) {
    return item.getAttribute(OFF_TOPIC_ATTRIBUTE);
  }

  function unmarkAll(root = document) {
    for (const item of root.querySelectorAll(`[${OFF_TOPIC_ATTRIBUTE}]`)) unmark(item);
  }

  globalThis.BetterYT ??= {};
  globalThis.BetterYT.sidebar = Object.freeze({
    container,
    findItems,
    readVideo,
    markOffTopic,
    unmark,
    markedId,
    unmarkAll,
  });
})();
