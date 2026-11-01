import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { read, runScripts } from "./helpers.js";

const fixture = read("test/fixtures/watch-sidebar.html");

function load(t, markup = fixture) {
  const dom = new JSDOM(markup, {
    url: "https://www.youtube.com/watch?v=W6NZfCO5SIk",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  runScripts(dom.getInternalVMContext(), ["src/sidebar.js"]);
  return { document: dom.window.document, sidebar: dom.window.BetterYT.sidebar };
}

// Copies the page's objects into this realm, so deepEqual compares only their values.
const readAll = (sidebar) => structuredClone(sidebar.findItems().map((item) => sidebar.readVideo(item)));

// The sidebar wrapper YouTube puts around recommendation items.
const watchPage = (items) => `<ytd-watch-flexy><div id="secondary">
  <ytd-watch-next-secondary-results-renderer>${items}</ytd-watch-next-secondary-results-renderer>
</div></ytd-watch-flexy>`;

test("reads every recommendation in the real sidebar markup", (t) => {
  const { sidebar } = load(t);
  assert.deepEqual(readAll(sidebar), [
    {
      id: "PFmuCDHHpwk",
      title: "Object-oriented Programming in JavaScript: Made Super Simple | Mosh",
      channel: "Programming with Mosh",
    },
    { id: "PkZNo7MFNFg", title: "Learn JavaScript - Full Course for Beginners", channel: "freeCodeCamp.org" },
    {
      id: "RphIVv0uWrM",
      title: "Лучший бесплатный ИИ для работы и жизни | DeepSeek на практике | Вайб кодинг, документы, авито",
      channel: "Академия нейросетей Сергея Нагорного GORA ACADEMY",
    },
    {
      id: "C4dGVTl6ry8",
      title: "Positive Energy 2027 🌴 Deep House Mix & Tropical Vibes Playlist for Uplifting Mood",
      channel: "Positive Chill Mood",
    },
  ]);
});

test("finds only recommendations inside the watch page sidebar", (t) => {
  const lockup = (id) => `<yt-lockup-view-model><a href="/watch?v=${id}" id="video-title">Video ${id}</a></yt-lockup-view-model>`;
  const related = lockup("related0001") + `<ytd-ad-slot-renderer>${lockup("sponsored01")}</ytd-ad-slot-renderer>`;
  const { document, sidebar } = load(t, `<div id="primary">${lockup("primary0001")}</div>${watchPage(related)}`);
  assert.deepEqual(readAll(sidebar).map((video) => video.id), ["related0001"]);
  assert.equal(sidebar.container(), document.querySelector("ytd-watch-next-secondary-results-renderer"));
});

test("finds recommendations that a narrow window moves under the video", (t) => {
  const { document, sidebar } = load(t);
  document.querySelector("#primary").append(document.querySelector("#related"));
  assert.equal(sidebar.findItems().length, 4);
});

test("finds nothing on pages without the sidebar", (t) => {
  const { sidebar } = load(t, "<ytd-browse></ytd-browse>");
  assert.equal(sidebar.findItems().length, 0);
  assert.equal(sidebar.container(), null);
});

test("reads the older compact video layout", (t) => {
  const { sidebar } = load(t, watchPage(`<ytd-compact-video-renderer>
    <a id="thumbnail" href="/watch?v=legacy00001&amp;t=10s"></a>
    <span id="video-title">  Legacy
      title  </span>
    <ytd-channel-name><div id="text">Old channel</div></ytd-channel-name>
  </ytd-compact-video-renderer>`));
  assert.deepEqual(readAll(sidebar), [{ id: "legacy00001", title: "Legacy title", channel: "Old channel" }]);
});

test("caps long titles and channels and allows a missing channel", (t) => {
  const { sidebar } = load(t, watchPage(`
    <yt-lockup-view-model><div class="ytLockupViewModelHost content-id-long0000001">
      <h3 title="${"t".repeat(250)}"></h3>
      <span class="ytContentMetadataViewModelMetadataText">${"c".repeat(150)}</span>
    </div></yt-lockup-view-model>
    <yt-lockup-view-model><div class="ytLockupViewModelHost content-id-nochannel01">
      <a class="ytLockupMetadataViewModelTitle">Untitled heading</a>
    </div></yt-lockup-view-model>`));
  const [long, noChannel] = readAll(sidebar);
  assert.equal(long.title.length, 200);
  assert.equal(long.channel.length, 100);
  assert.deepEqual(noChannel, { id: "nochannel01", title: "Untitled heading", channel: "" });
});

test("skips items without a video id or a title", (t) => {
  const { sidebar } = load(t, watchPage(`
    <yt-lockup-view-model><h3 title="A playlist without a video"></h3></yt-lockup-view-model>
    <yt-lockup-view-model><a href="/watch?v=notitle0001"></a></yt-lockup-view-model>`));
  assert.deepEqual(readAll(sidebar), [null, null]);
});
