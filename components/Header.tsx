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
      { href: "/kuplennye-avto/", label: "Купленные авто" },
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
          "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-2 text-[12px] font-semibold outline-none transition xl:px-2.5 xl:text-[13px]",
          open
            ? "bg-accent/10 text-[#0D3F10]"
            : "text-[#1a1a1a] hover:bg-zinc-100",
        )}
      >
        {group.label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[120] w-[min(92vw,280px)] rounded-xl border-zinc-200 bg-white p-2 shadow-lg"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {group.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group.items.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="cursor-pointer rounded-lg p-0">
            <Link href={item.href} className="block px-3 py-2.5 text-sm font-medium text-[#111]">
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
      className="fixed inset-x-0 top-0 z-[100] border-b border-zinc-200 bg-white/95 shadow-sm backdrop-blur-md"
      role="banner"
      style={{
        backgroundColor: "rgba(255,255,255,0.95)",
        color: "#111111",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="mx-auto max-w-[90rem] px-3 sm:px-4">
        <div className="flex h-14 items-center justify-between gap-2">
          <Link
            href={isHome ? "/#hero" : "/"}
            className="flex shrink-0 items-center gap-2 font-bold"
            style={{ color: "#111111" }}
            aria-label="На главную"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo_new.svg"
              alt={dictionary.footer.company.name}
              className="h-8 w-8 object-contain sm:h-9 sm:w-9"
            />
            <span className="hidden text-sm sm:inline">
              {dictionary.footer.company.name}
            </span>
          </Link>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex xl:gap-1"
            role="navigation"
            aria-label="Основная навигация"
          >
            {PRODUCT_GROUPS.map((group) => (
              <GroupMenu key={group.id} group={group} pathname={pathname} />
            ))}

            <span className="mx-1 hidden h-4 w-px bg-zinc-200 xl:block" aria-hidden />

            {SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-1.5 py-2 text-[12px] font-medium hover:bg-zinc-100 xl:px-2 xl:text-[13px]",
                  pathActive(pathname, item.href) ? "text-[#0D3F10]" : "text-[#1a1a1a]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <a
              href={`tel:${dictionary.contact.phone}`}
              className="hidden items-center gap-1.5 text-sm font-semibold lg:inline-flex"
              style={{ color: "#111111" }}
              aria-label={`Позвонить по номеру ${dictionary.contact.phone}`}
            >
              <Phone className="h-4 w-4" aria-hidden />
              {dictionary.contact.phone}
            </a>

            <Link
              href="/cabinet/"
              className={cn(
                "hidden items-center justify-center gap-2 rounded-md bg-[#1B5E20] px-3 py-2 text-sm font-medium text-white hover:bg-[#0D3F10] lg:inline-flex",
                pathActive(pathname, "/cabinet/") && "ring-2 ring-[#0D3F10]/ring-offset-2",
              )}
              aria-label="Личный кабинет"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              Кабинет
            </Link>

            <a
              href={`tel:${dictionary.contact.phone}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-zinc-100 lg:hidden"
              style={{ color: "#111111" }}
              aria-label={`Позвонить по номеру ${dictionary.contact.phone}`}
            >
              <Phone className="h-5 w-5" aria-hidden="true" />
            </a>

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 bg-white hover:bg-zinc-100 lg:hidden"
                  style={{ color: "#111111" }}
                  aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] overflow-y-auto bg-white sm:w-[360px]">
                <SheetHeader>
                  <SheetTitle className="text-left" style={{ color: "#111111" }}>
                    {dictionary.footer.company.name}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-8 flex flex-col gap-6">
                  <nav className="flex flex-col gap-4" aria-label="Мобильная навигация">
                    {PRODUCT_GROUPS.map((group) => {
                      const expanded = mobileOpen === group.id;
                      return (
                        <div key={group.id} className="rounded-xl border border-zinc-200">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold"
                            style={{ color: "#111111" }}
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
                            <div className="border-t border-zinc-100 px-2 pb-2 pt-1">
                              {group.items.map((item) => (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onClick={() => setIsOpen(false)}
                                  className="block rounded-lg px-2 py-2.5 text-sm font-medium text-[#1a1a1a] hover:bg-zinc-100"
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
                          className="rounded-md px-2 py-2.5 text-left text-base hover:bg-zinc-100"
                          style={{ color: "#1a1a1a" }}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </nav>
                  <Link
                    href="/cabinet/"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#1B5E20] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0D3F10] lg:hidden"
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
