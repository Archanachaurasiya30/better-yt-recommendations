import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { VENDOR_DIRECTORY, vendoredFiles } from "../scripts/vendor.js";

test("the vendored model runtime matches the installed Transformers.js version", () => {
  for (const { source, name } of vendoredFiles()) {
    assert.ok(readFileSync(source).equals(readFileSync(join(VENDOR_DIRECTORY, name))), `${name} is outdated; run pnpm vendor`);
  }
});
