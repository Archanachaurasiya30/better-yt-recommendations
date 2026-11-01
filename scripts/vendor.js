// Copies the browser build of Transformers.js and the ONNX Runtime files it loads into
// src/vendor/transformers, so the extension runs without a build step or remote code.
// Run after changing the @huggingface/transformers version: pnpm vendor
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const VENDOR_DIRECTORY = join(root, "src/vendor/transformers");

// Finds an installed package's folder, which its exports may not expose directly.
function packageDirectory(from, name) {
  let directory = dirname(createRequire(join(from, "package.json")).resolve(name));
  while (!isPackage(directory, name)) directory = dirname(directory);
  return directory;
}

function isPackage(directory, name) {
  const manifest = join(directory, "package.json");
  return existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === name;
}

// Each vendored file, by the package it comes from.
export function vendoredFiles() {
  const transformers = packageDirectory(root, "@huggingface/transformers");
  const onnx = packageDirectory(transformers, "onnxruntime-web");
  return [
    { source: join(transformers, "dist/transformers.min.js"), name: "transformers.min.js" },
    { source: join(transformers, "LICENSE"), name: "LICENSE-transformers" },
    { source: join(onnx, "dist/ort-wasm-simd-threaded.asyncify.mjs"), name: "ort-wasm-simd-threaded.asyncify.mjs" },
    { source: join(onnx, "dist/ort-wasm-simd-threaded.asyncify.wasm"), name: "ort-wasm-simd-threaded.asyncify.wasm" },
  ];
}

// The onnxruntime-web package declares the MIT license without shipping its text.
const ONNX_LICENSE = `ONNX Runtime Web (onnxruntime-web)

MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(VENDOR_DIRECTORY, { recursive: true, force: true });
  mkdirSync(VENDOR_DIRECTORY, { recursive: true });
  for (const { source, name } of vendoredFiles()) copyFileSync(source, join(VENDOR_DIRECTORY, name));
  writeFileSync(join(VENDOR_DIRECTORY, "LICENSE-onnxruntime"), ONNX_LICENSE);
  console.log(`Vendored Transformers.js into ${VENDOR_DIRECTORY}`);
}
