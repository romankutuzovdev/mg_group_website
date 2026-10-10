"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CabinetUser,
  Deal,
  DealKind,
  OriginRegion,
} from "@/lib/api/cabinet";
import {
  DEAL_KIND_LABELS,
  ORIGIN_REGION_LABELS,
  adminCreateDeal,
  adminSetUserManager,
  adminUpdateDeal,
  dealKind,
  stageKeysForDeal,
  fetchAdminDeals,
  fetchAdminUsers,
  regionLabel,
} from "@/lib/api/cabinet";
import { dealCoverPhotoUrl } from "@/components/cabinet/deal-photos";
import { paymentProgressLabel } from "@/components/cabinet/deal-payment-status";
import { DealClosingStages } from "@/components/cabinet/deal-closing-stages";

type Props = {
  onCreated?: (deal: Deal) => void;
  onOpenDeal?: (id: number) => void;
  /** Только владелец из CABINET_ADMIN_TELEGRAM_IDS назначает менеджеров. */
  canAssignRoles?: boolean;
};

function statusLabel(status: Deal["status"]): string {
  if (status === "completed") return "Завершена";
  if (status === "cancelled") return "Отменена";
  return "В работе";
}

function progress(deal: Deal): { done: number; total: number; current: string } {
  const allowed = new Set(stageKeysForDeal(deal));
  const stages = (deal.stages || []).filter((s) => allowed.has(s.key));
  const done = stages.filter((s) => s.status === "done").length;
  const active = stages.find((s) => s.status === "active");
  return {
    done,
    total: stages.length || 6,
    current: active?.label || (deal.status === "completed" ? "Готово" : "—"),
  };
}

function userLabel(u: CabinetUser): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  const nick = u.username ? `@${u.username}` : "";
  const base = name || nick || `TG ${u.telegram_id}`;
  return nick && name ? `${name} (${nick})` : base;
}

export function AdminDealsPanel({ onCreated, onOpenDeal, canAssignRoles = false }: Props) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<CabinetUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [telegramId, setTelegramId] = useState("");
  const [kind, setKind] = useState<DealKind>("kit");
  const [title, setTitle] = useState("");
  const [vin, setVin] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"USD" | "GBP">("USD");
  const [originRegion, setOriginRegion] = useState<OriginRegion>("usa");
  const [managerUserId, setManagerUserId] = useState("");
  const [due1, setDue1] = useState("");
  const [due2, setDue2] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDeals, nextUsers] = await Promise.all([
        fetchAdminDeals(),
        fetchAdminUsers(),
      ]);
      setDeals(nextDeals);
      setUsers(nextUsers);
      setTelegramId((prev) => {
        if (prev) return prev;
        return nextUsers[0] ? String(nextUsers[0].telegram_id) : "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить сделки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tg = Number(telegramId);
    if (!Number.isFinite(tg) || tg <= 0) {
      setError("Выберите клиента из списка");
      return;
    }
    if (!title.trim()) {
      setError("Укажите название");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const deal = await adminCreateDeal({
        telegram_id: tg,
        title: title.trim(),
        vin: vin.trim(),
        lot_number: lotNumber.trim(),
        note: note.trim(),
        price: price ? Number(price) : 0,
        currency,
        kind,
        origin_region: originRegion,
        status: "active",
        manager_user_id: managerUserId ? Number(managerUserId) : undefined,
        payment_stage1_due: due1,
        payment_stage2_due: due2,
      });
      setOk(
        `${DEAL_KIND_LABELS[dealKind(deal)]} #${deal.id} · ${regionLabel(deal.origin_region)}`,
      );
      setTitle("");
      setVin("");
      setLotNumber("");
      setNote("");
      setPrice("");
      setDue1("");
      setDue2("");
      onCreated?.(deal);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания сделки");
    } finally {
      setBusy(false);
    }
  };

  const managers = users.filter((u) => u.is_admin || u.is_manager);

  const toggleManager = async (user: CabinetUser) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await adminSetUserManager(user.id, !user.is_manager);
      setUsers((prev) => prev.map((u) => (u.id === next.id ? next : u)));
      setOk(
        next.is_manager
          ? `${userLabel(next)} назначен менеджером`
          : `${userLabel(next)} больше не менеджер`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить роль");
    } finally {
      setBusy(false);
    }
  };

  const patchDeal = async (dealId: number, body: Parameters<typeof adminUpdateDeal>[1]) => {
    setError(null);
    try {
      const next = await adminUpdateDeal(dealId, body);
      setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить сделку");
    }
  };

  return (
    <div className="space-y-4">
      {canAssignRoles ? (
        <section className="rounded-xl border border-border bg-white p-3.5">
          <h2 className="text-sm font-semibold">Менеджеры</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Все, кто входил в кабинет через Telegram. Назначьте менеджера — он сможет вести сделки и сроки оплаты.
          </p>
          {loading ? null : users.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">Пока никто не входил в кабинет</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{userLabel(u)}</p>
                    <p className="text-[11px] text-text-muted">
                      {u.is_admin ? "Администратор" : u.is_manager ? "Менеджер" : "Клиент"}
                      {u.created_at ? ` · с ${u.created_at.slice(0, 10)}` : ""}
                    </p>
                  </div>
                  {u.is_admin ? (
                    <span className="shrink-0 rounded bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                      Админ
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleManager(u)}
                      className={[
                        "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50",
                        u.is_manager
                          ? "border border-zinc-300 bg-white text-zinc-700"
                          : "bg-emerald-600 text-white",
                      ].join(" ")}
                    >
                      {u.is_manager ? "Снять" : "Назначить"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold">Сделки клиентов</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Клиент, менеджер и сроки двух этапов оплаты.
        </p>
      </div>

      <form
        onSubmit={(e) => void submit(e)}
        className="space-y-2.5 rounded-xl border border-amber-200/80 bg-amber-50/40 p-3.5"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/80">
          Новая сделка
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs sm:col-span-2">
            <span className="text-text-muted">Клиент</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              required
            >
              <option value="" disabled>
                {users.length ? "Выберите клиента…" : "Нет клиентов — пусть войдут в кабинет"}
              </option>
              {users.map((u) => (
                <option key={u.id} value={String(u.telegram_id)}>
                  {userLabel(u)}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2">
            <span className="text-xs text-text-muted">Тип</span>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {(["kit", "car"] as DealKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={[
                    "rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
                    kind === k
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-border bg-white text-zinc-700 hover:border-emerald-400",
                  ].join(" ")}
                >
                  {DEAL_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              {kind === "kit"
                ? "Машинокомплект — будет карта разбора"
                : "Авто целиком — без карты разбора"}
            </p>
          </div>

          <label className="block text-xs sm:col-span-2">
            <span className="text-text-muted">
              {kind === "kit" ? "Машинокомплект (год марка модель)" : "Авто (год марка модель)"}
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="2021 Toyota Camry SE"
              required
            />
          </label>

          <label className="block text-xs">
            <span className="text-text-muted">Лот #</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="81234567"
            />
          </label>
          <label className="block text-xs">
            <span className="text-text-muted">VIN</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder="4T1…"
            />
          </label>
          <label className="block text-xs">
            <span className="text-text-muted">Цена</span>
            <div className="mt-1 flex gap-1.5">
              <input
                className="w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="8400"
              />
              <select
                className="rounded-lg border border-border bg-white px-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "USD" | "GBP")}
              >
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </label>
          <label className="block text-xs">
            <span className="text-text-muted">Страна маршрута</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={originRegion}
              onChange={(e) => setOriginRegion(e.target.value as OriginRegion)}
            >
              {(Object.keys(ORIGIN_REGION_LABELS) as OriginRegion[]).map((r) => (
                <option key={r} value={r}>
                  {ORIGIN_REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs">
          <span className="text-text-muted">Менеджер сделки</span>
          <select
            className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
            value={managerUserId}
            onChange={(e) => setManagerUserId(e.target.value)}
          >
            <option value="">Тот, кто создаёт сделку</option>
            {managers.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {userLabel(u)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="text-text-muted">Срок оплаты, этап 1</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={due1}
              onChange={(e) => setDue1(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="text-text-muted">Срок оплаты, этап 2</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={due2}
              onChange={(e) => setDue2(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-xs">
          <span className="text-text-muted">Заметка</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Комментарий для клиента…"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !users.length}
          className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Создаём…" : `Добавить ${DEAL_KIND_LABELS[kind].toLowerCase()}`}
        </button>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-700">{ok}</p> : null}
      </form>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Все сделки ({deals.length})
          </h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-medium text-accent-dark underline underline-offset-2"
          >
            Обновить
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-text-secondary">Загрузка…</p>
        ) : deals.length === 0 ? (
          <p className="text-sm text-text-secondary">Пока нет сделок</p>
        ) : (
          <ul className="grid gap-2">
            {deals.map((deal) => {
              const p = progress(deal);
              const cover = dealCoverPhotoUrl(deal);
              const photoCount = (deal.media || []).filter((m) => m.kind === "photo").length;
              const k = dealKind(deal);
              return (
                <li key={deal.id} className="overflow-hidden rounded-lg border border-border bg-white">
                  <button
                    type="button"
                    onClick={() => onOpenDeal?.(deal.id)}
                    className="flex w-full gap-3 p-3 text-left transition hover:bg-accent/[0.03]"
                  >
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 sm:h-16 sm:w-24">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                          Нет фото
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{deal.title}</span>
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                          {statusLabel(deal.status)}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted">
                        {[
                          deal.client_name ||
                            (deal.client_username ? `@${deal.client_username}` : null) ||
                            (deal.client_telegram_id ? `TG ${deal.client_telegram_id}` : null),
                          DEAL_KIND_LABELS[k],
                          regionLabel(deal.origin_region),
                          paymentProgressLabel(deal),
                          deal.lot_number && `#${deal.lot_number}`,
                          photoCount ? `${photoCount} фото` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="mt-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.round((p.done / Math.max(p.total, 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-text-muted">
                          {p.done}/{p.total} · сейчас: {p.current}
                        </p>
                      </div>
                      <div className="mt-1.5">
                        <DealClosingStages deal={deal} compact />
                      </div>
                    </div>
                  </button>
                  <div
                    className="grid gap-2 border-t border-border px-3 py-2 sm:grid-cols-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="block text-[11px] text-text-muted">
                      Менеджер
                      <select
                        className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-zinc-900"
                        value={deal.manager_user_id ? String(deal.manager_user_id) : ""}
                        onChange={(e) =>
                          void patchDeal(deal.id, {
                            manager_user_id: e.target.value ? Number(e.target.value) : 0,
                          })
                        }
                      >
                        <option value="">Не назначен</option>
                        {managers.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {userLabel(u)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] text-text-muted">
                      Срок этапа 1
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-zinc-900"
                        value={deal.payment_stage1_due || ""}
                        onChange={(e) =>
                          void patchDeal(deal.id, { payment_stage1_due: e.target.value })
                        }
                      />
                    </label>
                    <label className="block text-[11px] text-text-muted">
                      Срок этапа 2
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-zinc-900"
                        value={deal.payment_stage2_due || ""}
                        onChange={(e) =>
                          void patchDeal(deal.id, { payment_stage2_due: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
