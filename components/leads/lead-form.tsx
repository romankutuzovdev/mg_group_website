"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/site/button";
import { submitLead } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { CAR_FINDER } from "@/lib/company";

const inputClass =
  "mt-2 w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent";

type LeadFormProps = {
  source?: string;
};

export function LeadForm({ source = "contacts" }: LeadFormProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    setSending(true);

    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const messenger = String(data.get("messenger") || "Telegram");
    const model = String(data.get("model") || "").trim();
    const budget = String(data.get("budget") || "").trim();

    try {
      if (isApiEnabled()) {
        await Promise.race([
          submitLead({
            name,
            phone,
            messenger,
            model,
            budget,
            source,
            page: typeof window !== "undefined" ? window.location.pathname : undefined,
          }).catch((err) => console.error("Lead API error:", err)),
          new Promise((r) => setTimeout(r, 4500)),
        ]);
      }
    } finally {
      try {
        await router.push("/thanks/");
      } catch {
        if (typeof window !== "undefined") window.location.assign("/thanks/");
      }
      setSending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="relative card-premium rounded-2xl p-5 sm:p-8">
      <p className="lux-kicker">Заявка на подбор</p>
      <h3 className="mt-2 font-display text-xl font-semibold">Бесплатный подбор под ваш запрос</h3>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-text-primary">
          Имя
          <input name="name" required className={inputClass} placeholder="Как к вам обращаться" />
        </label>
        <label className="block text-sm font-medium text-text-primary">
          Телефон
          <input
            name="phone"
            required
            type="tel"
            className={inputClass}
            placeholder="+375 ..."
          />
        </label>
        <label className="block text-sm font-medium text-text-primary">
          Мессенджер
          <select name="messenger" className={inputClass} defaultValue="Telegram">
            {CAR_FINDER.messengers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-text-primary">
          Бюджет
          <select name="budget" className={inputClass} defaultValue={CAR_FINDER.budgets[1]}>
            {CAR_FINDER.budgets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-text-primary sm:col-span-2">
          Модель / пожелания
          <input
            name="model"
            className={inputClass}
            placeholder={CAR_FINDER.modelPlaceholder}
          />
        </label>
      </div>

      <Button type="submit" className="mt-6 w-full sm:w-auto" disabled={sending}>
        {sending ? "Отправляем…" : "Отправить заявку"}
      </Button>
    </form>
  );
}
