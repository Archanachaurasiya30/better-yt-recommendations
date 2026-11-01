import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { runScripts } from "./helpers.js";

function loadTopics() {
  const dom = new JSDOM("", { runScripts: "outside-only" });
  runScripts(dom.getInternalVMContext(), ["src/topics.js"]);
  const { topics } = dom.window.BetterYT;
  dom.window.close();
  // Arrays from the page's realm don't deepEqual arrays from this one.
  return { ...topics, parse: (text) => [...topics.parse(text)] };
}

const topics = loadTopics();

test("splits topics on commas, semicolons and new lines in several scripts", () => {
  assert.deepEqual(
    topics.parse("programming, chess;cooking\nmusic，编程、 科学،طبخ"),
    ["programming", "chess", "cooking", "music", "编程", "科学", "طبخ"],
  );
});

test("trims topics, collapses inner spaces and drops empty ones", () => {
  assert.deepEqual(topics.parse("  software    engineering ,, ;\n  "), ["software engineering"]);
});

test("keeps the first spelling of topics that differ only in case", () => {
  assert.deepEqual(topics.parse("Chess, chess, CHESS, Go"), ["Chess", "Go"]);
});

test("limits the number and length of topics", () => {
  const many = Array.from({ length: 25 }, (_, index) => `topic ${index}`).join(",");
  assert.equal(topics.parse(many).length, topics.MAX_TOPICS);
  // The cut lands on the space, which is trimmed away.
  const long = "a".repeat(topics.MAX_TOPIC_LENGTH - 1);
  assert.deepEqual(topics.parse(`${long} b`), [long]);
});

test("returns no topics for empty input", () => {
  for (const text of ["", "  ", undefined, null]) assert.deepEqual(topics.parse(text), []);
});
