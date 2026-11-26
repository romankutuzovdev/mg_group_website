import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/pricing/share-quote.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { kitQuoteSnapshot, restorationQuoteSnapshot, customsQuoteSnapshot, publicCustomsQuoteSnapshot, formatQuoteText } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("UK quote converts every fee at the captured rate", () => {
  const quote = kitQuoteSnapshot({
    copart: { bid: 100, feesNet: 50, vatFees: 10, vatSale: 20 },
    delivery: { amount: 30 }, transferFee: 7, fxRate: 2, totalUk: 217,
    dismantleUsd: 500, grandUsd: 934,
  }, { title: "UK car" });
  assert.equal(quote.currency, "GBP");
  assert.equal(quote.bid, 100);
  assert.equal(quote.total_usd, 934);
  assert.equal(quote.breakdown.reduce((sum, line) => sum + line.amount, 0), 934);
  assert.equal(quote.breakdown.find((line) => line.label === "VAT на ставку").amount, 40);
  assert.match(quote.summary, /2/);
});

test("USA kit includes company services and transfer fee", () => {
  const quote = kitQuoteSnapshot({
    iaai: { bid: 100, feesNet: 20 }, deliveryUsa: { inlandUsd: 30 },
    dispatchingUsd: 200, transferFee: 12.25, dismantleUsd: 1300, grandUsd: 1662.25,
  }, { title: "US car" });
  assert.equal(quote.total_usd, 1662);
  assert.equal(quote.breakdown.find((line) => line.label === "Комиссия 3,5%").amount, 12.25);
  assert.equal(quote.breakdown.reduce((sum, line) => sum + line.amount, 0), 1662.25);
});

test("restoration includes title, sublot, services, extras, insurance and customs", () => {
  const quote = restorationQuoteSnapshot({
    bid: 8000, auctionFeesUsd: 1000, delivery: { inlandUsd: 500, oceanUsd: 1000, oceanDestination: "klaipeda" },
    titleDocUsd: 20, isSublot: true, sublotUsd: 100, dispatchingUsd: 200,
    docsFeeUsd: 50, transferFee: 380, minskDeliveryUsd: 960, grandUsd: 12210,
  }, { title: "Camry" }, [
    { label: "Страхование", amount: 300, currency: "USD" },
    { label: "Доп. услуга", amount: 100, currency: "USD" },
  ], { ok: true, totalUsd: 1000 });
  assert.equal(quote.total_usd, 13610);
  assert.equal(quote.breakdown.reduce((sum, line) => sum + line.amount, 0), 13610);
  assert.match(quote.summary, /растаможкой/);
});

test("customs keeps BYN components and the displayed USD total", () => {
  const quote = customsQuoteSnapshot({
    ok: true, dutyByn: 5000, feeLines: [{ label: "Утильсбор", byn: 300 }, { label: "ЭПТС", byn: 200 }],
    totalByn: 5500, totalUsd: 2000, rates: { USD_BYN: 2.75 }, benefit50: true,
    ageBandLabel: "3–5 лет", engineCc: 1998,
  }, { title: "Растаможка" }, 12000);
  assert.equal(quote.total_usd, 2000);
  assert.equal(quote.breakdown.reduce((sum, line) => sum + line.amount, 0), 5500);
  assert.ok(quote.breakdown.every((line) => line.currency === "BYN"));
  assert.match(quote.summary, /50%/);
});

test("copy text contains the snapshot breakdown, total and site link", () => {
  const text = formatQuoteText({
    kind: "usa", title: "Toyota Camry", bid: 8000, currency: "USD", total_usd: 12500,
    summary: "Без растаможки", location: "Houston",
    breakdown: [{ label: "Сборы и доставка", amount: 4500, currency: "USD" }],
  }, "https://mg-group.by/quote/?id=test");
  for (const expected of ["MG.GROUP", "Toyota Camry", "Houston", "Сборы и доставка", "4", "Итого", "12", "Без растаможки", "https://mg-group.by/quote/?id=test"])
    assert.ok(text.includes(expected), expected);
  assert.match(text, /ориентировочн/i);
});

test("invalid or incomplete results do not produce shareable quotes", () => {
  assert.equal(kitQuoteSnapshot({ totalUk: 100, fxRate: null, grandUsd: null }, { title: "UK" }), null);
  assert.equal(restorationQuoteSnapshot({ delivery: null }, { title: "US" }), null);
  assert.equal(customsQuoteSnapshot({ ok: false }, { title: "Customs" }, 100), null);
});

test("archived lot photos survive snapshot creation", () => {
  const snapshot = kitQuoteSnapshot({
    iaai: { bid: 100, feesNet: 20 }, dispatchingUsd: 200, transferFee: 12,
    dismantleUsd: 1300, grandUsd: 1632,
  }, { title: "Camry", image_url: "/api/lot-photos/copart-123/01-car.jpg" });
  assert.equal(snapshot.image_url, "/api/lot-photos/copart-123/01-car.jpg");
});

test("public customs snapshot preserves EUR purchase and full under-key total", () => {
  const quote = publicCustomsQuoteSnapshot({
    ok: true, totalUsd: 20500, clearanceByn: 12000, totalEur: 19000,
    summary: "Физлицо · 3–5 лет", lines: [
      { key: "car", label: "Авто", amount: 15000, currency: "EUR" },
      { key: "fees", label: "Платежи", amount: 12000, currency: "BYN" },
    ],
  }, 15000);
  assert.equal(quote.bid, 15000);
  assert.equal(quote.currency, "EUR");
  assert.equal(quote.total_usd, 20500);
  assert.deepEqual(quote.breakdown, [
    { label: "Авто", amount: 15000, currency: "EUR" },
    { label: "Платежи", amount: 12000, currency: "BYN" },
  ]);
});
