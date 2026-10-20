"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mg_dev_notice_dismissed_v1";

/** Плашка: сайт в разработке, кабинет уже работает. */
export function DevNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* private mode — показываем */
    }
    setVisible(true);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className={cn(
        "border-b border-amber-200/80 bg-amber-50 text-amber-950",
        "px-3 py-2 sm:px-4",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3 sm:items-center">
        <p className="min-w-0 flex-1 text-center text-xs leading-relaxed sm:text-left sm:text-sm">
          Сайт ещё в разработке — отдельные разделы и функции могут работать
          не полностью.{" "}
          <span className="font-medium">
            Личный кабинет уже доступен
          </span>
          : можно войти, смотреть сделки и общаться с менеджером.{" "}
          <Link
            href="/cabinet/"
            className="font-semibold underline underline-offset-2 hover:text-amber-800"
          >
            Перейти в кабинет
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрыть уведомление"
          className="shrink-0 rounded-md p-1 text-amber-800/70 transition hover:bg-amber-100 hover:text-amber-950"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
