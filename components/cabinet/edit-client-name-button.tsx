"use client";

import { useState, type FormEvent } from "react";
import { PencilLine } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button, inputClass, labelClass } from "@/components/cabinet/ui";
import { adminRenameClient, type CabinetUser } from "@/lib/api/cabinet";

export function EditClientNameButton({ client, onUpdated }: { client: CabinetUser; onUpdated: (client: CabinetUser) => void }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(client.first_name);
  const [lastName, setLastName] = useState(client.last_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !firstName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await adminRenameClient(client.id, { first_name: firstName.trim(), last_name: lastName.trim() });
      onUpdated(updated);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось переименовать клиента");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (busy) return;
      if (next) {
        setFirstName(client.first_name);
        setLastName(client.last_name);
        setError(null);
      }
      setOpen(next);
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Переименовать клиента ${[client.first_name, client.last_name].filter(Boolean).join(" ")}`}>
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" /> Переименовать
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-lg border-zinc-200 bg-white text-zinc-900">
        <DialogHeader>
          <DialogTitle>Переименовать клиента</DialogTitle>
          <DialogDescription className="text-zinc-600">Имя будет обновлено в списке клиентов и его сделках.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <label className={labelClass}>
            Имя или название
            <input className={`${inputClass} mt-1.5`} value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={80} required disabled={busy} autoComplete="off" />
          </label>
          <label className={labelClass}>
            Фамилия
            <input className={`${inputClass} mt-1.5`} value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={80} disabled={busy} autoComplete="off" />
          </label>
          {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit" variant="primary" disabled={busy || !firstName.trim()}>{busy ? "Сохраняем…" : "Сохранить"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
