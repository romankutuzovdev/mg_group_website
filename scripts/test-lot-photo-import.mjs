import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/cabinet/import-lot-photos.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { importLotPhotos } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("imports all distinct photos and retries transient failures", async () => {
  const calls = new Map();
  const progress = [];
  const result = await importLotPhotos(
    17,
    ["https://img.test/1.jpg", "https://img.test/2.jpg", "https://img.test/1.jpg"],
    async (_dealId, url) => {
      const count = (calls.get(url) || 0) + 1;
      calls.set(url, count);
      if (url.endsWith("1.jpg") && count === 1) throw new Error("temporary upstream error");
    },
    (index, saved) => progress.push([index, saved]),
    { retryDelayMs: 0 },
  );

  assert.deepEqual(result.failedIndices, []);
  assert.equal(result.total, 2);
  assert.equal(calls.get("https://img.test/1.jpg"), 2);
  assert.equal(calls.get("https://img.test/2.jpg"), 1);
  assert.deepEqual(progress.sort((a, b) => a[0] - b[0]), [[0, true], [1, true]]);
});

test("reports every photo that still cannot be saved after retries", async () => {
  let attempts = 0;
  const result = await importLotPhotos(
    18,
    ["https://img.test/unavailable.jpg"],
    async () => { attempts += 1; throw new Error("upstream is unavailable"); },
    () => {},
    { retries: 2, retryDelayMs: 0 },
  );

  assert.equal(attempts, 3);
  assert.deepEqual(result.failedIndices, [0]);
});
