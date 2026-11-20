"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronRight,
  Route,
  Search,
  Users,
} from "lucide-react";
import { AdminDealsPanel } from "@/components/cabinet/admin-deals-panel";
import { DeleteAccountButton } from "@/components/cabinet/delete-account-button";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Progress,
  Spinner,
  StatRow,
  StatTile,
  dealStatusLabel,
  dealStatusTone,
  inputClass,
} from "@/components/cabinet/ui";
import {
  type CabinetUser,
  type Deal,
  DEAL_KIND_LABELS,
  DISMANTLE_YARD_LABELS,
  dealKind,
  dealProgress,
  fetchAdminDeals,
  fetchAdminUsers,
  regionLabel,
} from "@/lib/api/cabinet";

type ClientGroup = {
  key: string;
  name: string;
  sub: string;
  deals: Deal[];
  userId?: number;
  /** Менеджер клиента: из карточки клиента или из сделки. */
  managerId: number;
  managerName: string;
};

function userName(u: CabinetUser): string {
  return (
    [u.first_name, u.last_name].filter(Boolean).join(" ") ||
    u.phone ||
    `Клиент #${u.id}`
  );
}

function isStaff(u: CabinetUser) {
  return Boolean(u.is_manager || u.is_admin || u.is_logist);
}

/** Все клиенты (сотрудники не в списке) с их сделками. */
function buildGroups(users: CabinetUser[], deals: Deal[]): ClientGroup[] {
  const staffNames = new Map<number, string>();
  for (const u of users) if (isStaff(u)) staffNames.set(u.id, userName(u));

  const groups = new Map<string, ClientGroup>();
  for (const u of users) {
    if (isStaff(u)) continue;
    const managerId = Number(u.manager_user_id || 0);
    groups.set(String(u.telegram_id), {
      key: String(u.telegram_id),
      name: userName(u),
      sub: u.phone || (u.username ? `@${u.username}` : ""),
      deals: [],
      userId: u.id,
      managerId,
      managerName: staffNames.get(managerId) || "",
    });
  }
  for (const deal of deals) {
    const key = String(deal.client_telegram_id || `deal-${deal.id}`);
    let group = groups.get(key);
    if (!group) {
      // Сделка на сотрудника или клиента, которого нет в списке.
      group = {
        key,
        name: deal.client_name || "Клиент",
        sub: deal.client_username ? `@${deal.client_username}` : "",
        deals: [],
        managerId: 0,
        managerName: "",
      };
      groups.set(key, group);
    }
    if (!group.managerId && deal.manager_user_id) {
      group.managerId = Number(deal.manager_user_id);
      group.managerName =
        deal.manager_name || staffNames.get(group.managerId) || "";
    }
    group.deals.push(deal);
  }
  return Array.from(groups.values()).sort(
    (a, b) =>
      b.deals.length - a.deals.length || a.name.localeCompare(b.name, "ru"),
  );
}

function isMine(group: ClientGroup, managerId: number) {
  return (
    group.managerId === managerId ||
    group.deals.some((d) => d.manager_user_id === managerId)
  );
}

type Scope = "all" | "mine";

export function ManagerClientsPanel({
  manager,
  onOpenDeal,
}: {
  manager: CabinetUser;
  onOpenDeal: (id: number) => void;
}) {
  const [users, setUsers] = useState<CabinetUser[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState<"deal" | "client" | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  /** Клиент, для которого открыта форма «Создать сделку». */
  const [dealFor, setDealFor] = useState<number | undefined>(undefined);
  const composeRef = useRef<HTMLDivElement | null>(null);

  const openDealFor = (telegramId: number) => {
    setDealFor(telegramId);
    setCompose("deal");
    requestAnimationFrame(() =>
      composeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextUsers, nextDeals] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminDeals(),
      ]);
      setUsers(nextUsers);
      setDeals(nextDeals);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить клиентов",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allGroups = useMemo(() => buildGroups(users, deals), [users, deals]);
  const mineGroups = useMemo(
    () => allGroups.filter((g) => isMine(g, manager.id)),
    [allGroups, manager.id],
  );
  const groups = scope === "mine" ? mineGroups : allGroups;
  const scopeDeals = useMemo(() => groups.flatMap((g) => g.deals), [groups]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      [
        g.name,
        g.sub,
        g.managerName,
        ...g.deals.flatMap((d) => [d.title, d.lot_number, d.vin]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [groups, query]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Клиенты"
        description="Все клиенты компании и их сделки. Во вкладке «Мои» — клиенты, которых ведёте вы. Менять можно только своих."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDealFor(undefined);
                setCompose((v) => (v === "client" ? null : "client"));
              }}
            >
              {compose === "client" ? "Скрыть форму" : "+ Клиент"}
            </Button>
            <Button
              onClick={() => {
                setDealFor(undefined);
                setCompose((v) => (v === "deal" ? null : "deal"));
              }}
            >
              {compose === "deal" ? "Скрыть форму" : "+ Сделка"}
            </Button>
          </>
        }
      />

      {compose ? (
        <div ref={composeRef} className="scroll-mt-24">
          <AdminDealsPanel
            key={`${compose}-${dealFor ?? ""}`}
            formOnly={compose}
            initialClientTelegramId={compose === "deal" ? dealFor : undefined}
            currentUser={manager}
            onCreated={() => void load()}
            onClientCreated={() => void load()}
            onOpenDeal={onOpenDeal}
          />
        </div>
      ) : null}

      <div className="flex w-fit gap-1 rounded-md bg-zinc-100 p-0.5 text-sm">
        {(
          [
            ["all", "Все клиенты", allGroups.length],
            ["mine", "Мои клиенты", mineGroups.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`rounded px-3 py-1.5 font-medium ${scope === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"}`}
          >
            {label} <span className="tabular-nums text-zinc-400">{count}</span>
          </button>
        ))}
      </div>

      <StatRow className="md:grid-cols-3">
        <StatTile
          label="Клиенты"
          value={groups.length}
          icon={<Users className="h-4 w-4" />}
        />
        <StatTile
          label="Сделки"
          value={scopeDeals.length}
          icon={<BriefcaseBusiness className="h-4 w-4" />}
        />
        <StatTile
          label="В работе"
          value={scopeDeals.filter((d) => d.status === "active").length}
          icon={<Route className="h-4 w-4" />}
        />
      </StatRow>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Клиент, машина, лот или VIN"
          className={`${inputClass} pl-9`}
        />
      </label>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={query ? "Ничего не найдено" : "Клиентов пока нет"}
          description={
            query
              ? "Измените запрос."
              : scope === "mine"
                ? "Создайте клиента кнопкой «+ Клиент» или попросите администратора закрепить за вами."
                : "Клиенты появятся, когда зарегистрируются или их создаст менеджер."
          }
        />
      ) : (
        <div className="space-y-4">
          {visible.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
                <Avatar name={group.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {group.name}
                  </p>
                  {group.sub ? (
                    <p className="truncate text-xs text-zinc-500">
                      {group.sub}
                    </p>
                  ) : null}
                </div>
                <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {group.managerId === manager.id ? (
                    <Badge tone="success">Мой</Badge>
                  ) : group.managerName ? (
                    <span className="text-xs text-zinc-500">
                      Менеджер: {group.managerName}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">Без менеджера</span>
                  )}
                  {/* Сделку сервер даёт создать только своему клиенту. */}
                  {group.userId &&
                  group.managerId === manager.id &&
                  Number(group.key) > 0 ? (
                    <button
                      type="button"
                      onClick={() => openDealFor(Number(group.key))}
                      className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      + Создать сделку
                    </button>
                  ) : null}
                </span>
              </div>
              {group.deals.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <p className="text-[13px] text-zinc-500">Сделок пока нет</p>
                  {group.userId && group.managerId === manager.id ? (
                    <DeleteAccountButton
                      userId={group.userId}
                      label={[group.name, group.sub].filter(Boolean).join(", ")}
                      onDeleted={() => void load()}
                    />
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {group.deals.map((deal) => {
                    const p = dealProgress(deal);
                    return (
                      <li key={deal.id}>
                        <button
                          type="button"
                          onClick={() => onOpenDeal(deal.id)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-zinc-900">
                              {deal.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-zinc-500">
                              {[
                                DEAL_KIND_LABELS[dealKind(deal)],
                                regionLabel(deal.origin_region),
                                deal.dismantle_yard &&
                                  DISMANTLE_YARD_LABELS[deal.dismantle_yard],
                                deal.lot_number && `#${deal.lot_number}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <span className="mt-2 flex items-center gap-2">
                              <Progress
                                value={(p.done / p.total) * 100}
                                className="max-w-[160px]"
                              />
                              <span className="truncate text-xs text-zinc-500">
                                {p.current}
                              </span>
                            </span>
                          </span>
                          <Badge tone={dealStatusTone(deal.status)} dot>
                            {dealStatusLabel(deal.status)}
                          </Badge>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
