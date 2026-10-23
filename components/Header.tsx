"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { ChevronDown, Menu, Phone, UserRound } from "lucide-react";
import { useState } from "react";
import type { Dictionary } from "@/lib/dictionary";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface HeaderProps {
  dictionary: Dictionary;
}

type NavLink = { href: string; label: string };

type NavGroup = {
  id: string;
  label: string;
  href: string;
  accent?: boolean;
  items: NavLink[];
};

const PRODUCT_GROUPS: NavGroup[] = [
  {
    id: "catalog",
    label: "Каталог авто",
    href: "/avto/",
    accent: true,
    items: [
      { href: "/avto/", label: "Весь каталог" },
      { href: "/avto/usa/", label: "Авто из США" },
      { href: "/avto/china/", label: "Авто из Китая" },
      { href: "/avto/korea/", label: "Авто из Кореи" },
      { href: "/avto/uk/", label: "Авто из Англии" },
    ],
  },
  {
    id: "kits",
    label: "Машинокомплекты",
    href: "/mashinokomplekt/",
    accent: true,
    items: [
      { href: "/mashinokomplekt/usa/", label: "Комплекты из США" },
      { href: "/mashinokomplekt/uk/", label: "Комплекты из Англии" },
      { href: "/kuplennye-mashinokomplekty/", label: "Купленные комплекты" },
    ],
  },
];

const SECONDARY: NavLink[] = [
  { href: "/calculator/", label: "Калькулятор" },
  { href: "/otzyvy/", label: "Отзывы" },
  { href: "/about/", label: "О нас" },
  { href: "/faq/", label: "FAQ" },
  { href: "/contacts/", label: "Контакты" },
];

function pathActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0] || "/";
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(base);
}

function GroupMenu({ group, pathname }: { group: NavGroup; pathname: string }) {
  const open = group.items.some((i) => pathActive(pathname, i.href));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-semibold outline-none transition xl:px-3 xl:text-[14px]",
          open
            ? "bg-primary/10 text-emerald-900"
            : "text-stone-800 hover:bg-stone-100/80",
        )}
      >
        {group.label}
        <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[120] w-[min(92vw,280px)] rounded-2xl border-stone-200/80 bg-white/95 p-2 shadow-xl backdrop-blur-xl"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          {group.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group.items.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="cursor-pointer rounded-xl p-0">
            <Link href={item.href} className="block px-3 py-2 text-[13px] font-medium text-stone-900">
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const Header = ({ dictionary }: HeaderProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState<string | null>("catalog");
  const router = useRouter();
  const isHome = router.pathname === "/";
  const pathname = router.pathname.endsWith("/")
    ? router.pathname
    : `${router.pathname}/`;

  return (
    <header
      className="fixed inset-x-0 top-0 z-[100] border-b border-white/40 bg-white/70 shadow-[0_1px_0_rgba(28,25,23,0.04)] backdrop-blur-xl"
      role="banner"
      style={{
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="mx-auto max-w-[90rem] px-3 sm:px-5">
        <div className="flex h-16 items-center justify-between gap-3 sm:h-[4.25rem]">
          <Link
            href={isHome ? "/#hero" : "/"}
            className="flex shrink-0 items-center gap-2.5 text-stone-900 sm:gap-3"
            aria-label="На главную"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo_new.svg"
              alt={dictionary.footer.company.name}
              className="h-9 w-9 object-contain sm:h-10 sm:w-10"
            />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
              MG<span className="text-primary">.</span>GROUP
            </span>
          </Link>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex xl:gap-1.5"
            role="navigation"
            aria-label="Основная навигация"
          >
            {PRODUCT_GROUPS.map((group) => (
              <GroupMenu key={group.id} group={group} pathname={pathname} />
            ))}

            <span className="mx-1.5 hidden h-4 w-px bg-zinc-200 xl:block" aria-hidden />

            {SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "cursor-pointer whitespace-nowrap rounded-md px-2 py-2 text-[13px] font-medium hover:bg-stone-100/80 xl:px-2.5 xl:text-[14px]",
                  pathActive(pathname, item.href) ? "text-emerald-900" : "text-stone-800",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <a
              href={`tel:${dictionary.contact.phone}`}
              className="hidden items-center gap-1.5 text-[14px] font-semibold text-stone-900 lg:inline-flex"
              aria-label={`Позвонить по номеру ${dictionary.contact.phone}`}
            >
              <Phone className="h-4 w-4" aria-hidden />
              {dictionary.contact.phone}
            </a>

            <Link
              href="/cabinet/"
              className={cn(
                "hidden cursor-pointer items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-primary hover:text-stone-950 lg:inline-flex",
                pathActive(pathname, "/cabinet/") && "ring-2 ring-primary ring-offset-2",
              )}
              aria-label="Личный кабинет"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              Кабинет
            </Link>

            <a
              href={`tel:${dictionary.contact.phone}`}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-stone-900 hover:bg-stone-100 lg:hidden"
              aria-label={`Позвонить по номеру ${dictionary.contact.phone}`}
            >
              <Phone className="h-5 w-5" aria-hidden="true" />
            </a>

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-stone-300/80 bg-white/80 text-stone-900 hover:bg-stone-100 lg:hidden"
                  aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] overflow-y-auto bg-stone-50 sm:w-[360px]">
                <SheetHeader>
                  <SheetTitle className="text-left text-base font-semibold text-stone-900">
                    MG<span className="text-primary">.</span>GROUP
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-8 flex flex-col gap-6">
                  <nav className="flex flex-col gap-4" aria-label="Мобильная навигация">
                    {PRODUCT_GROUPS.map((group) => {
                      const expanded = mobileOpen === group.id;
                      return (
                        <div key={group.id} className="rounded-2xl border border-stone-200 bg-white">
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-left text-[13px] font-semibold text-stone-900"
                            onClick={() =>
                              setMobileOpen(expanded ? null : group.id)
                            }
                            aria-expanded={expanded}
                          >
                            {group.label}
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 transition",
                                expanded && "rotate-180",
                              )}
                            />
                          </button>
                          {expanded ? (
                            <div className="border-t border-stone-100 px-2 pb-2 pt-1">
                              {group.items.map((item) => (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onClick={() => setIsOpen(false)}
                                  className="block cursor-pointer rounded-xl px-2 py-2 text-[13px] font-medium text-stone-800 hover:bg-stone-100"
                                >
                                  {item.label}
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    <div className="flex flex-col gap-1 pt-1">
                      {SECONDARY.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className="cursor-pointer rounded-xl px-2 py-2 text-left text-[13px] text-stone-800 hover:bg-stone-100"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </nav>
                  <Link
                    href="/cabinet/"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary hover:text-stone-950 lg:hidden"
                  >
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    Кабинет
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
