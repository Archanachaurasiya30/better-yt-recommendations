import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { runScripts } from "./helpers.js";

// A unit vector whose similarity to the "x" topic is score.
const near = (score) => [score, Math.sqrt(1 - score * score)];
const X = [1, 0];
const Y = [0, 1];

// Embeds texts from a fixed table and records every batch it was asked for.
function fakeEmbed(table) {
  const batches = [];
  const embed = async (texts) => {
    batches.push([...texts]);
    return texts.map((text) => table[text] ?? Y);
  };
  return { embed, batches };
}

function createMatcher(options) {
  const context = vm.createContext({});
  runScripts(context, ["src/matcher.js"]);
  return context.BetterYT.matcher.createMatcher(options);
}

const video = (id, channel = "") => ({ id, title: id, channel });
// Results come from another realm, so they are copied before deep comparisons.
const plain = (value) => ({ ...value });

test("matches videos whose similarity to a topic reaches the threshold", async () => {
  const { embed } = fakeEmbed({ x: X, above: near(0.3), at: near(0.25), below: near(0.2) });
  const matcher = createMatcher({ embed });
  const matches = await matcher.match(["x"], [video("above"), video("at"), video("below")]);
  assert.deepEqual(plain(matches), { above: true, at: true, below: false });
});

test("keeps a video that matches any one of the topics", async () => {
  const { embed } = fakeEmbed({ x: X, y: Y, chess: Y, cooking: [-1, 0] });
  const matcher = createMatcher({ embed });
  const matches = await matcher.match(["x", "y"], [video("chess"), video("cooking")]);
  assert.deepEqual(plain(matches), { chess: true, cooking: false });
});

test("compares the title with the channel, or the title alone without one", async () => {
  const { embed, batches } = fakeEmbed({ x: X, "Lecture | MIT": X });
  const matcher = createMatcher({ embed });
  const matches = await matcher.match(["x"], [
    { id: "a", title: "Lecture", channel: "MIT" },
    { id: "b", title: "Lecture", channel: "" },
  ]);
  assert.deepEqual(plain(matches), { a: true, b: false });
  assert.deepEqual(batches, [["x"], ["Lecture | MIT", "Lecture"]]);
});

test("keeps every video without embedding anything when there are no topics", async () => {
  const { embed, batches } = fakeEmbed({});
  const matcher = createMatcher({ embed });
  const matches = await matcher.match([], [video("a"), video("b")]);
  assert.deepEqual(plain(matches), { a: true, b: true });
  assert.deepEqual(batches, []);
});

test("embeds each video text once across requests and topic changes, and each new topic list once", async () => {
  const { embed, batches } = fakeEmbed({ x: X, y: Y, a: X });
  const matcher = createMatcher({ embed });
  await matcher.match(["x"], [video("a"), video("b")]);
  await matcher.match(["x"], [video("a"), video("b"), video("c")]);
  const matches = await matcher.match(["y"], [video("a"), video("c")]);
  assert.deepEqual(plain(matches), { a: false, c: true });
  assert.deepEqual(batches, [["x"], ["a", "b"], ["c"], ["y"]]);
});

test("embeds repeated texts once and in batches of the configured size", async () => {
  const { embed, batches } = fakeEmbed({ x: X });
  const matcher = createMatcher({ embed, batchSize: 2 });
  const videos = ["a", "b", "a", "c", "d", "e"].map((id) => video(id));
  await matcher.match(["x"], videos);
  assert.deepEqual(batches, [["x"], ["a", "b"], ["c", "d"], ["e"]]);
});

test("forgets the least recently used videos beyond the cache size", async () => {
  const { embed, batches } = fakeEmbed({ x: X, a: X });
  const matcher = createMatcher({ embed, cacheSize: 2 });
  await matcher.match(["x"], [video("a"), video("b")]);
  await matcher.match(["x"], [video("a")]);
  await matcher.match(["x"], [video("c")]);
  const matches = await matcher.match(["x"], [video("a"), video("b")]);
  assert.deepEqual(plain(matches), { a: true, b: false });
  assert.deepEqual(batches.slice(1), [["a", "b"], ["c"], ["b"]]);
});

test("answers a request with more videos than the cache holds", async () => {
  const { embed } = fakeEmbed({ x: X, a: X, c: X });
  const matcher = createMatcher({ embed, cacheSize: 1 });
  const matches = await matcher.match(["x"], [video("a"), video("b"), video("c")]);
  assert.deepEqual(plain(matches), { a: true, b: false, c: true });
});
