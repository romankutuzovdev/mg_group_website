"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, ChevronRight, Route, Search, Users } from "lucide-react";
import { AdminDealsPanel } from "@/components/cabinet/admin-deals-panel";
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

type ClientGroup = { key: string; name: string; sub: string; deals: Deal[] };

function userName(u: CabinetUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.phone || `Клиент #${u.id}`;
}

function buildGroups(users: CabinetUser[], deals: Deal[], managerId: number): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const u of users) {
    if (u.id === managerId) continue;
    groups.set(String(u.telegram_id), {
      key: String(u.telegram_id),
      name: userName(u),
      sub: u.phone || (u.username ? `@${u.username}` : ""),
      deals: [],
    });
  }
  for (const deal of deals) {
    const key = String(deal.client_telegram_id || `deal-${deal.id}`);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: deal.client_name || "Клиент",
        sub: deal.client_username ? `@${deal.client_username}` : "",
        deals: [],
      });
    }
    groups.get(key)?.deals.push(deal);
  }
  return Array.from(groups.values()).sort(
    (a, b) => b.deals.length - a.deals.length || a.name.localeCompare(b.name, "ru"),
  );
}

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextUsers, nextDeals] = await Promise.all([fetchAdminUsers(), fetchAdminDeals()]);
      setUsers(nextUsers);
      setDeals(nextDeals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить клиентов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => buildGroups(users, deals, manager.id), [users, deals, manager.id]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      [g.name, g.sub, ...g.deals.flatMap((d) => [d.title, d.lot_number, d.vin])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [groups, query]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Мои клиенты"
        description="Ваши клиенты и их сделки. Откройте сделку, чтобы отметить этапы."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setCompose((v) => (v === "client" ? null : "client"))}
            >
              {compose === "client" ? "Скрыть форму" : "+ Клиент"}
            </Button>
            <Button onClick={() => setCompose((v) => (v === "deal" ? null : "deal"))}>
              {compose === "deal" ? "Скрыть форму" : "+ Сделка"}
            </Button>
          </>
        }
      />

      {compose ? (
        <AdminDealsPanel
          key={compose}
          formOnly={compose}
          currentUser={manager}
          onCreated={() => void load()}
          onClientCreated={() => void load()}
          onOpenDeal={onOpenDeal}
        />
      ) : null}

      <StatRow className="md:grid-cols-3">
        <StatTile label="Клиенты" value={groups.length} icon={<Users className="h-4 w-4" />} />
        <StatTile
          label="Сделки"
          value={deals.length}
          icon={<BriefcaseBusiness className="h-4 w-4" />}
        />
        <StatTile
          label="В работе"
          value={deals.filter((d) => d.status === "active").length}
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
          description={query ? "Измените запрос." : "Администратор закрепит за вами клиентов."}
        />
      ) : (
        <div className="space-y-4">
          {visible.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
                <Avatar name={group.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">{group.name}</p>
                  {group.sub ? <p className="truncate text-xs text-zinc-500">{group.sub}</p> : null}
                </div>
              </div>
              {group.deals.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-zinc-500">Сделок пока нет</p>
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
                                deal.dismantle_yard && DISMANTLE_YARD_LABELS[deal.dismantle_yard],
                                deal.lot_number && `#${deal.lot_number}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <span className="mt-2 flex items-center gap-2">
                              <Progress value={(p.done / p.total) * 100} className="max-w-[160px]" />
                              <span className="truncate text-xs text-zinc-500">{p.current}</span>
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
