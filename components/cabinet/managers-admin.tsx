"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type CabinetUser,
  adminSetUserManager,
  fetchAdminUsers,
  fetchMe,
  getCabinetToken,
} from "@/lib/api/cabinet";

function userLabel(u: CabinetUser): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  const phone = (u.phone || "").trim();
  const nick = u.username && !/^\d{9,15}$/.test(u.username) ? `@${u.username}` : "";
  if (name && phone) return `${name} · ${phone}`;
  if (phone) return phone;
  if (name && nick) return `${name} (${nick})`;
  return name || nick || `TG ${u.telegram_id}`;
}

function roleLabel(u: CabinetUser): string {
  if (u.is_admin) return "Администратор";
  if (u.is_manager) return "Менеджер";
  return "Клиент";
}

function initials(u: CabinetUser): string {
  const src = userLabel(u).replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, " ").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (src.slice(0, 2) || "??").toUpperCase();
}

export function ManagersAdmin() {
  const [me, setMe] = useState<CabinetUser | null>(null);
  const [users, setUsers] = useState<CabinetUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!getCabinetToken()) {
      setMe(null);
      setUsers([]);
      setLoading(false);
      return;
    }
    try {
      const [who, list] = await Promise.all([fetchMe(), fetchAdminUsers()]);
      setMe(who);
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить пользователей");
      setMe(null);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...users].sort((a, b) => {
      const rank = (u: CabinetUser) => (u.is_admin ? 0 : u.is_manager ? 1 : 2);
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return userLabel(a).localeCompare(userLabel(b), "ru");
    });
    if (!q) return list;
    return list.filter((u) => {
      const hay = [
        userLabel(u),
        u.phone || "",
        u.username || "",
        String(u.telegram_id || ""),
        roleLabel(u),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, query]);

  const managersCount = users.filter((u) => u.is_manager && !u.is_admin).length;

  const toggleManager = async (u: CabinetUser) => {
    if (u.is_admin || busyId != null) return;
    setBusyId(u.id);
    setError(null);
    setOk(null);
    try {
      const next = await adminSetUserManager(u.id, !u.is_manager);
      setUsers((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      setOk(
        next.is_manager
          ? `${userLabel(next)} назначен менеджером`
          : `${userLabel(next)} снят с роли менеджера`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить роль");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 shadow-sm">
        Загрузка…
      </div>
    );
  }

  if (!me) {
    return (
      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-zinc-600">Войдите в кабинет как администратор.</p>
        <Link
          href="/cabinet/"
          className="inline-flex rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white"
        >
          В кабинет
        </Link>
      </div>
    );
  }

  if (!me.is_admin) {
    return (
      <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-amber-950">
          Назначать менеджеров может только администратор
        </p>
        <Link
          href="/cabinet/"
          className="inline-flex rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-semibold text-amber-900"
        >
          Назад в кабинет
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Назначьте сотрудников — они смогут вести сделки и сроки оплаты.
        Сейчас менеджеров:{" "}
        <span className="font-semibold tabular-nums text-zinc-800">{managersCount}</span>
      </p>

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

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <label className="block text-[11px] font-medium text-zinc-500">
            Поиск
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя, телефон, @username…"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            {users.length === 0
              ? "Пока никто не входил в кабинет"
              : "Никого не найдено по запросу"}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {filtered.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-zinc-50/80"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {u.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.photo_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-zinc-200"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                      {initials(u)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {userLabel(u)}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {roleLabel(u)}
                      {u.created_at ? ` · с ${u.created_at.slice(0, 10)}` : ""}
                      {u.telegram_id ? ` · TG ${u.telegram_id}` : ""}
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
                    disabled={busyId != null}
                    onClick={() => void toggleManager(u)}
                    className={[
                      "shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition disabled:opacity-50",
                      u.is_manager
                        ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        : "bg-emerald-600 text-white hover:bg-emerald-500",
                    ].join(" ")}
                  >
                    {busyId === u.id
                      ? "…"
                      : u.is_manager
                        ? "Снять"
                        : "Назначить"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
