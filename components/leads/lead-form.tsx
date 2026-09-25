"use client";

import { FormEvent, useState } from "react";
import { AnchorButton, Button } from "@/components/site/button";
import { submitLead } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { CAR_FINDER, consultationMessage } from "@/lib/company";

const inputClass =
  "mt-2 w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent";

type LeadFormProps = {
  source?: string;
};

export function LeadForm({ source = "contacts" }: LeadFormProps) {
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const messenger = String(data.get("messenger") || "Telegram");
    const model = String(data.get("model") || "").trim();
    const budget = String(data.get("budget") || "").trim();

    if (isApiEnabled()) {
      try {
        await submitLead({
          name,
          phone,
          messenger,
          model,
          budget,
          source,
          page: typeof window !== "undefined" ? window.location.pathname : undefined,
        });
      } catch (err) {
        console.error("Lead API error:", err);
      }
    }

    const text = [
      "Здравствуйте! Заявка с сайта.",
      `Источник: ${source}`,
      name && `Имя: ${name}`,
      phone && `Телефон: ${phone}`,
      `Мессенджер: ${messenger}`,
      model && `Модель: ${model}`,
      budget && `Бюджет: ${budget}`,
    ]
      .filter(Boolean)
      .join("\n");

    setSent(true);
    window.open(consultationMessage(text), "_blank", "noopener,noreferrer");
  }

  if (sent) {
    return (
      <div className="card-premium rounded-2xl p-6 text-center md:p-10">
        <p className="lux-kicker">Заявка готова</p>
        <h3 className="mt-3 font-display text-2xl font-semibold">
          Откройте Telegram и отправьте сообщение
        </h3>
        <p className="mt-3 text-sm text-text-secondary">
          Мы уже подставили текст заявки — осталось нажать «Отправить» в Telegram.
        </p>
        <AnchorButton
          href={consultationMessage("Здравствуйте! Оставил заявку на подбор авто на сайте.")}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6"
        >
          Написать в Telegram
        </AnchorButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative card-premium rounded-2xl p-5 sm:p-8">
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

      <Button type="submit" className="mt-6 w-full sm:w-auto">
        Отправить в Telegram
      </Button>
    </form>
  );
}
