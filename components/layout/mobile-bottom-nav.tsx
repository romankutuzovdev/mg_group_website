"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import {
  Car,
  Home,
  MoreHorizontal,
  Package,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Главная",
    icon: Home,
    match: (p) => p === "/",
  },
  {
    href: "/avto/",
    label: "Каталог",
    icon: Car,
    match: (p) =>
      p.startsWith("/avto") ||
      p.startsWith("/avto-pod-zakaz"),
  },
  {
    href: "/mashinokomplekt/",
    label: "Комплекты",
    icon: Package,
    match: (p) =>
      p.startsWith("/mashinokomplekt") ||
      p.startsWith("/kuplennye-mashinokomplekty"),
  },
  {
    href: "/cabinet/",
    label: "Кабинет",
    icon: UserRound,
    match: (p) => p.startsWith("/cabinet"),
  },
];

const MORE_LINKS = [
  { href: "/avto/", label: "Каталог авто" },
  { href: "/calculator/", label: "Калькулятор" },
  { href: "/otzyvy/", label: "Отзывы" },
  { href: "/kuplennye-avto/", label: "Купленные авто" },
  { href: "/mashinokomplekt/usa/", label: "Комплекты из США" },
  { href: "/mashinokomplekt/uk/", label: "Комплекты из Англии" },
  { href: "/kuplennye-mashinokomplekty/", label: "Купленные комплекты" },
  { href: "/contacts/", label: "Контакты" },
  { href: "/faq/", label: "FAQ" },
  { href: "/about/", label: "О нас" },
];

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = router.pathname;
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-zinc-200 bg-white/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      aria-label="Нижнее меню"
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch justify-between px-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium transition",
                isActive ? "text-[#1B5E20]" : "text-zinc-500 active:text-zinc-800",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-10 items-center justify-center rounded-full",
                  isActive && "bg-[#1B5E20]/10",
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "stroke-[2.25px]")} aria-hidden />
              </span>
              <span className="truncate leading-none">{tab.label}</span>
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium text-zinc-500 active:text-zinc-800"
              aria-label="Ещё"
            >
              <span className="flex h-7 w-10 items-center justify-center rounded-full">
                <MoreHorizontal className="h-5 w-5" aria-hidden />
              </span>
              <span className="leading-none">Ещё</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="z-[120] max-h-[75vh] rounded-t-2xl border-zinc-200 bg-white px-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <SheetHeader className="px-4 pb-1 text-left">
              <SheetTitle className="text-base">Меню</SheetTitle>
            </SheetHeader>
            <ul className="divide-y divide-zinc-100 overflow-y-auto">
              {MORE_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-[#111] active:bg-zinc-50"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
