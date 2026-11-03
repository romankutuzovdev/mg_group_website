"use client";

/**
 * Cabinet application shell: left sidebar navigation on desktop, compact top
 * bar with a slide-down menu on mobile. Pure layout — no data fetching.
 */

import Link from "next/link";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ArrowUpRight, LogOut, Menu, X } from "lucide-react";
import type { CabinetUser } from "@/lib/api/cabinet";
import { cn } from "@/lib/utils";
import { Avatar, Badge } from "@/components/cabinet/ui";

export type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number | string | null;
  href?: string;
  section?: string;
};

type Props = {
  user: CabinetUser;
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  children: ReactNode;
  /** Right side of the mobile/desktop top bar. */
  topbarActions?: ReactNode;
  /** Small text under the brand in the sidebar. */
  workspaceLabel?: string;
};

export function roleBadge(user: CabinetUser) {
  if (user.is_admin) return <Badge tone="success">Админ</Badge>;
  if (user.is_manager) return <Badge tone="info">Менеджер</Badge>;
  return <Badge>Клиент</Badge>;
}

export function userDisplayName(user: CabinetUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Пользователь";
}

export function userHandle(user: CabinetUser): string {
  if (user.phone) return user.phone;
  if (user.username) return `@${user.username}`;
  return `ID ${user.telegram_id}`;
}

function NavList({
  items,
  activeId,
  onSelect,
  className,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const sections = Array.from(new Set(items.map((i) => i.section || "")));
  return (
    <nav className={cn("flex flex-col gap-4", className)} aria-label="Разделы кабинета">
      {sections.map((section) => (
        <div key={section || "main"}>
          {section ? (
            <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              {section}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {items
              .filter((i) => (i.section || "") === section)
              .map((item) => {
                const active = item.id === activeId;
                const Icon = item.icon;
                const inner = (
                  <>
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-emerald-600" : "text-zinc-400 group-hover:text-zinc-600",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge != null && item.badge !== "" && item.badge !== 0 ? (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                          active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600",
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                    {item.href ? (
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                    ) : null}
                  </>
                );
                const cls = cn(
                  "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900",
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link href={item.href} className={cls}>
                        {inner}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => onSelect(item.id)} className={cls}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ workspaceLabel }: { workspaceLabel?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" title="На сайт">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-bold tracking-wide text-white">
        MG
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[13px] font-semibold text-zinc-900">MG.GROUP</span>
        <span className="block truncate text-[11px] text-zinc-500">
          {workspaceLabel || "Личный кабинет"}
        </span>
      </span>
    </Link>
  );
}

export function CabinetShell({
  user,
  items,
  activeId,
  onSelect,
  onLogout,
  children,
  topbarActions,
  workspaceLabel,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeId]);

  const activeItem = items.find((i) => i.id === activeId);

  return (
    <div className="flex min-h-[100dvh] bg-zinc-50 text-zinc-900">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="px-4 pb-3 pt-4">
          <Brand workspaceLabel={workspaceLabel} />
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-2">
          <NavList items={items} activeId={activeId} onSelect={onSelect} />
        </div>
        <div className="border-t border-zinc-200 p-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={userDisplayName(user)} src={user.photo_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-zinc-900">
                {userDisplayName(user)}
              </p>
              <p className="truncate text-[11px] text-zinc-500">{userHandle(user)}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Выйти"
              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2">{roleBadge(user)}</div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <div className="lg:hidden">
              <Brand workspaceLabel={workspaceLabel} />
            </div>
            <div className="hidden min-w-0 items-center gap-2 text-[13px] text-zinc-500 lg:flex">
              <span className="text-zinc-400">Кабинет</span>
              <span className="text-zinc-300">/</span>
              <span className="truncate font-medium text-zinc-900">{activeItem?.label}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {topbarActions}
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-md border border-zinc-200 bg-white p-2 text-zinc-700 shadow-sm lg:hidden"
                aria-label="Меню"
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div className="border-t border-zinc-200 bg-white px-3 py-3 lg:hidden">
              <NavList items={items} activeId={activeId} onSelect={onSelect} />
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={userDisplayName(user)} src={user.photo_url} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{userDisplayName(user)}</p>
                    <p className="truncate text-[11px] text-zinc-500">{userHandle(user)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700"
                >
                  <LogOut className="h-3.5 w-3.5" /> Выйти
                </button>
              </div>
            </div>
          ) : null}
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Bare centered shell for auth screens and standalone admin pages. */
export function CabinetFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900">{children}</div>;
}
