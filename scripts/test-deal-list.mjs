import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/cabinet/deal-list.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { prepareDealGroups, paymentStagesForDeal, formatPurchaseDate, dealLocation } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const groups = [
  { name: "Иван", deals: [
    { id: 1, status: "completed", car_status: "delivered", purchase_date: "2025-06-01" },
    { id: 2, status: "active", car_status: "in_transit", purchase_date: null },
    { id: 3, status: "active", car_status: "purchased", purchase_date: "2025-08-14" },
  ] },
  { name: "Анна", deals: [{ id: 4, status: "cancelled", car_status: "", purchase_date: "2025-01-01" }] },
  { name: "Пустой", deals: [] },
];

test("status filter narrows the cars and drops clients with no matching cars", () => {
  assert.deepEqual(prepareDealGroups(groups, "active", "default").map((g) => g.deals.map((d) => d.id)), [[2, 3]]);
  assert.deepEqual(prepareDealGroups(groups, "car:in_transit", "default").map((g) => g.deals.map((d) => d.id)), [[2]]);
  assert.deepEqual(prepareDealGroups(groups, "car:", "default").map((g) => g.deals.map((d) => d.id)), [[4]]);
});
test("deal status order is active, completed, cancelled and does not mutate loaded data", () => {
  assert.deepEqual(prepareDealGroups(groups, "all", "status").map((g) => g.deals.map((d) => d.id)), [[2, 3, 1], [4], []]);
  assert.deepEqual(groups[0].deals.map((d) => d.id), [1, 2, 3]);
});
test("delivery order follows the vehicle route, with unset statuses last", () => {
  assert.deepEqual(prepareDealGroups(groups, "all", "delivery")[0].deals.map((d) => d.id), [3, 2, 1]);
});
test("purchase date sorting always places missing dates last", () => {
  assert.deepEqual(prepareDealGroups(groups, "all", "purchase_desc").map((g) => g.deals.map((d) => d.id)), [[3, 1, 2], [4], []]);
  assert.deepEqual(prepareDealGroups(groups, "all", "purchase_asc").map((g) => g.deals.map((d) => d.id)), [[4], [1, 3, 2], []]);
});
test("default list keeps clients without cars and their existing order", () => {
  assert.deepEqual(prepareDealGroups(groups, "all", "default"), groups);
});
test("both payment stages show their own paid or overdue state", () => {
  const result = paymentStagesForDeal({ payment_stage1_paid: true, payment_stage1_at: "2025-08-10", payment_stage2_due: "2025-08-14" }, "2025-08-15");
  assert.deepEqual(result.map((stage) => [stage.stage, stage.status, stage.date]), [[1, "paid", "2025-08-10"], [2, "overdue", "2025-08-14"]]);
});
test("an unpaid payment due today is pending, while a paid stage is never overdue", () => {
  const result = paymentStagesForDeal({ payment_stage1_due: "2025-08-15", payment_stage2_paid: true, payment_stage2_due: "2025-01-01" }, "2025-08-15");
  assert.deepEqual(result.map((stage) => stage.status), ["pending", "paid"]);
});
test("payment timestamps use the Minsk calendar date", () => {
  const result = paymentStagesForDeal({ payment_stage1_paid: true, payment_stage1_at: "2025-08-14T22:15:00Z" }, "2025-08-15");
  assert.equal(result[0].date, "2025-08-15");
});
test("purchase dates format without a timezone shift and unknown dates remain blank", () => {
  assert.equal(formatPurchaseDate("2025-08-14"), "14.08.2025");
  assert.equal(formatPurchaseDate(null), "Не указана");
});

const stage = (key, status = "active") => ({ key, status, label: key, note: "", updated_at: null });

test("location follows the current route stage and ignores the general deal status", () => {
  for (const status of ["active", "completed", "cancelled"]) {
    assert.deepEqual(dealLocation({ kind: "kit", status, stages: [stage("auction")] }), { key: "auction", label: "На аукционе" });
    assert.deepEqual(dealLocation({ kind: "kit", status, stages: [stage("origin")] }), { key: "dismantle", label: "На разборке" });
  }
});
test("origin means dismantling for a kit and port for a whole car", () => {
  assert.equal(dealLocation({ kind: "kit", car_status: "purchased", stages: [stage("origin")] }).key, "dismantle");
  assert.equal(dealLocation({ kind: "car", stages: [stage("origin")] }).key, "port");
});
test("kit transport to Belarus differs from arriving in Belarus", () => {
  assert.deepEqual(dealLocation({ kind: "kit", stages: [stage("belarus")] }), { key: "transit", label: "В пути в Беларусь" });
  assert.deepEqual(dealLocation({ kind: "kit", stages: [stage("belarus", "done")] }), { key: "belarus", label: "В Беларуси" });
  assert.equal(dealLocation({ kind: "car", stages: [stage("belarus")] }).key, "belarus");
});
test("hidden kit stages are ignored and manual location is the fallback", () => {
  assert.equal(dealLocation({ kind: "kit", car_status: "customs", stages: [stage("ocean")] }).key, "customs");
  assert.equal(dealLocation({ kind: "car", car_status: "in_transit", stages: [] }).key, "transit");
  assert.equal(dealLocation({ kind: "car", stages: [] }).key, "unknown");
  assert.equal(dealLocation({ kind: "car", stages: [stage("delivery", "done")] }).key, "delivered");
});
test("location filter finds auction and dismantling cars with the same deal status", () => {
  const clients = [{ deals: [
    { id: 10, kind: "kit", status: "active", stages: [stage("auction")] },
    { id: 11, kind: "kit", status: "active", stages: [stage("origin")] },
  ] }];
  assert.deepEqual(prepareDealGroups(clients, "location:dismantle", "default")[0].deals.map((deal) => deal.id), [11]);
  assert.deepEqual(prepareDealGroups(clients, "all", "delivery")[0].deals.map((deal) => deal.id), [10, 11]);
});
