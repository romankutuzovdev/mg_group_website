"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type CabinetUser,
  adminSetUserRoles,
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
  const roles = [u.is_manager ? "Менеджер" : "", u.is_logist ? "Логист" : ""].filter(Boolean);
  return roles.length ? roles.join(" · ") : "Клиент";
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
      const rank = (u: CabinetUser) =>
        u.is_admin ? 0 : u.is_manager ? 1 : u.is_logist ? 2 : 3;
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
  const logistsCount = users.filter((u) => u.is_logist && !u.is_admin).length;

  const toggleRole = async (u: CabinetUser, role: "manager" | "logist") => {
    if (u.is_admin || busyId != null) return;
    setBusyId(u.id);
    setError(null);
    setOk(null);
    try {
      const on = role === "manager" ? !u.is_manager : !u.is_logist;
      const next = await adminSetUserRoles(
        u.id,
        role === "manager" ? { is_manager: on } : { is_logist: on },
      );
      setUsers((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      const name = role === "manager" ? "менеджером" : "логистом";
      const roleName = role === "manager" ? "менеджера" : "логиста";
      setOk(on ? `${userLabel(next)} назначен ${name}` : `${userLabel(next)} снят с роли ${roleName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить роль");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm px-4 py-10 text-center text-[13px] text-zinc-500">
        Загрузка…
      </div>
    );
  }

  if (!me) {
    return (
      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white shadow-sm p-6 text-center">
        <p className="text-[13px] text-zinc-600">Войдите в кабинет как администратор.</p>
        <Link
          href="/cabinet/"
          className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3.5 text-[13px] font-medium text-white"
        >
          В кабинет
        </Link>
      </div>
    );
  }

  if (!me.is_admin) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-[13px] font-medium text-amber-950">
          Назначать менеджеров может только администратор
        </p>
        <Link
          href="/cabinet/"
          className="inline-flex h-9 items-center rounded-md border border-amber-300 bg-white px-3.5 text-[13px] font-medium text-amber-900"
        >
          Назад в кабинет
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-500">
        Менеджер ведёт своих клиентов и их сделки, логист — только логистику. Менеджеров:{" "}
        <span className="font-medium tabular-nums text-zinc-900">{managersCount}</span>, логистов:{" "}
        <span className="font-medium tabular-nums text-zinc-900">{logistsCount}</span>
      </p>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800">
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
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-900">
          {ok}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: имя, телефон, @username"
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px] shadow-sm outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-zinc-500">
            {users.length === 0
              ? "Пока никто не входил в кабинет"
              : "Никого не найдено по запросу"}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {filtered.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-zinc-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {u.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.photo_url}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-zinc-200"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200">
                      {initials(u)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-zinc-900">
                      {userLabel(u)}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {roleLabel(u)}
                      {u.created_at ? ` · с ${u.created_at.slice(0, 10)}` : ""}
                      {u.telegram_id ? ` · TG ${u.telegram_id}` : ""}
                    </p>
                  </div>
                </div>
                {u.is_admin ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                    Админ
                  </span>
                ) : (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {(["manager", "logist"] as const).map((role) => {
                      const on = role === "manager" ? u.is_manager : u.is_logist;
                      const label = role === "manager" ? "Менеджер" : "Логист";
                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={busyId != null}
                          aria-pressed={Boolean(on)}
                          title={on ? `Снять роль: ${label}` : `Назначить: ${label}`}
                          onClick={() => void toggleRole(u, role)}
                          className={[
                            "inline-flex h-8 items-center rounded-md px-3 text-xs font-medium shadow-sm transition disabled:opacity-50",
                            on
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                          ].join(" ")}
                        >
                          {busyId === u.id ? "…" : on ? `✓ ${label}` : `+ ${label}`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
