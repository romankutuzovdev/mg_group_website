"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CabinetUser,
  Deal,
  DealKind,
  OriginRegion,
} from "@/lib/api/cabinet";
import {
  DEAL_KIND_LABELS,
  ORIGIN_REGION_LABELS,
  adminCreateClientAccount,
  adminCreateDeal,
  adminSetUserManager,
  adminUpdateDeal,
  adminUploadDealMedia,
  dealKind,
  generateClientPassword,
  stageKeysForDeal,
  fetchAdminDeals,
  fetchAdminUsers,
  regionLabel,
} from "@/lib/api/cabinet";
import { fetchLotFromUrl } from "@/lib/api/client";
import { apiUrl, isApiEnabled } from "@/lib/api/config";
import { lotHost } from "@/lib/pricing/lot-url";
import {
  LotLoadButton,
  LotLoadStatus,
  lotLoadErrorMessage,
} from "@/components/pricing/lot-url-load";
import { dealCoverPhotoUrl } from "@/components/cabinet/deal-photos";
import { paymentProgressLabel } from "@/components/cabinet/deal-payment-status";
import { DealClosingStages } from "@/components/cabinet/deal-closing-stages";

function dealTitleFromLot(lot: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  title?: string | null;
}): string {
  const parts = [lot.year, lot.make, lot.model].filter(Boolean);
  if (parts.length >= 2) return parts.join(" ");
  const t = (lot.title || "").trim();
  return t || parts.join(" ");
}

async function uploadCoverFromLotImages(dealId: number, images: string[]) {
  const src = (images || []).map((u) => (u || "").trim()).find(Boolean);
  if (!src) return;
  try {
    const proxied = /^https?:\/\//i.test(src)
      ? apiUrl(`/api/lot-image?u=${encodeURIComponent(src)}`)
      : src.startsWith("/")
        ? apiUrl(src)
        : src;
    const res = await fetch(proxied);
    if (!res.ok) return;
    const blob = await res.blob();
    if (!blob.size || !(blob.type || "").startsWith("image/")) return;
    const file = new File([blob], "auction-cover.jpg", {
      type: blob.type || "image/jpeg",
    });
    await adminUploadDealMedia(dealId, file, "auction", "С аукциона");
  } catch {
    // Cover is optional — deal fields already saved.
  }
}

type Props = {
  onCreated?: (deal: Deal) => void;
  onOpenDeal?: (id: number) => void;
  /** Только владелец из CABINET_ADMIN_TELEGRAM_IDS назначает менеджеров. */
  canAssignRoles?: boolean;
  /** Текущий менеджер/админ — для закрепления клиентов и фокуса своего списка. */
  currentUser?: CabinetUser | null;
};

type ClientBranch = {
  key: string;
  label: string;
  telegramId: number;
  username: string;
  phone: string;
  userId: number;
  deals: Deal[];
};

type ManagerBranch = {
  key: string;
  managerId: number;
  label: string;
  clients: ClientBranch[];
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
  const phone = (u.phone || "").trim();
  const nick = u.username && !/^\d{9,15}$/.test(u.username) ? `@${u.username}` : "";
  if (name && phone) return `${name} · ${phone}`;
  if (phone) return phone;
  const base = name || nick || `TG ${u.telegram_id}`;
  return nick && name ? `${name} (${nick})` : base;
}

export function AdminDealsPanel({
  onCreated,
  onOpenDeal,
  canAssignRoles = false,
  currentUser = null,
}: Props) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<CabinetUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [openManagers, setOpenManagers] = useState<Record<string, boolean>>({});
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({});

  const [telegramId, setTelegramId] = useState("");
  const [kind, setKind] = useState<DealKind>("kit");
  const [lotUrl, setLotUrl] = useState("");
  const [lotLoading, setLotLoading] = useState(false);
  const [lotMeta, setLotMeta] = useState<string | null>(null);
  const [lotImages, setLotImages] = useState<string[]>([]);
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

  const [clientPhone, setClientPhone] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientPassword, setClientPassword] = useState(() => generateClientPassword());
  const [sendSms, setSendSms] = useState(true);
  const [createdCreds, setCreatedCreds] = useState<{
    login: string;
    password: string;
    name: string;
  } | null>(null);

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

  const loadFromAuctionUrl = async () => {
    const url = lotUrl.trim();
    if (!url) {
      setError("Вставьте ссылку Bid.cars (или Copart / IAAI)");
      return;
    }
    const host = lotHost(url);
    if (host === "other") {
      setError("Нужна ссылка Bid.cars, Copart или IAAI на лот");
      return;
    }
    if (!isApiEnabled()) {
      setError("API недоступен");
      return;
    }
    setLotLoading(true);
    setError(null);
    setOk(null);
    setLotMeta(null);
    try {
      const lot = await fetchLotFromUrl(url);
      if (!lot.ok && !lot.make && !lot.lotNumber && !lot.year) {
        setError(
          lotLoadErrorMessage(
            new Error(lot.error || lot.chrome_error || "Не удалось открыть лот на сервере"),
          ),
        );
        return;
      }
      const nextTitle = dealTitleFromLot(lot);
      if (nextTitle) setTitle(nextTitle);
      if (lot.lotNumber) setLotNumber(String(lot.lotNumber));
      if (lot.vin) setVin(String(lot.vin).toUpperCase());
      if (lot.bid != null && Number(lot.bid) >= 0) setPrice(String(lot.bid));
      if (lot.region === "uk" || lot.source === "copart_uk" || host === "copart_uk") {
        setOriginRegion("uk");
        setCurrency("GBP");
      } else {
        setOriginRegion("usa");
        setCurrency("USD");
      }
      const bits = [
        lot.location ? `Площадка: ${lot.location}` : "",
        lot.odometer != null ? `Пробег: ${lot.odometer}` : "",
        lot.category ? `Cat ${lot.category}` : "",
        lot.bodyStyle ? `Кузов: ${lot.bodyStyle}` : "",
        lot.engine ? `Двигатель: ${lot.engine}` : "",
        lot.cylinders != null && String(lot.cylinders).trim()
          ? `Цил.: ${lot.cylinders}`
          : "",
        lot.fuel ? `Топливо: ${lot.fuel}` : "",
        lot.transmission ? `КПП: ${lot.transmission}` : "",
        lot.drive ? `Привод: ${lot.drive}` : "",
        lot.exteriorColor ? `Цвет: ${lot.exteriorColor}` : "",
        lot.primaryDamage ? `Повреждение: ${lot.primaryDamage}` : "",
      ].filter(Boolean);
      if (bits.length) {
        setNote((prev) => {
          const extra = bits.join(" · ");
          if (!prev.trim()) return extra;
          if (prev.includes(extra)) return prev;
          return `${prev.trim()}\n${extra}`;
        });
      }
      setLotImages(Array.isArray(lot.images) ? lot.images.filter(Boolean) : []);
      setLotMeta(
        [
          nextTitle || "Лот",
          lot.lotNumber ? `#${lot.lotNumber}` : "",
          lot.vin ? `VIN ${lot.vin}` : "",
          lot.engine ? `двиг. ${lot.engine}` : "",
          lot.fuel || "",
          lot.drive || "",
          lot.bid != null ? `$${Number(lot.bid).toLocaleString("en-US")}` : "",
          lot.via ? `via ${lot.via}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (err) {
      setError(lotLoadErrorMessage(err));
    } finally {
      setLotLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tg = Number(telegramId);
    if (!Number.isFinite(tg) || tg <= 0) {
      setError("Выберите клиента из списка");
      return;
    }
    if (!title.trim()) {
      setError("Укажите название или загрузите лот по ссылке Bid.cars");
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
        lot_url: lotUrl.trim(),
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
      if (lotImages.length) {
        await uploadCoverFromLotImages(deal.id, lotImages);
      }
      setOk(
        `${DEAL_KIND_LABELS[dealKind(deal)]} #${deal.id} · ${regionLabel(deal.origin_region)}`,
      );
      setLotUrl("");
      setLotMeta(null);
      setLotImages([]);
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

  /** Клиенты для назначения сделки (не менеджеры/админы). Телефонные — сверху. */
  const clientUsers = useMemo(() => {
    return users
      .filter((u) => !u.is_admin && !u.is_manager)
      .slice()
      .sort((a, b) => {
        const ap = (a.phone || "").trim() ? 0 : 1;
        const bp = (b.phone || "").trim() ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return userLabel(a).localeCompare(userLabel(b), "ru");
      });
  }, [users]);

  const createClientAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientPhone.trim()) {
      setError("Укажите телефон клиента — это будет логин");
      return;
    }
    if (!clientPassword.trim() || clientPassword.trim().length < 4) {
      setError("Пароль минимум 4 символа");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    setCreatedCreds(null);
    try {
      const created = await adminCreateClientAccount({
        phone: clientPhone.trim(),
        password: clientPassword.trim(),
        first_name: clientFirstName.trim(),
        last_name: clientLastName.trim(),
        send_sms: sendSms,
      });
      const name = [created.user.first_name, created.user.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      setCreatedCreds({
        login: created.login,
        password: created.password,
        name: name || created.login,
      });
      // Сразу в список «Клиент» для новой сделки — без ожидания повторного fetch
      setUsers((prev) => {
        if (prev.some((u) => u.id === created.user.id)) {
          return prev.map((u) => (u.id === created.user.id ? created.user : u));
        }
        return [created.user, ...prev];
      });
      setTelegramId(String(created.user.telegram_id));
      if (currentUser?.id) {
        setManagerUserId(String(currentUser.id));
      } else if (created.user.manager_user_id) {
        setManagerUserId(String(created.user.manager_user_id));
      }
      const smsBit = created.sms_sent
        ? "SMS отправлено."
        : sendSms
          ? created.sms_skipped
            ? "SMS пропущено (ключи sms.by не заданы)."
            : created.sms_error
              ? `SMS ошибка: ${created.sms_error}.`
              : "SMS не ушло."
          : "SMS не запрашивали.";
      setOk(
        `Аккаунт создан: ${created.login}. Закреплён за вами — выбран в «Новая сделка». ${smsBit}`,
      );
      setClientPhone("");
      setClientFirstName("");
      setClientLastName("");
      setClientPassword(generateClientPassword());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать аккаунт");
    } finally {
      setBusy(false);
    }
  };

  /** Менеджер → клиенты → авто */
  const treeByManager = useMemo((): ManagerBranch[] => {
    const byTg = new Map<number, CabinetUser>();
    for (const u of users) byTg.set(u.telegram_id, u);

    const clientKey = (tg: number, fallback: string) =>
      tg > 0 ? `tg:${tg}` : `x:${fallback}`;

    type AccClient = ClientBranch & { managerHint: number };
    const clients = new Map<string, AccClient>();

    const ensureClient = (
      tg: number,
      bits: { name?: string; username?: string; phone?: string; userId?: number },
    ): AccClient => {
      const key = clientKey(tg, bits.username || bits.phone || "unknown");
      let row = clients.get(key);
      if (!row) {
        const fromUsers = tg > 0 ? byTg.get(tg) : undefined;
        const name =
          (bits.name || "").trim() ||
          [fromUsers?.first_name, fromUsers?.last_name].filter(Boolean).join(" ").trim();
        const nick = (bits.username || fromUsers?.username || "").replace(/^@/, "").trim();
        const phone = (bits.phone || fromUsers?.phone || "").trim();
        const label = name
          ? phone
            ? `${name} · ${phone}`
            : nick
              ? `${name} (@${nick})`
              : name
          : phone || (nick ? `@${nick}` : tg ? `Клиент TG ${tg}` : "Клиент");
        row = {
          key,
          label,
          telegramId: tg,
          username: nick && !/^\d{9,15}$/.test(nick) ? nick : "",
          phone,
          userId: bits.userId || fromUsers?.id || 0,
          deals: [],
          managerHint: fromUsers?.manager_user_id || 0,
        };
        clients.set(key, row);
      }
      return row;
    };

    for (const deal of deals) {
      const tg = Number(deal.client_telegram_id || 0);
      const row = ensureClient(tg, {
        name: deal.client_name,
        username: deal.client_username,
      });
      row.deals.push(deal);
      if (!row.managerHint && deal.manager_user_id) {
        row.managerHint = deal.manager_user_id;
      }
    }

    // Клиенты с телефоном без сделок — тоже в дереве своего менеджера
    for (const u of users) {
      if (u.is_admin || u.is_manager) continue;
      ensureClient(u.telegram_id, {
        name: [u.first_name, u.last_name].filter(Boolean).join(" "),
        username: u.username,
        phone: u.phone,
        userId: u.id,
      });
    }

    const managerBuckets = new Map<number, Map<string, ClientBranch>>();
    const bump = (managerId: number, client: AccClient, dealList: Deal[]) => {
      if (!managerBuckets.has(managerId)) managerBuckets.set(managerId, new Map());
      const bucket = managerBuckets.get(managerId)!;
      const existing = bucket.get(client.key);
      if (existing) {
        const seen = new Set(existing.deals.map((d) => d.id));
        for (const d of dealList) {
          if (!seen.has(d.id)) existing.deals.push(d);
        }
      } else {
        bucket.set(client.key, {
          key: client.key,
          label: client.label,
          telegramId: client.telegramId,
          username: client.username,
          phone: client.phone,
          userId: client.userId,
          deals: [...dealList],
        });
      }
    };

    for (const client of clients.values()) {
      const dealsByMgr = new Map<number, Deal[]>();
      for (const d of client.deals) {
        const mid = Number(d.manager_user_id || 0);
        if (!dealsByMgr.has(mid)) dealsByMgr.set(mid, []);
        dealsByMgr.get(mid)!.push(d);
      }
      const ownedBy = client.managerHint || 0;
      if (client.deals.length === 0) {
        bump(ownedBy, client, []);
        continue;
      }
      for (const [mid, list] of dealsByMgr) {
        // Сделки без менеджера тянем к закреплённому менеджеру клиента
        const target = mid > 0 ? mid : ownedBy;
        bump(target, client, list);
      }
    }

    const managerLabel = (id: number) => {
      if (id <= 0) return "Без менеджера";
      const u = users.find((x) => x.id === id);
      return u ? userLabel(u) : `Менеджер #${id}`;
    };

    const branches: ManagerBranch[] = Array.from(managerBuckets.entries()).map(
      ([managerId, cmap]) => ({
        key: managerId > 0 ? `m:${managerId}` : "m:none",
        managerId,
        label: managerLabel(managerId),
        clients: Array.from(cmap.values())
          .map((c) => ({
            ...c,
            deals: [...c.deals].sort((a, b) =>
              String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
            ),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "ru")),
      }),
    );

    branches.sort((a, b) => {
      if (a.managerId <= 0) return 1;
      if (b.managerId <= 0) return -1;
      if (currentUser?.id && a.managerId === currentUser.id) return -1;
      if (currentUser?.id && b.managerId === currentUser.id) return 1;
      return a.label.localeCompare(b.label, "ru");
    });
    return branches;
  }, [deals, users, currentUser?.id]);

  useEffect(() => {
    // По умолчанию раскрыт свой блок менеджера (или все, если админ без сделок)
    setOpenManagers((prev) => {
      const next = { ...prev };
      for (const branch of treeByManager) {
        if (next[branch.key] === undefined) {
          next[branch.key] =
            !currentUser?.id ||
            branch.managerId === currentUser.id ||
            branch.managerId <= 0 ||
            Boolean(currentUser.is_admin);
        }
      }
      return next;
    });
  }, [treeByManager, currentUser?.id, currentUser?.is_admin]);

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

      <form
        onSubmit={(e) => void createClientAccount(e)}
        className="space-y-2.5 rounded-xl border border-sky-200/80 bg-sky-50/50 p-3.5"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-900/80">
          Новый аккаунт клиента
        </p>
        <p className="text-[11px] text-text-muted">
          Логин — номер телефона. Пароль задаёте вы и передаёте клиенту.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs sm:col-span-2">
            <span className="text-text-muted">Телефон (логин)</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+375 29 123-45-67"
              inputMode="tel"
              required
            />
          </label>
          <label className="block text-xs">
            <span className="text-text-muted">Имя</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
              placeholder="Иван"
            />
          </label>
          <label className="block text-xs">
            <span className="text-text-muted">Фамилия</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
              value={clientLastName}
              onChange={(e) => setClientLastName(e.target.value)}
              placeholder="Иванов"
            />
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="text-text-muted">Пароль</span>
            <div className="mt-1 flex gap-1.5">
              <input
                className="w-full rounded-lg border border-border bg-white px-2.5 py-2 font-mono text-sm"
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
                required
                minLength={4}
              />
              <button
                type="button"
                onClick={() => setClientPassword(generateClientPassword())}
                className="shrink-0 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Сгенерировать
              </button>
            </div>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={sendSms}
            onChange={(e) => setSendSms(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-sky-700"
          />
          Отправить SMS с логином и паролем (sms.by)
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-sky-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
        >
          {busy ? "Создаём…" : "Создать аккаунт"}
        </button>
        {createdCreds ? (
          <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm">
            <p className="font-semibold text-emerald-900">Передайте клиенту:</p>
            <p className="mt-1 text-xs text-text-muted">{createdCreds.name}</p>
            <p className="mt-2 font-mono text-sm">
              Логин: <strong>{createdCreds.login}</strong>
            </p>
            <p className="font-mono text-sm">
              Пароль: <strong>{createdCreds.password}</strong>
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-emerald-800 underline underline-offset-2"
              onClick={() => {
                const text = `Кабинет MG.GROUP\nЛогин: ${createdCreds.login}\nПароль: ${createdCreds.password}\nhttps://mg-group.by/cabinet/`;
                void navigator.clipboard?.writeText(text);
                setOk("Логин и пароль скопированы");
              }}
            >
              Скопировать в буфер
            </button>
          </div>
        ) : null}
      </form>

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
              onChange={(e) => {
                const tg = e.target.value;
                setTelegramId(tg);
                const u = clientUsers.find((c) => String(c.telegram_id) === tg);
                if (u?.manager_user_id) {
                  setManagerUserId(String(u.manager_user_id));
                } else if (currentUser?.id && !managerUserId) {
                  setManagerUserId(String(currentUser.id));
                }
              }}
              required
            >
              <option value="" disabled>
                {clientUsers.length
                  ? "Выберите клиента…"
                  : "Нет клиентов — создайте аккаунт выше"}
              </option>
              {clientUsers.map((u) => (
                <option key={u.id} value={String(u.telegram_id)}>
                  {userLabel(u)}
                  {u.phone ? " · кабинет" : ""}
                </option>
              ))}
            </select>
            {telegramId && clientUsers.some((u) => String(u.telegram_id) === telegramId) ? (
              <p className="mt-1 text-[11px] text-emerald-800">
                Выбран:{" "}
                {userLabel(
                  clientUsers.find((u) => String(u.telegram_id) === telegramId)!,
                )}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-text-muted">
                Новые аккаунты с телефоном сразу появляются в этом списке.
              </p>
            )}
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

          <div className="sm:col-span-2 space-y-1.5">
            <label className="block text-xs">
              <span className="text-text-muted">Ссылка с аукциона (Bid.cars / Copart / IAAI)</span>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm"
                  value={lotUrl}
                  onChange={(e) => setLotUrl(e.target.value)}
                  placeholder="https://bid.cars/en/lot/…"
                  inputMode="url"
                />
                <LotLoadButton loading={lotLoading} onClick={() => void loadFromAuctionUrl()} />
              </div>
            </label>
            <LotLoadStatus active={lotLoading} />
            {lotMeta ? (
              <p className="text-[11px] text-emerald-800">Подтянуто с сервера: {lotMeta}</p>
            ) : (
              <p className="text-[11px] text-text-muted">
                Сервер откроет лот в Chrome и заполнит название, VIN, лот#, цену и фото.
              </p>
            )}
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
          disabled={busy || !clientUsers.length}
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
            Менеджеры → клиенты → авто ({treeByManager.length} / {deals.length})
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
        ) : treeByManager.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Пока пусто — создайте клиента и добавьте ему авто.
          </p>
        ) : (
          <div className="space-y-3">
            {treeByManager.map((mgr) => {
              const mgrOpen = openManagers[mgr.key] !== false;
              const carsCount = mgr.clients.reduce((n, c) => n + c.deals.length, 0);
              return (
                <section
                  key={mgr.key}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenManagers((prev) => ({ ...prev, [mgr.key]: !mgrOpen }))
                    }
                    className="flex w-full items-center justify-between gap-3 bg-zinc-900 px-3.5 py-3 text-left text-white"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        Менеджер
                      </p>
                      <p className="truncate text-sm font-semibold">{mgr.label}</p>
                      <p className="text-[11px] text-zinc-400">
                        {mgr.clients.length}{" "}
                        {mgr.clients.length === 1
                          ? "клиент"
                          : mgr.clients.length < 5
                            ? "клиента"
                            : "клиентов"}
                        {" · "}
                        {carsCount}{" "}
                        {carsCount === 1 ? "авто" : carsCount < 5 ? "авто" : "авто"}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-400">{mgrOpen ? "▾" : "▸"}</span>
                  </button>

                  {mgrOpen ? (
                    <div className="space-y-2 bg-zinc-50/80 p-2.5">
                      {mgr.clients.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-text-muted">Нет клиентов</p>
                      ) : (
                        mgr.clients.map((client) => {
                          const cKey = `${mgr.key}:${client.key}`;
                          const cOpen = openClients[cKey] !== false;
                          return (
                            <div
                              key={cKey}
                              className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenClients((prev) => ({
                                    ...prev,
                                    [cKey]: !cOpen,
                                  }))
                                }
                                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
                              >
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                                    Клиент
                                  </p>
                                  <p className="truncate text-sm font-semibold text-zinc-900">
                                    {client.label}
                                  </p>
                                  <p className="text-[11px] text-text-muted">
                                    {client.username ? (
                                      <>
                                        <a
                                          href={`https://t.me/${client.username}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-emerald-800 underline underline-offset-2"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          @{client.username}
                                        </a>
                                        {" · "}
                                      </>
                                    ) : null}
                                    {client.deals.length}{" "}
                                    {client.deals.length === 1
                                      ? "машина"
                                      : client.deals.length < 5
                                        ? "машины"
                                        : "машин"}
                                    {client.deals.length === 0 ? " · пока без авто" : ""}
                                  </p>
                                </div>
                                <span className="text-xs text-zinc-400">
                                  {cOpen ? "▾" : "▸"}
                                </span>
                              </button>

                              {cOpen ? (
                                client.deals.length === 0 ? (
                                  <p className="border-t border-border px-3 py-3 text-xs text-text-muted">
                                    Создайте сделку в форме выше — выберите этого клиента.
                                  </p>
                                ) : (
                                  <ul className="grid gap-2 border-t border-border p-2">
                                    {client.deals.map((deal) => {
                                      const p = progress(deal);
                                      const cover = dealCoverPhotoUrl(deal);
                                      const photoCount = (deal.media || []).filter(
                                        (m) => m.kind === "photo",
                                      ).length;
                                      const k = dealKind(deal);
                                      return (
                                        <li
                                          key={deal.id}
                                          className="overflow-hidden rounded-lg border border-border bg-zinc-50/50"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => onOpenDeal?.(deal.id)}
                                            className="flex w-full gap-3 p-3 text-left transition hover:bg-accent/[0.03]"
                                          >
                                            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 sm:h-16 sm:w-24">
                                              {cover ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                  src={cover}
                                                  alt=""
                                                  className="h-full w-full object-cover"
                                                />
                                              ) : (
                                                <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                                                  Нет фото
                                                </div>
                                              )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-sm font-medium">
                                                  {deal.title}
                                                </span>
                                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                                                  {statusLabel(deal.status)}
                                                </span>
                                              </div>
                                              <p className="text-[11px] text-text-muted">
                                                {[
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
                                                      width: `${Math.round(
                                                        (p.done / Math.max(p.total, 1)) * 100,
                                                      )}%`,
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
                                                value={
                                                  deal.manager_user_id
                                                    ? String(deal.manager_user_id)
                                                    : ""
                                                }
                                                onChange={(e) =>
                                                  void patchDeal(deal.id, {
                                                    manager_user_id: e.target.value
                                                      ? Number(e.target.value)
                                                      : 0,
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
                                                  void patchDeal(deal.id, {
                                                    payment_stage1_due: e.target.value,
                                                  })
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
                                                  void patchDeal(deal.id, {
                                                    payment_stage2_due: e.target.value,
                                                  })
                                                }
                                              />
                                            </label>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
