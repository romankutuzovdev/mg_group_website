"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { adminDeleteUser } from "@/lib/api/cabinet";

/** Удаление аккаунта в два шага: кнопка → подтверждение с именем и телефоном. */
export function DeleteAccountButton({
  userId,
  label,
  onDeleted,
}: {
  userId: number;
  /** Имя и телефон — показываются в подтверждении. */
  label: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminDeleteUser(userId);
      setConfirming(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить аккаунт");
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setConfirming(true);
          setError(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Удалить аккаунт
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
      <p className="font-semibold">Удалить аккаунт «{label}»?</p>
      <p className="mt-1 text-rose-800">
        Клиент больше не сможет войти, его избранное, поиски и просчёты удалятся. Отменить нельзя.
      </p>
      {error ? <p className="mt-2 font-medium text-rose-700">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {busy ? "Удаляем…" : "Да, удалить"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
