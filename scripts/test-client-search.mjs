import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/cabinet/client-search.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { filterClientGroups, dealMatchesSearch, findSearchMatch } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const groups = [
  {
    key: "1", name: "Иван Петров", sub: "+375291234567", managerName: "Ольга",
    deals: [
      { id: 1, title: "Toyota Camry", vin: "4T1B11HK5KU123456", lot_number: "45792427" },
      { id: 2, title: "BMW X5", vin: "5UXCR6C03L9A98765", lot_number: "82103654" },
    ],
  },
  { key: "2", name: "Анна", sub: "@anna", managerName: "Андрей", deals: [] },
];

test("empty search keeps every client and car", () => {
  assert.deepEqual(filterClientGroups(groups, "   "), groups);
});

test("client, contact and manager searches keep all cars of the matching client", () => {
  for (const query of ["ПЕТРОВ", "291234567", "ольга"]) {
    assert.deepEqual(filterClientGroups(groups, query), [groups[0]]);
  }
  assert.deepEqual(filterClientGroups(groups, "@anna"), [groups[1]]);
});

test("a partial VIN finds its client and only the matching car", () => {
  const result = filterClientGroups(groups, "hk5ku123");
  assert.equal(result.length, 1);
  assert.equal(result[0].key, "1");
  assert.deepEqual(result[0].deals.map((deal) => deal.id), [1]);
});

test("a VIN pasted with spaces and lowercase letters still finds the car", () => {
  const result = filterClientGroups(groups, " 4t1 b11hk5 ku123456 ");
  assert.deepEqual(result.map((group) => group.deals.map((deal) => deal.id)), [[1]]);
});

test("lot numbers support a hash prefix, spaces and partial numbers", () => {
  for (const query of ["#45792427", "45 792 427", "7924"]) {
    const result = filterClientGroups(groups, query);
    assert.deepEqual(result.map((group) => group.deals.map((deal) => deal.id)), [[1]]);
  }
});

test("car name search narrows the cars without mutating the loaded client list", () => {
  const result = filterClientGroups(groups, "bmw");
  assert.deepEqual(result[0].deals.map((deal) => deal.id), [2]);
  assert.equal(groups[0].deals.length, 2);
});

test("missing identifiers and punctuation alone do not match every car", () => {
  const empty = [{ name: "Клиент", sub: "", managerName: "", deals: [{ title: "Авто" }] }];
  for (const query of ["#", "---", "несуществующий", "UNKNOWNVIN"]) {
    assert.deepEqual(filterClientGroups(groups, query), []);
    assert.deepEqual(filterClientGroups(empty, query), []);
  }
});

test("only the found car is marked as a match, not every car of its client", () => {
  assert.equal(dealMatchesSearch(groups[0].deals[0], "#45792427"), true);
  assert.equal(dealMatchesSearch(groups[0].deals[1], "#45792427"), false);
  assert.equal(dealMatchesSearch(groups[0].deals[0], "Петров"), false);
  assert.equal(dealMatchesSearch(groups[0].deals[0], " "), false);
});

test("highlight locates the matching VIN characters despite spaces in the query", () => {
  assert.deepEqual(findSearchMatch("4T1B11HK5KU123456", "hk5 ku123", true), { start: 6, end: 14 });
  assert.deepEqual(findSearchMatch("#45792427", "#7924", true), { start: 3, end: 7 });
  assert.deepEqual(findSearchMatch("Toyota Camry", "CAMRY"), { start: 7, end: 12 });
  assert.equal(findSearchMatch("Toyota Camry", "BMW"), null);
  assert.equal(findSearchMatch("45792427", "#", true), null);
});
