"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  adminResetClientPassword,
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
  const [compose, setCompose] = useState<"none" | "client" | "deal" | "roles">("none");
  const [query, setQuery] = useState("");
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  /** Mobile: список клиентов или карточка клиента с авто */
  const [mobilePane, setMobilePane] = useState<"clients" | "workspace">("clients");
  const dealFormRef = useRef<HTMLFormElement | null>(null);

  const openDealCompose = useCallback((clientTgId?: number) => {
    if (clientTgId && clientTgId > 0) {
      setTelegramId(String(clientTgId));
    }
    setCompose("deal");
    // Форма выше дерева — прокручиваем к ней после открытия
    requestAnimationFrame(() => {
      dealFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    window.setTimeout(() => {
      dealFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

  const [telegramId, setTelegramId] = useState("");
  const [kind, setKind] = useState<DealKind>("kit");
  const [lotUrl, setLotUrl] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
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
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdValue, setPwdValue] = useState(() => generateClientPassword());
  const [pwdSendSms, setPwdSendSms] = useState(true);
  const [pwdResult, setPwdResult] = useState<{
    login: string;
    password: string;
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
      // Менеджер сделки = кто закрепил клиента; иначе текущий сотрудник
      const client = clientUsers.find((c) => c.telegram_id === tg);
      const autoManagerId =
        Number(client?.manager_user_id || 0) ||
        Number(currentUser?.id || 0) ||
        0;
      const deal = await adminCreateDeal({
        telegram_id: tg,
        title: title.trim(),
        vin: vin.trim(),
        lot_number: lotNumber.trim(),
        lot_url: lotUrl.trim(),
        tracking_url: kind === "car" ? trackingUrl.trim() : "",
        note: note.trim(),
        price: price ? Number(price) : 0,
        currency,
        kind,
        origin_region:
          kind === "kit"
            ? originRegion === "uk"
              ? "uk"
              : "usa"
            : originRegion,
        status: "active",
        manager_user_id: autoManagerId > 0 ? autoManagerId : undefined,
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
      setTrackingUrl("");
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
      const phoneDigits = clientPhone.replace(/\D+/g, "");
      if (phoneDigits.length < 9) {
        throw new Error("Укажите полный телефон, например +375 29 123-45-67");
      }
      const created = await adminCreateClientAccount({
        phone: phoneDigits.startsWith("80")
          ? `375${phoneDigits.slice(2)}`
          : phoneDigits.startsWith("0") && phoneDigits.length === 10
            ? `375${phoneDigits.slice(1)}`
            : phoneDigits,
        password: clientPassword.trim(),
        first_name: clientFirstName.trim() || "Клиент",
        last_name: clientLastName.trim(),
        send_sms: Boolean(sendSms),
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
      setSelectedClientKey(`tg:${created.user.telegram_id}`);
      setMobilePane("workspace");
      setCompose("none");
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

  const stats = useMemo(() => {
    const active = deals.filter((d) => d.status === "active").length;
    const done = deals.filter((d) => d.status === "completed").length;
    const kits = deals.filter((d) => dealKind(d) === "kit").length;
    return {
      clients: clientUsers.length,
      deals: deals.length,
      active,
      done,
      kits,
      managers: managers.length,
    };
  }, [deals, clientUsers.length, managers.length]);

  type CrmClient = ClientBranch & { managerId: number; managerLabel: string };

  const crmClients = useMemo((): CrmClient[] => {
    const rows: CrmClient[] = [];
    const seen = new Set<string>();
    for (const mgr of treeByManager) {
      for (const c of mgr.clients) {
        if (seen.has(c.key)) {
          // Сделки того же клиента у другого менеджера — мержим
          const existing = rows.find((r) => r.key === c.key);
          if (existing) {
            const ids = new Set(existing.deals.map((d) => d.id));
            for (const d of c.deals) {
              if (!ids.has(d.id)) existing.deals.push(d);
            }
          }
          continue;
        }
        seen.add(c.key);
        rows.push({
          ...c,
          managerId: mgr.managerId,
          managerLabel: mgr.label,
          deals: [...c.deals],
        });
      }
    }
    rows.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return rows;
  }, [treeByManager]);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return crmClients;
    return crmClients.filter((c) => {
      if (
        c.label.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        c.managerLabel.toLowerCase().includes(q)
      ) {
        return true;
      }
      return c.deals.some((d) => {
        const hay = [d.title, d.vin, d.lot_number, DEAL_KIND_LABELS[dealKind(d)]]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    });
  }, [crmClients, query]);

  useEffect(() => {
    if (!filteredClients.length) {
      setSelectedClientKey(null);
      return;
    }
    if (
      !selectedClientKey ||
      !filteredClients.some((c) => c.key === selectedClientKey)
    ) {
      setSelectedClientKey(filteredClients[0].key);
    }
  }, [filteredClients, selectedClientKey]);

  const selectedClient =
    filteredClients.find((c) => c.key === selectedClientKey) || null;

  const selectClient = (key: string) => {
    setSelectedClientKey(key);
    setMobilePane("workspace");
    setPwdOpen(false);
    setPwdResult(null);
    setPwdValue(generateClientPassword());
    const c = crmClients.find((x) => x.key === key);
    if (c?.telegramId) setTelegramId(String(c.telegramId));
  };

  const clientPhoneLogin = (c: CrmClient | null): string => {
    if (!c) return "";
    if ((c.phone || "").trim()) return c.phone.trim();
    if (c.userId) {
      const u = users.find((x) => x.id === c.userId);
      if ((u?.phone || "").trim()) return u!.phone!.trim();
    }
    if (c.telegramId) {
      const u = users.find((x) => x.telegram_id === c.telegramId);
      if ((u?.phone || "").trim()) return u!.phone!.trim();
    }
    return "";
  };

  const canResetPasswordFor = (c: CrmClient | null) => {
    if (!c) return false;
    const uid =
      c.userId ||
      users.find((x) => x.telegram_id === c.telegramId)?.id ||
      0;
    if (!uid || !clientPhoneLogin(c)) return false;
    if (canAssignRoles || currentUser?.is_admin) return true;
    if (currentUser?.id && c.managerId === currentUser.id) return true;
    const u = users.find((x) => x.id === uid);
    return Boolean(currentUser?.id && u?.manager_user_id === currentUser.id);
  };

  const clientUserId = (c: CrmClient | null): number => {
    if (!c) return 0;
    if (c.userId) return c.userId;
    return users.find((x) => x.telegram_id === c.telegramId)?.id || 0;
  };

  const resetSelectedPassword = async () => {
    const uid = clientUserId(selectedClient);
    if (!uid) {
      setError("Не найден аккаунт клиента для смены пароля");
      return;
    }
    if (!pwdValue.trim() || pwdValue.trim().length < 4) {
      setError("Пароль минимум 4 символа");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    setPwdResult(null);
    try {
      const res = await adminResetClientPassword(uid, pwdValue.trim(), {
        send_sms: pwdSendSms,
      });
      setPwdResult({ login: res.login || res.phone, password: res.password });
      const smsBit = res.sms_sent
        ? "SMS отправлено."
        : pwdSendSms
          ? res.sms_skipped
            ? "SMS пропущено (ключи sms.by не заданы)."
            : res.sms_error
              ? `SMS ошибка: ${res.sms_error}`
              : "SMS не ушло."
          : "SMS не запрашивали.";
      setOk(
        `Пароль обновлён для ${res.login || selectedClient?.label || "клиента"}. ${smsBit}`,
      );
      setPwdValue(generateClientPassword());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:bg-white focus:ring-2";
  const labelMuted = "font-medium text-zinc-500";

  if (loading && deals.length === 0 && users.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-zinc-200/80 bg-white">
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          Загрузка CRM…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Workspace header */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_180px_at_10%_-20%,rgba(16,185,129,0.12),transparent),radial-gradient(600px_160px_at_90%_0%,rgba(245,158,11,0.08),transparent)]" />
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80">
              CRM · Pipeline
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              Менеджеры и клиенты
            </h2>
            <p className="mt-1 max-w-xl text-xs text-zinc-500 sm:text-sm">
              Иерархия менеджер → клиент → авто. Создавайте аккаунты, сделки и контролируйте оплату.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAssignRoles ? (
              <button
                type="button"
                onClick={() => setCompose((v) => (v === "roles" ? "none" : "roles"))}
                className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
              >
                {compose === "roles" ? "Скрыть роли" : "Роли"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMobilePane("clients");
                setCompose((v) => (v === "client" ? "none" : "client"));
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              {compose === "client" ? "Скрыть" : "+ Клиент"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (compose === "deal") setCompose("none");
                else openDealCompose();
              }}
              className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800"
            >
              {compose === "deal" ? "Скрыть" : "+ Сделка"}
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
            { label: "Клиенты", value: stats.clients },
            { label: "Сделки", value: stats.deals },
            { label: "В работе", value: stats.active },
            { label: "Менеджеры", value: stats.managers },
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
          {ok}
        </div>
      ) : null}

      {compose === "roles" && canAssignRoles ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Access control
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-zinc-900">Роли сотрудников</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Назначьте менеджера — он сможет вести сделки и сроки оплаты.
            </p>
          </div>
          {users.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">Пока никто не входил в кабинет</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-zinc-50/80"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                      {(userLabel(u).slice(0, 2) || "??").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {userLabel(u)}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {u.is_admin
                          ? "Администратор"
                          : u.is_manager
                            ? "Менеджер"
                            : "Клиент"}
                        {u.created_at ? ` · с ${u.created_at.slice(0, 10)}` : ""}
                      </p>
                    </div>
                  </div>
                  {u.is_admin ? (
                    <span className="shrink-0 rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200/80">
                      Админ
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleManager(u)}
                      className={[
                        "shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition disabled:opacity-50",
                        u.is_manager
                          ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          : "bg-emerald-600 text-white hover:bg-emerald-500",
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

      {compose === "client" ? (
        <form
          onSubmit={(e) => void createClientAccount(e)}
          className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700/80">
              Onboarding
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-zinc-900">Новый аккаунт клиента</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Логин — номер телефона. Пароль задаёте вы и передаёте клиенту.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs sm:col-span-2">
              <span className={labelMuted}>Телефон (логин)</span>
              <input
                className={field}
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+375 29 123-45-67"
                inputMode="tel"
                required
                autoFocus
              />
            </label>
            <label className="block text-xs">
              <span className={labelMuted}>Имя</span>
              <input
                className={field}
                value={clientFirstName}
                onChange={(e) => setClientFirstName(e.target.value)}
                placeholder="Иван"
              />
            </label>
            <label className="block text-xs">
              <span className={labelMuted}>Фамилия</span>
              <input
                className={field}
                value={clientLastName}
                onChange={(e) => setClientLastName(e.target.value)}
                placeholder="Иванов"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className={labelMuted}>Пароль</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  className={`${field} mt-0 font-mono`}
                  value={clientPassword}
                  onChange={(e) => setClientPassword(e.target.value)}
                  required
                  minLength={4}
                />
                <button
                  type="button"
                  onClick={() => setClientPassword(generateClientPassword())}
                  className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
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
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
            />
            Отправить SMS с логином и паролем (sms.by)
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-50 sm:w-auto"
          >
            {busy ? "Создаём…" : "Создать аккаунт"}
          </button>
          {createdCreds ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm">
              <p className="font-semibold text-emerald-900">Передайте клиенту</p>
              <p className="mt-1 text-xs text-zinc-500">{createdCreds.name}</p>
              <p className="mt-2 font-mono text-sm">
                Логин: <strong>{createdCreds.login}</strong>
              </p>
              <p className="font-mono text-sm">
                Пароль: <strong>{createdCreds.password}</strong>
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-emerald-800 underline underline-offset-2"
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
      ) : null}

      {compose === "deal" ? (
      <form
        ref={dealFormRef}
        id="admin-deal-compose"
        onSubmit={(e) => void submit(e)}
        className="scroll-mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-2 ring-emerald-500/20 sm:p-5"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700/80">
            Deal intake
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-zinc-900">Новая сделка</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Клиент, лот с аукциона, менеджер и сроки двух этапов оплаты.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs sm:col-span-2">
            <span className={labelMuted}>Клиент</span>
            <select
              className={field}
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              required
            >
              <option value="" disabled>
                {clientUsers.length
                  ? "Выберите клиента…"
                  : "Нет клиентов — создайте аккаунт (+ Клиент)"}
              </option>
              {clientUsers.map((u) => (
                <option key={u.id} value={String(u.telegram_id)}>
                  {userLabel(u)}
                  {u.phone ? " · кабинет" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-zinc-400">
              {telegramId && clientUsers.some((u) => String(u.telegram_id) === telegramId)
                ? `Выбран: ${userLabel(clientUsers.find((u) => String(u.telegram_id) === telegramId)!)}`
                : "Новые аккаунты с телефоном сразу появляются в этом списке."}
            </p>
          </label>

          <div className="sm:col-span-2">
            <span className={`text-xs ${labelMuted}`}>Тип</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(["kit", "car"] as DealKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    if (k === "kit" && originRegion !== "usa" && originRegion !== "uk") {
                      setOriginRegion("usa");
                    }
                  }}
                  className={[
                    "rounded-xl border px-3 py-2.5 text-sm font-semibold shadow-sm transition",
                    kind === k
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-400",
                  ].join(" ")}
                >
                  {DEAL_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              {kind === "kit"
                ? "Машинокомплект — карта разбора США или Англии по стране лота"
                : "Авто под постановку — клиенту только ссылка на внешний трекер"}
            </p>
          </div>

          {kind === "car" ? (
            <label className="block text-xs sm:col-span-2">
              <span className={labelMuted}>Ссылка на трекер (для клиента)</span>
              <input
                className={field}
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://… — ресурс, где смотрят это авто"
                inputMode="url"
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                Клиент в кабинете увидит только эту ссылку для отслеживания.
              </p>
            </label>
          ) : null}

          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-xs">
              <span className={labelMuted}>
                {kind === "kit"
                  ? "Ссылка с аукциона (определит США / Англию)"
                  : "Ссылка с аукциона (необязательно)"}
              </span>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input
                  className={`${field} mt-0`}
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
              <p className="text-[11px] text-zinc-400">
                Сервер откроет лот в Chrome и заполнит название, VIN, лот#, цену и фото.
              </p>
            )}
          </div>

          <label className="block text-xs sm:col-span-2">
            <span className={labelMuted}>
              {kind === "kit" ? "Машинокомплект (год марка модель)" : "Авто (год марка модель)"}
            </span>
            <input
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="2021 Toyota Camry SE"
              required
            />
          </label>

          <label className="block text-xs">
            <span className={labelMuted}>Лот #</span>
            <input
              className={field}
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="81234567"
            />
          </label>
          <label className="block text-xs">
            <span className={labelMuted}>VIN</span>
            <input
              className={field}
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder="4T1…"
            />
          </label>
          <label className="block text-xs">
            <span className={labelMuted}>Цена</span>
            <div className="mt-1.5 flex gap-2">
              <input
                className={`${field} mt-0`}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="8400"
              />
              <select
                className="rounded-xl border border-zinc-200 bg-white px-2.5 text-sm shadow-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "USD" | "GBP")}
              >
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </label>
          <label className="block text-xs">
            <span className={labelMuted}>
              {kind === "kit" ? "Страна (карта разбора)" : "Страна маршрута"}
            </span>
            <select
              className={field}
              value={
                kind === "kit" && originRegion !== "uk" && originRegion !== "usa"
                  ? "usa"
                  : originRegion
              }
              onChange={(e) => setOriginRegion(e.target.value as OriginRegion)}
            >
              {(kind === "kit"
                ? (["usa", "uk"] as OriginRegion[])
                : (Object.keys(ORIGIN_REGION_LABELS) as OriginRegion[])
              ).map((r) => (
                <option key={r} value={r}>
                  {ORIGIN_REGION_LABELS[r]}
                </option>
              ))}
            </select>
            {kind === "kit" ? (
              <p className="mt-1 text-[11px] text-zinc-400">
                {originRegion === "uk"
                  ? "Будет карта разбора Англии"
                  : "Будет карта разбора США"}
              </p>
            ) : null}
          </label>
        </div>
        {telegramId ? (
          <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
            Менеджер сделки:{" "}
            <span className="font-semibold text-zinc-800">
              {(() => {
                const client = clientUsers.find(
                  (c) => String(c.telegram_id) === telegramId,
                );
                const mid =
                  Number(client?.manager_user_id || 0) ||
                  Number(currentUser?.id || 0);
                if (!mid) return "назначится автоматически";
                const mgr = managers.find((m) => m.id === mid);
                return mgr ? userLabel(mgr) : `менеджер #${mid}`;
              })()}
            </span>
            {" · "}закреплён при создании клиента
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className={labelMuted}>Срок оплаты, этап 1</span>
            <input
              type="date"
              className={field}
              value={due1}
              onChange={(e) => setDue1(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className={labelMuted}>Срок оплаты, этап 2</span>
            <input
              type="date"
              className={field}
              value={due2}
              onChange={(e) => setDue2(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-xs">
          <span className={labelMuted}>Заметка</span>
          <textarea
            className={field}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Комментарий для клиента…"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !clientUsers.length}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Создаём…" : `Добавить ${DEAL_KIND_LABELS[kind].toLowerCase()}`}
        </button>
      </form>
      ) : null}

      {/* CRM board: clients | cars */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        {/* Mobile tabs */}
        <div className="flex border-b border-zinc-100 lg:hidden">
          <button
            type="button"
            onClick={() => setMobilePane("clients")}
            className={[
              "flex-1 px-3 py-2.5 text-xs font-semibold transition",
              mobilePane === "clients"
                ? "border-b-2 border-emerald-600 text-emerald-800"
                : "text-zinc-500",
            ].join(" ")}
          >
            Клиенты ({filteredClients.length})
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("workspace")}
            disabled={!selectedClient}
            className={[
              "flex-1 px-3 py-2.5 text-xs font-semibold transition disabled:opacity-40",
              mobilePane === "workspace"
                ? "border-b-2 border-emerald-600 text-emerald-800"
                : "text-zinc-500",
            ].join(" ")}
          >
            Авто клиента
          </button>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(240px,300px)_1fr] lg:divide-x lg:divide-zinc-100">
          {/* Left: clients */}
          <aside
            className={[
              "flex min-h-[320px] flex-col bg-zinc-50/40",
              mobilePane === "clients" ? "flex" : "hidden",
              "lg:flex",
            ].join(" ")}
          >
            <div className="border-b border-zinc-100 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Contacts
                  </p>
                  <p className="text-sm font-semibold text-zinc-900">Клиенты</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCompose("client")}
                  className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                >
                  + Новый
                </button>
              </div>
              <input
                className="mt-2.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm outline-none ring-emerald-500/30 placeholder:text-zinc-400 focus:bg-white focus:ring-2"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск…"
              />
            </div>
            <ul className="max-h-[50vh] flex-1 overflow-y-auto lg:max-h-[min(68vh,720px)]">
              {filteredClients.length === 0 ? (
                <li className="px-4 py-10 text-center text-xs text-zinc-500">
                  {query.trim() ? "Никого не найдено" : "Пока нет клиентов"}
                  {!query.trim() ? (
                    <button
                      type="button"
                      onClick={() => setCompose("client")}
                      className="mt-3 block w-full text-xs font-semibold text-emerald-700 underline"
                    >
                      Добавить клиента
                    </button>
                  ) : null}
                </li>
              ) : (
                filteredClients.map((c) => {
                  const active = c.key === selectedClientKey;
                  const initials = (c.label.slice(0, 2) || "CL").toUpperCase();
                  return (
                    <li key={c.key}>
                      <button
                        type="button"
                        onClick={() => selectClient(c.key)}
                        className={[
                          "flex w-full items-center gap-3 border-b border-zinc-100/80 px-3 py-3 text-left transition",
                          active
                            ? "bg-white shadow-[inset_3px_0_0_0_#059669]"
                            : "hover:bg-white/80",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                            active
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-200/80 text-zinc-600",
                          ].join(" ")}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900">
                            {c.label}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {c.deals.length}{" "}
                            {c.deals.length === 1
                              ? "авто"
                              : c.deals.length < 5
                                ? "авто"
                                : "авто"}
                            {" · "}
                            {c.managerLabel}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </aside>

          {/* Right: selected client cars */}
          <section
            className={[
              "flex min-h-[320px] flex-col bg-white",
              mobilePane === "workspace" ? "flex" : "hidden",
              "lg:flex",
            ].join(" ")}
          >
            {selectedClient ? (
              <>
                <div className="border-b border-zinc-100 px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setMobilePane("clients")}
                    className="mb-2 text-[11px] font-semibold text-emerald-700 lg:hidden"
                  >
                    ← К клиентам
                  </button>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                        Client workspace
                      </p>
                      <h3 className="truncate text-base font-semibold text-zinc-900 sm:text-lg">
                        {selectedClient.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {selectedClient.phone ? `${selectedClient.phone} · ` : ""}
                        {selectedClient.username ? (
                          <a
                            href={`https://t.me/${selectedClient.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-emerald-700 underline underline-offset-2"
                          >
                            @{selectedClient.username}
                          </a>
                        ) : null}
                        {selectedClient.username ? " · " : ""}
                        менеджер: {selectedClient.managerLabel}
                      </p>
                    </div>
                    <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
                      {canResetPasswordFor(selectedClient) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPwdOpen((v) => !v);
                            setPwdResult(null);
                            if (!pwdOpen) setPwdValue(generateClientPassword());
                          }}
                          className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100"
                        >
                          {pwdOpen ? "Скрыть" : "Сменить пароль"}
                        </button>
                      ) : clientUserId(selectedClient) && !clientPhoneLogin(selectedClient) ? (
                        <span className="self-center text-[11px] text-zinc-400">
                          Пароль — только у клиентов с телефоном
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openDealCompose(selectedClient.telegramId)}
                        className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                      >
                        + Авто
                      </button>
                    </div>
                  </div>
                  {pwdOpen && canResetPasswordFor(selectedClient) ? (
                    <div className="mt-3 space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3">
                      <p className="text-xs font-medium text-zinc-600">
                        Новый пароль для входа по телефону
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none ring-emerald-500/30 focus:ring-2"
                          value={pwdValue}
                          onChange={(e) => setPwdValue(e.target.value)}
                          minLength={4}
                        />
                        <button
                          type="button"
                          onClick={() => setPwdValue(generateClientPassword())}
                          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Сгенерировать
                        </button>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={pwdSendSms}
                          onChange={(e) => setPwdSendSms(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
                        />
                        Отправить SMS с новым паролем
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resetSelectedPassword()}
                        className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? "Сохраняем…" : "Сохранить пароль"}
                      </button>
                      {pwdResult ? (
                        <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm">
                          <p className="text-xs font-semibold text-emerald-900">
                            Передайте клиенту
                          </p>
                          <p className="mt-1 font-mono text-sm">
                            Логин: <strong>{pwdResult.login}</strong>
                          </p>
                          <p className="font-mono text-sm">
                            Пароль: <strong>{pwdResult.password}</strong>
                          </p>
                          <button
                            type="button"
                            className="mt-1.5 text-xs font-semibold text-emerald-800 underline underline-offset-2"
                            onClick={() => {
                              const text = `Кабинет MG.GROUP\nЛогин: ${pwdResult.login}\nПароль: ${pwdResult.password}\nhttps://mg-group.by/cabinet/`;
                              void navigator.clipboard?.writeText(text);
                              setOk("Логин и пароль скопированы");
                            }}
                          >
                            Скопировать
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto p-3 sm:p-4 lg:max-h-[min(68vh,720px)]">
                  {selectedClient.deals.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-12 text-center">
                      <p className="text-sm font-medium text-zinc-700">
                        У клиента пока нет авто
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Добавьте сделку — она появится в этой колонке
                      </p>
                      <button
                        type="button"
                        onClick={() => openDealCompose(selectedClient.telegramId)}
                        className="mt-4 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                      >
                        Создать сделку
                      </button>
                    </div>
                  ) : (
                    selectedClient.deals.map((deal) => {
                      const p = progress(deal);
                      const cover = dealCoverPhotoUrl(deal);
                      const photoCount = (deal.media || []).filter(
                        (m) => m.kind === "photo",
                      ).length;
                      const k = dealKind(deal);
                      const pct = Math.round(
                        (p.done / Math.max(p.total, 1)) * 100,
                      );
                      return (
                        <article
                          key={deal.id}
                          className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenDeal?.(deal.id)}
                            className="flex w-full gap-3 p-3 text-left transition hover:bg-emerald-50/40 sm:p-3.5"
                          >
                            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200/80 sm:h-[4.5rem] sm:w-28">
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
                                <span className="text-sm font-semibold text-zinc-900">
                                  {deal.title}
                                </span>
                                <span
                                  className={[
                                    "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                    deal.status === "completed"
                                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                                      : deal.status === "cancelled"
                                        ? "bg-rose-50 text-rose-800 ring-1 ring-rose-100"
                                        : "bg-amber-50 text-amber-900 ring-1 ring-amber-100",
                                  ].join(" ")}
                                >
                                  {statusLabel(deal.status)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
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
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                                  <span>
                                    {p.done}/{p.total} · {p.current}
                                  </span>
                                  <span className="tabular-nums">{pct}%</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                                  <div
                                    className="h-full rounded-full bg-emerald-500 transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                              <div className="mt-1.5">
                                <DealClosingStages deal={deal} compact />
                              </div>
                            </div>
                          </button>
                          <div
                            className={[
                              "grid gap-2 border-t border-zinc-100 bg-zinc-50/50 px-3 py-2.5",
                              canAssignRoles ? "sm:grid-cols-3" : "sm:grid-cols-2",
                            ].join(" ")}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canAssignRoles ? (
                              <label className="block text-[11px] font-medium text-zinc-500">
                                Менеджер
                                <select
                                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-emerald-500/30"
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
                            ) : null}
                            <label className="block text-[11px] font-medium text-zinc-500">
                              Срок этапа 1
                              <input
                                type="date"
                                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-emerald-500/30"
                                value={deal.payment_stage1_due || ""}
                                onChange={(e) =>
                                  void patchDeal(deal.id, {
                                    payment_stage1_due: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="block text-[11px] font-medium text-zinc-500">
                              Срок этапа 2
                              <input
                                type="date"
                                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-emerald-500/30"
                                value={deal.payment_stage2_due || ""}
                                onChange={(e) =>
                                  void patchDeal(deal.id, {
                                    payment_stage2_due: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
                <p className="text-sm font-medium text-zinc-700">Выберите клиента</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Слева список контактов — справа его автомобили
                </p>
                <button
                  type="button"
                  onClick={() => setCompose("client")}
                  className="mt-4 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white"
                >
                  + Клиент
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

    </div>
  );
}
