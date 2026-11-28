"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CarFront,
  ChevronRight,
  Route,
  Search,
  Users,
} from "lucide-react";
import { AdminDealsPanel } from "@/components/cabinet/admin-deals-panel";
import { DeleteAccountButton } from "@/components/cabinet/delete-account-button";
import { ConfirmDeleteButton } from "@/components/cabinet/confirm-delete-button";
import { EditClientNameButton } from "@/components/cabinet/edit-client-name-button";
import { CoverThumb, dealCoverPhotoUrl } from "@/components/cabinet/deal-photos";
import { dealMatchesSearch, filterClientGroups } from "@/lib/cabinet/client-search";
import { SearchHighlight } from "@/components/cabinet/search-highlight";
import { DealListControls } from "@/components/cabinet/deal-list-controls";
import { DealPaymentStages } from "@/components/cabinet/deal-payment-stages";
import { DealLocationBadge } from "@/components/cabinet/deal-location-badge";
import { dealLocation, formatPurchaseDate, prepareDealGroups, type DealSort, type DealStatusFilter } from "@/lib/cabinet/deal-list";
import { ApiError } from "@/lib/api/client";
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
  assignClientManager,
  adminDeleteDeal,
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
  const [success, setSuccess] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [editingManager, setEditingManager] = useState<number | null>(null);
  const [selectedManager, setSelectedManager] = useState(0);
  const [assignmentBlocked, setAssignmentBlocked] = useState(false);
  const assignmentDisabled = assigning !== null || assignmentBlocked;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DealStatusFilter>("all");
  const [sort, setSort] = useState<DealSort>("default");
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
      setAssignmentBlocked(false);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить клиентов",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const managers = useMemo(
    () => users.filter((u) => u.is_manager || u.is_admin)
      .sort((a, b) => userName(a).localeCompare(userName(b), "ru")),
    [users],
  );

  const assignManager = async (userId: number, managerId: number) => {
    const client = users.find((u) => u.id === userId);
    if (!client || !managerId || assignmentDisabled) return;
    setAssigning(userId);
    setError(null);
    setSuccess(null);
    try {
      const updated = await assignClientManager(userId, managerId, Number(client.manager_user_id || 0));
      const assignee = managers.find((u) => u.id === updated.manager_user_id);
      // Preserve the confirmed assignment even if the following refresh fails.
      setUsers((current) => current.map((u) => u.id === userId ? updated : u));
      setDeals((current) => current.map((deal) =>
        deal.client_telegram_id === updated.telegram_id
          ? {
              ...deal,
              manager_user_id: updated.manager_user_id,
              manager_name: assignee ? userName(assignee) : "",
              manager_telegram_id: assignee?.telegram_id || 0,
              manager_username: assignee?.username || "",
            }
          : deal,
      ));
      setEditingManager(null);
      await load();
      const name = managers.find((u) => u.id === managerId);
      setSuccess(
        managerId === manager.id
          ? `Клиент ${userName(client)} и его сделки закреплены за вами.`
          : `Клиент ${userName(client)} и его сделки переданы менеджеру ${name ? userName(name) : `#${managerId}`}.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEditingManager(null);
        if (!(await load())) {
          setAssignmentBlocked(true);
          setError("Менеджер клиента изменился, но список не удалось обновить. Нажмите «Обновить список» и повторите выбор.");
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Не удалось назначить менеджера");
    } finally {
      setAssigning(null);
    }
  };

  const allGroups = useMemo(() => buildGroups(users, deals), [users, deals]);
  const mineGroups = useMemo(
    () => allGroups.filter((g) => isMine(g, manager.id)),
    [allGroups, manager.id],
  );
  const groups = scope === "mine" ? mineGroups : allGroups;
  const scopeDeals = useMemo(() => groups.flatMap((g) => g.deals), [groups]);
  const visible = useMemo(() => prepareDealGroups(filterClientGroups(groups, query), statusFilter, sort), [groups, query, statusFilter, sort]);
  const hasFilters = Boolean(query.trim() || statusFilter !== "all");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Клиенты"
        description="Все клиенты компании и их сделки. Можно забрать клиента себе или передать другому менеджеру вместе со сделками. Во вкладке «Мои» — ваши клиенты."
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
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Клиент, машина, лот или VIN"
          aria-label="Поиск клиентов и автомобилей по имени, VIN или номеру лота"
          autoCapitalize="none"
          spellCheck={false}
          className={`${inputClass} pl-9`}
        />
      </label>

      <DealListControls status={statusFilter} sort={sort} onStatusChange={setStatusFilter} onSortChange={setSort} />

      {error ? (
        <Notice tone="danger" action={<Button size="sm" variant="ghost" onClick={() => void load()}>Обновить список</Button>}>
          {error}
        </Notice>
      ) : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={hasFilters ? "Автомобили не найдены" : "Клиентов пока нет"}
          description={
            hasFilters
              ? "Измените поисковый запрос или выбранный статус."
              : scope === "mine"
                ? "Создайте клиента кнопкой «+ Клиент» или откройте «Все клиенты» и нажмите «Забрать себе»."
                : "Клиенты появятся, когда зарегистрируются или их создаст менеджер."
          }
        />
      ) : (
        <div className="space-y-4">
          {visible.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-3">
                <Avatar name={group.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {group.name}
                  </p>
                  {group.sub ? (
                    <p className="truncate text-xs text-zinc-500">
                      {group.sub}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
                  {group.userId && (manager.is_admin || users.some((client) => client.id === group.userId && client.manager_user_id === manager.id)) ? (
                    <EditClientNameButton
                      client={users.find((client) => client.id === group.userId)!}
                      onUpdated={(updated) => {
                        setUsers((current) => current.map((client) => client.id === updated.id ? updated : client));
                        setDeals((current) => current.map((deal) => deal.client_telegram_id === updated.telegram_id ? { ...deal, client_name: userName(updated) } : deal));
                      }}
                    />
                  ) : null}
                  {group.managerId === manager.id ? (
                    <Badge tone="success">Мой</Badge>
                  ) : group.managerName ? (
                    <span className="text-xs text-zinc-500">
                      Менеджер: {group.managerName}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">Без менеджера</span>
                  )}
                  {group.userId ? (
                    <>
                      {group.managerId !== manager.id ? (
                        <Button
                          size="sm"
                          disabled={assignmentDisabled}
                          onClick={() => void assignManager(group.userId!, manager.id)}
                        >
                          {assigning === group.userId ? "Сохраняем…" : "Забрать себе"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={assignmentDisabled}
                        aria-expanded={editingManager === group.userId}
                        onClick={() => {
                          setEditingManager(editingManager === group.userId ? null : group.userId!);
                          const current = users.find((u) => u.id === group.userId);
                          setSelectedManager(Number(current?.manager_user_id || manager.id));
                          setError(null);
                          setSuccess(null);
                        }}
                      >
                        {group.managerId ? "Сменить менеджера" : "Назначить менеджера"}
                      </Button>
                    </>
                  ) : null}
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
                </div>
              </div>
              {group.userId && editingManager === group.userId ? (
                <form
                  className="space-y-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void assignManager(group.userId!, selectedManager);
                  }}
                >
                  <label className="block text-xs font-medium text-zinc-600" htmlFor={`client-manager-${group.userId}`}>
                    Ответственный менеджер
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      id={`client-manager-${group.userId}`}
                      className={`${inputClass} sm:max-w-xs`}
                      value={selectedManager}
                      onChange={(e) => setSelectedManager(Number(e.target.value))}
                      disabled={assignmentDisabled}
                      required
                    >
                      <option value={0} disabled>Выберите менеджера</option>
                      {managers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {userName(u)}{u.id === manager.id ? " (вы)" : ""}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="primary" disabled={!selectedManager || assignmentDisabled}>
                      {assigning === group.userId ? "Сохраняем…" : "Сохранить"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={assigning !== null} onClick={() => setEditingManager(null)}>
                      Отмена
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500">Клиент и все его сделки перейдут выбранному менеджеру.</p>
                </form>
              ) : null}
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
                    const cover = dealCoverPhotoUrl(deal);
                    const found = dealMatchesSearch(deal, query);
                    return (
                      <li key={deal.id} className="deal-status-card relative" data-location={dealLocation(deal).key} data-search-match={found || undefined}>
                        <button
                          type="button"
                          onClick={() => onOpenDeal(deal.id)}
                          className="deal-status-card-open flex w-full items-start gap-3 py-3 pl-4 pr-12 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/40"
                        >
                          <span className="block h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-200 sm:h-16 sm:w-24">
                            <CoverThumb
                              key={cover}
                              src={cover}
                              alt={deal.title}
                              fallback={
                                <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-zinc-500">
                                  <CarFront className="h-5 w-5" aria-hidden="true" />
                                  Нет фото
                                </span>
                              }
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <span className="min-w-0 text-sm font-medium text-zinc-900 [overflow-wrap:anywhere]">
                                <SearchHighlight text={deal.title} query={query} />
                              </span>
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                {found ? <Badge tone="success">Найдено</Badge> : null}
                                <Badge tone={dealStatusTone(deal.status)} dot>
                                  {dealStatusLabel(deal.status)}
                                </Badge>
                              </span>
                            </span>
                            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                              <span className="min-w-0 [overflow-wrap:anywhere]">
                                <span className="text-zinc-500">VIN: </span>
                                <span className="font-mono text-zinc-700">
                                  {deal.vin ? <SearchHighlight text={deal.vin} query={query} identifier /> : "не указан"}
                                </span>
                              </span>
                              <span className="min-w-0 [overflow-wrap:anywhere]">
                                <span className="text-zinc-500">Лот: </span>
                                <span className="font-mono text-zinc-700">
                                  {deal.lot_number ? <SearchHighlight text={`#${deal.lot_number}`} query={query} identifier /> : "не указан"}
                                </span>
                              </span>
                            </span>
                            <span className="mt-1 block text-xs text-zinc-500 [overflow-wrap:anywhere]">
                              {[
                                DEAL_KIND_LABELS[dealKind(deal)],
                                regionLabel(deal.origin_region),
                                deal.dismantle_yard &&
                                  DISMANTLE_YARD_LABELS[deal.dismantle_yard],
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <span className="mt-1 block text-xs text-zinc-500">Дата покупки: <span className="text-zinc-700">{formatPurchaseDate(deal.purchase_date)}</span></span>
                            <DealLocationBadge deal={deal} />
                            <DealPaymentStages deal={deal} />
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
                          <ChevronRight className="h-4 w-4 shrink-0 self-center text-zinc-300" aria-hidden="true" />
                        </button>
                        {manager.is_admin || group.managerId === manager.id || deal.manager_user_id === manager.id ? (
                          <ConfirmDeleteButton
                            label={`Удалить автомобиль ${deal.title}`}
                            title={`Удалить «${deal.title}»?`}
                            description={`Клиент: ${group.name}. ${[deal.vin && `VIN: ${deal.vin}`, deal.lot_number && `Лот: #${deal.lot_number}`].filter(Boolean).join(". ")}. Карточка автомобиля, её фото и данные сделки будут удалены. Отменить удаление нельзя.`}
                            className="absolute right-2 top-2 h-8 w-8 px-0"
                            onDelete={async () => {
                              await adminDeleteDeal(deal.id);
                              setDeals((current) => current.filter((item) => item.id !== deal.id));
                              setSuccess(`Автомобиль «${deal.title}» удалён.`);
                            }}
                          />
                        ) : null}
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
