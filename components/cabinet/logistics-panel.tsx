"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ContainerStage,
  LogisticsDealCard,
  ShippingContainer,
  SmsTemplate,
} from "@/lib/api/cabinet";
import {
  ORIGIN_REGION_LABELS,
  adminAddDealToContainer,
  adminCreateContainer,
  adminCreateSmsTemplate,
  adminDeleteContainer,
  adminDeleteSmsTemplate,
  adminMoveContainer,
  adminRemoveDealFromContainer,
  adminUpdateSmsTemplate,
  fetchLogisticsBoard,
  mediaAbsoluteUrl,
} from "@/lib/api/cabinet";
import { CoverThumb } from "@/components/cabinet/deal-photos";

const DEAL_MIME = "application/x-mg-deal-id";

const STAGE_TONE: Record<
  string,
  { bar: string; chip: string; soft: string; ring: string }
> = {
  loading: {
    bar: "bg-zinc-400",
    chip: "bg-zinc-100 text-zinc-700",
    soft: "from-zinc-50 to-white",
    ring: "ring-zinc-300",
  },
  departed: {
    bar: "bg-sky-500",
    chip: "bg-sky-50 text-sky-800",
    soft: "from-sky-50/80 to-white",
    ring: "ring-sky-300",
  },
  ocean: {
    bar: "bg-blue-500",
    chip: "bg-blue-50 text-blue-800",
    soft: "from-blue-50/70 to-white",
    ring: "ring-blue-300",
  },
  customs: {
    bar: "bg-amber-500",
    chip: "bg-amber-50 text-amber-900",
    soft: "from-amber-50/70 to-white",
    ring: "ring-amber-300",
  },
  arrived: {
    bar: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-900",
    soft: "from-emerald-50/70 to-white",
    ring: "ring-emerald-300",
  },
  unloading: {
    bar: "bg-teal-500",
    chip: "bg-teal-50 text-teal-900",
    soft: "from-teal-50/70 to-white",
    ring: "ring-teal-300",
  },
  done: {
    bar: "bg-green-600",
    chip: "bg-green-50 text-green-900",
    soft: "from-green-50/80 to-white",
    ring: "ring-green-300",
  },
};

function tone(stage: string) {
  return STAGE_TONE[stage] || STAGE_TONE.loading;
}

function dealLabel(d: LogisticsDealCard): string {
  const bits = [d.title];
  if (d.lot_number) bits.push(`#${d.lot_number}`);
  return bits.join(" · ");
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function DealCard({
  deal,
  onRemove,
  busy,
  compact,
}: {
  deal: LogisticsDealCard;
  onRemove?: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const hasPhone = Boolean(deal.client_phone?.trim());
  const cover = deal.cover_url?.trim()
    ? mediaAbsoluteUrl(deal.cover_url.trim())
    : null;
  const tech = [deal.engine, deal.primary_damage]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DEAL_MIME, String(deal.deal_id));
        e.dataTransfer.setData("text/plain", String(deal.deal_id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={[
        "group cursor-grab active:cursor-grabbing rounded-xl border border-zinc-200/90 bg-white",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition",
        "hover:border-emerald-300/70 hover:shadow-[0_8px_24px_-12px_rgba(16,185,129,0.35)]",
        compact ? "p-2.5" : "p-3",
      ].join(" ")}
    >
      <div className="flex gap-2.5">
        <div
          className={[
            "shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200/80",
            compact ? "h-12 w-16" : "h-14 w-[4.5rem]",
          ].join(" ")}
        >
          <CoverThumb
            src={cover}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-50 text-[11px] font-bold text-zinc-600">
                {initials(deal.client_name || deal.title)}
              </div>
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug text-zinc-900">
            {dealLabel(deal)}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            {ORIGIN_REGION_LABELS[deal.origin_region] || deal.origin_region}
            {deal.kind === "kit" ? " · комплект" : " · авто"}
          </p>
          {tech ? (
            <p className="mt-0.5 truncate text-[10px] text-zinc-400">{tech}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex max-w-full truncate rounded-md bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200/80">
          {deal.client_name || "Без имени"}
        </span>
        <span
          className={[
            "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1",
            hasPhone
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
              : "bg-rose-50 text-rose-700 ring-rose-200/80",
          ].join(" ")}
        >
          {hasPhone ? deal.client_phone : "нет SMS"}
        </span>
      </div>
      {onRemove ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="mt-2 text-[10px] font-semibold text-zinc-400 transition hover:text-rose-600 disabled:opacity-50"
        >
          Убрать из контейнера
        </button>
      ) : null}
    </div>
  );
}

export function LogisticsPanel() {
  const [pool, setPool] = useState<LogisticsDealCard[]>([]);
  const [containers, setContainers] = useState<ShippingContainer[]>([]);
  const [stages, setStages] = useState<{ key: string; label: string }[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [dropOverId, setDropOverId] = useState<number | "pool" | null>(null);
  const [poolFilter, setPoolFilter] = useState("");

  const [moveId, setMoveId] = useState<number | null>(null);
  const [moveStage, setMoveStage] = useState<ContainerStage>("ocean");
  const [moveMessage, setMoveMessage] = useState("");
  const [moveSendSms, setMoveSendSms] = useState(true);
  const [moveTemplateId, setMoveTemplateId] = useState<number | "">("");

  const [showTemplates, setShowTemplates] = useState(false);
  const [tplTitle, setTplTitle] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [editingTpl, setEditingTpl] = useState<SmsTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const board = await fetchLogisticsBoard();
      setPool(board.pool);
      setContainers(board.containers);
      setStages(board.stages);
      setTemplates(board.templates);
      setLoadedOnce(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить логистику");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const carsIn = containers.reduce((n, c) => n + c.deals.length, 0);
    const withPhone = [...pool, ...containers.flatMap((c) => c.deals)].filter((d) =>
      Boolean(d.client_phone?.trim()),
    ).length;
    const active = containers.filter((c) => c.stage !== "done").length;
    return { carsIn, withPhone, active, pool: pool.length, containers: containers.length };
  }, [containers, pool]);

  const filteredPool = useMemo(() => {
    const q = poolFilter.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((d) =>
      [d.title, d.lot_number, d.client_name, d.client_phone, d.vin]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [pool, poolFilter]);

  const applyTemplate = (tpl: SmsTemplate | null) => {
    if (!tpl) return;
    setMoveMessage(tpl.body);
  };

  const createContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) {
      setError("Укажите код контейнера");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await adminCreateContainer({
        code: newCode.trim(),
        title: newTitle.trim(),
        stage: "loading",
      });
      setNewCode("");
      setNewTitle("");
      setShowCreate(false);
      setOk("Контейнер создан");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
    } finally {
      setBusy(false);
    }
  };

  const dropOnContainer = async (containerId: number, dealId: number) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await adminAddDealToContainer(containerId, dealId);
      setOk("Машина добавлена в контейнер");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить");
    } finally {
      setBusy(false);
      setDropOverId(null);
    }
  };

  const dropOnPool = async (dealId: number) => {
    const current = containers.find((c) => c.deals.some((d) => d.deal_id === dealId));
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await adminRemoveDealFromContainer(current.id, dealId);
      setOk("Машина возвращена в пул");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось убрать");
    } finally {
      setBusy(false);
      setDropOverId(null);
    }
  };

  const openMove = (c: ShippingContainer) => {
    setMoveId(c.id);
    setMoveStage(c.stage);
    setMoveSendSms(true);
    setMoveTemplateId("");
    const match = templates.find((t) =>
      t.title.toLowerCase().includes(c.stage_label.toLowerCase().slice(0, 4)),
    );
    if (match) {
      setMoveTemplateId(match.id);
      applyTemplate(match);
    } else {
      setMoveMessage(
        "MG.GROUP: контейнер {container} — этап «{stage}». Авто: {car}.",
      );
    }
  };

  const submitMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (moveId == null) return;
    if (!moveMessage.trim()) {
      setError("Напишите текст SMS");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await adminMoveContainer(moveId, {
        stage: moveStage,
        message: moveMessage.trim(),
        send_sms: moveSendSms,
        template_id: typeof moveTemplateId === "number" ? moveTemplateId : null,
      });
      const bits = [`Этап: ${result.container.stage_label}`];
      if (moveSendSms) {
        bits.push(`SMS: ${result.sms_sent}`);
        if (result.sms_failed) bits.push(`ошибок ${result.sms_failed}`);
        if (result.sms_skipped) bits.push(`пропущено ${result.sms_skipped}`);
      }
      setOk(bits.join(" · "));
      setMoveId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сменить этап");
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTitle.trim() || !tplBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editingTpl) {
        await adminUpdateSmsTemplate(editingTpl.id, {
          title: tplTitle.trim(),
          body: tplBody.trim(),
        });
        setOk("Шаблон обновлён");
      } else {
        await adminCreateSmsTemplate({
          title: tplTitle.trim(),
          body: tplBody.trim(),
        });
        setOk("Шаблон добавлен");
      }
      setTplTitle("");
      setTplBody("");
      setEditingTpl(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка шаблона");
    } finally {
      setBusy(false);
    }
  };

  const moving = moveId != null ? containers.find((c) => c.id === moveId) : null;

  if (loading && !loadedOnce) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-zinc-200/80 bg-white">
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          Загрузка рабочей доски…
        </div>
      </div>
    );
  }

  if (!loadedOnce && error) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-4 text-center">
        <p className="max-w-md text-sm text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Workspace header */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_180px_at_10%_-20%,rgba(16,185,129,0.12),transparent),radial-gradient(600px_160px_at_90%_0%,rgba(14,165,233,0.08),transparent)]" />
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80">
              Operations · Logistics
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              Контейнеры и отгрузки
            </h2>
            <p className="mt-1 max-w-xl text-xs text-zinc-500 sm:text-sm">
              Соберите машины в контейнер, двигайте этап и отправьте SMS клиентам.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              {showTemplates ? "Скрыть шаблоны" : "Шаблоны SMS"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800"
            >
              + Контейнер
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Обновить
            </button>
          </div>
        </div>

        <div className="relative grid grid-cols-2 gap-px border-t border-zinc-100 bg-zinc-100 sm:grid-cols-4">
          {[
            { label: "В пуле", value: stats.pool },
            { label: "Контейнеры", value: stats.containers },
            { label: "Машин в пути", value: stats.carsIn },
            { label: "Активных", value: stats.active },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {s.label}
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 font-semibold underline underline-offset-2"
          >
            Повторить
          </button>
        </div>
      ) : null}
      {ok ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
          {ok}
        </div>
      ) : null}

      {showCreate ? (
        <form
          onSubmit={(e) => void createContainer(e)}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
        >
          <label className="block flex-1 text-xs">
            <span className="font-medium text-zinc-500">Код контейнера</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:bg-white focus:ring-2"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="CNT-14"
              required
              autoFocus
            />
          </label>
          <label className="block flex-[1.4] text-xs">
            <span className="font-medium text-zinc-500">Название</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:bg-white focus:ring-2"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Апрель · USA"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
          >
            Создать
          </button>
        </form>
      ) : null}

      {/* Pipeline legend */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin">
        {stages.map((s, i) => {
          const t = tone(s.key);
          const count = containers.filter((c) => c.stage === s.key).length;
          return (
            <div
              key={s.key}
              className="flex min-w-[7.5rem] shrink-0 items-center gap-2 rounded-xl border border-zinc-200/80 bg-white px-2.5 py-2 shadow-sm"
            >
              <span className={`h-2 w-2 rounded-full ${t.bar}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-zinc-800">{s.label}</p>
                <p className="text-[10px] text-zinc-400">
                  {count} · шаг {i + 1}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {showTemplates ? (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Шаблоны SMS</h3>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Плейсхолдеры: {"{container}"}, {"{stage}"}, {"{car}"}, {"{client}"}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-zinc-150 border-zinc-200 bg-zinc-50/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-900">{t.title}</p>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-emerald-700"
                      onClick={() => {
                        setEditingTpl(t);
                        setTplTitle(t.title);
                        setTplBody(t.body);
                      }}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[11px] font-semibold text-rose-600 disabled:opacity-50"
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          try {
                            await adminDeleteSmsTemplate(t.id);
                            await load();
                          } catch (err) {
                            setError(
                              err instanceof Error ? err.message : "Не удалено",
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-500">
                  {t.body}
                </p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => void saveTemplate(e)}
            className="space-y-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-3"
          >
            <p className="text-[11px] font-semibold text-zinc-700">
              {editingTpl ? `Редактирование: ${editingTpl.title}` : "Новый шаблон"}
            </p>
            <input
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              placeholder="Название"
              value={tplTitle}
              onChange={(e) => setTplTitle(e.target.value)}
              required
            />
            <textarea
              className="min-h-[72px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              placeholder="Текст SMS…"
              value={tplBody}
              onChange={(e) => setTplBody(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {editingTpl ? "Сохранить" : "Добавить"}
              </button>
              {editingTpl ? (
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold"
                  onClick={() => {
                    setEditingTpl(null);
                    setTplTitle("");
                    setTplBody("");
                  }}
                >
                  Отмена
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {/* Board */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* Pool */}
        <aside
          onDragOver={(e) => {
            e.preventDefault();
            setDropOverId("pool");
          }}
          onDragLeave={() => setDropOverId((v) => (v === "pool" ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            const raw =
              e.dataTransfer.getData(DEAL_MIME) || e.dataTransfer.getData("text/plain");
            const dealId = Number(raw);
            if (Number.isFinite(dealId) && dealId > 0) void dropOnPool(dealId);
          }}
          className={[
            "w-full shrink-0 rounded-2xl border bg-white p-3 shadow-sm transition lg:sticky lg:top-3 lg:w-[280px]",
            dropOverId === "pool"
              ? "border-emerald-400 ring-2 ring-emerald-200"
              : "border-zinc-200/90",
          ].join(" ")}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Inbox
              </p>
              <p className="text-sm font-semibold text-zinc-900">
                Пул машин
                <span className="ml-1.5 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-600">
                  {pool.length}
                </span>
              </p>
            </div>
          </div>
          <input
            value={poolFilter}
            onChange={(e) => setPoolFilter(e.target.value)}
            placeholder="Поиск по авто, клиенту…"
            className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs outline-none ring-emerald-500/20 focus:bg-white focus:ring-2"
          />
          <div className="max-h-[min(68vh,720px)] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {filteredPool.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center text-xs text-zinc-400">
                {pool.length === 0
                  ? "Все машины в контейнерах"
                  : "Ничего не найдено"}
              </div>
            ) : (
              filteredPool.map((d) => (
                <DealCard key={d.deal_id} deal={d} compact />
              ))
            )}
          </div>
        </aside>

        {/* Containers — horizontal scroll on mobile, wrap on desktop */}
        <div className="min-w-0 flex-1">
          {containers.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-6 text-center">
              <p className="text-sm font-semibold text-zinc-800">Пока нет контейнеров</p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">
                Создайте контейнер и перетащите сюда машины из пула слева.
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white"
              >
                Создать первый контейнер
              </button>
            </div>
          ) : (
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 lg:grid lg:grid-cols-2 lg:overflow-visible xl:grid-cols-3">
              {containers.map((c) => {
                const t = tone(c.stage);
                const over = dropOverId === c.id;
                return (
                  <div
                    key={c.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropOverId(c.id);
                    }}
                    onDragLeave={() => setDropOverId((v) => (v === c.id ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw =
                        e.dataTransfer.getData(DEAL_MIME) ||
                        e.dataTransfer.getData("text/plain");
                      const dealId = Number(raw);
                      if (Number.isFinite(dealId) && dealId > 0) {
                        void dropOnContainer(c.id, dealId);
                      }
                    }}
                    className={[
                      "flex w-[min(100%,320px)] shrink-0 flex-col overflow-hidden rounded-2xl border bg-gradient-to-b shadow-sm transition lg:w-auto",
                      t.soft,
                      over
                        ? `border-emerald-400 ring-2 ${t.ring}`
                        : "border-zinc-200/90",
                    ].join(" ")}
                  >
                    <div className={`h-1 w-full ${t.bar}`} />
                    <div className="flex items-start justify-between gap-2 p-3.5 pb-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="truncate text-sm font-semibold text-zinc-900">
                            {c.code}
                          </h3>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${t.chip}`}
                          >
                            {c.stage_label}
                          </span>
                        </div>
                        {c.title ? (
                          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                            {c.title}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-zinc-400">
                          {c.deals.length}{" "}
                          {c.deals.length === 1
                            ? "машина"
                            : c.deals.length < 5
                              ? "машины"
                              : "машин"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openMove(c)}
                        className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Этап + SMS
                      </button>
                      <button
                        type="button"
                        disabled={busy || c.deals.length > 0}
                        title={
                          c.deals.length
                            ? "Сначала уберите машины"
                            : "Удалить пустой контейнер"
                        }
                        onClick={() => {
                          void (async () => {
                            if (!window.confirm(`Удалить контейнер ${c.code}?`)) return;
                            setBusy(true);
                            try {
                              await adminDeleteContainer(c.id);
                              await load();
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : "Не удалено",
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                        className="rounded-lg border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 disabled:opacity-40"
                      >
                        Удалить
                      </button>
                    </div>
                    <div className="max-h-[420px] space-y-2 overflow-y-auto px-3.5 pb-3.5">
                      {c.deals.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300/80 bg-white/50 px-3 py-6 text-center text-[11px] text-zinc-400">
                          Перетащите машины сюда
                        </div>
                      ) : (
                        c.deals.map((d) => (
                          <DealCard
                            key={d.deal_id}
                            deal={d}
                            busy={busy}
                            onRemove={() => {
                              void (async () => {
                                setBusy(true);
                                try {
                                  await adminRemoveDealFromContainer(c.id, d.deal_id);
                                  await load();
                                } catch (err) {
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : "Не удалось убрать",
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Move modal */}
      {moving && moveId != null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <form
            onSubmit={(e) => void submitMove(e)}
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="border-b border-zinc-100 px-5 py-4">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">
                    Смена этапа
                  </p>
                  <h3 className="mt-0.5 text-lg font-semibold text-zinc-900">
                    {moving.code}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {moving.deals.length} машин · SMS клиентам с телефоном
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
                  onClick={() => setMoveId(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="space-y-3.5 overflow-y-auto px-5 py-4">
              <label className="block text-xs">
                <span className="font-medium text-zinc-500">Новый этап</span>
                <select
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/30"
                  value={moveStage}
                  onChange={(e) => setMoveStage(e.target.value as ContainerStage)}
                >
                  {stages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="font-medium text-zinc-500">Шаблон</span>
                <select
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/30"
                  value={moveTemplateId === "" ? "" : String(moveTemplateId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setMoveTemplateId("");
                      return;
                    }
                    const id = Number(v);
                    setMoveTemplateId(id);
                    const tpl = templates.find((x) => x.id === id);
                    if (tpl) applyTemplate(tpl);
                  }}
                >
                  <option value="">Свой текст</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="font-medium text-zinc-500">Текст SMS</span>
                <textarea
                  className="mt-1.5 min-h-[110px] w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/30"
                  value={moveMessage}
                  onChange={(e) => setMoveMessage(e.target.value)}
                  required
                  maxLength={700}
                />
                <span className="mt-1 block text-[10px] text-zinc-400">
                  {moveMessage.length}/700 · {"{container}"}, {"{stage}"}, {"{car}"},{" "}
                  {"{client}"}
                </span>
              </label>

              <label className="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50/40 px-3 py-2.5 text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  checked={moveSendSms}
                  onChange={(e) => setMoveSendSms(e.target.checked)}
                />
                Отправить SMS клиентам
              </label>
            </div>

            <div className="flex gap-2 border-t border-zinc-100 px-5 py-4">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Отправляем…" : "Применить"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600"
                onClick={() => setMoveId(null)}
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
