"use client";

import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/cabinet/ui";

export function ConfirmDeleteButton({
  label,
  title,
  description,
  onDelete,
  className,
  disabled = false,
  previewSrc,
  children,
}: {
  label: string;
  title: string;
  description: string;
  onDelete: () => Promise<void>;
  className?: string;
  disabled?: boolean;
  previewSrc?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить. Попробуйте снова.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => {
      if (busy) return;
      setOpen(next);
      setError(null);
    }}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          title={label}
          disabled={disabled}
          className={`text-rose-700 hover:bg-rose-50 hover:text-rose-800 ${className || ""}`}
        >
          {children || <Trash2 className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg border-zinc-200 bg-white text-zinc-900">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="break-words text-zinc-600">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="Удаляемое фото автомобиля" className="max-h-64 w-full rounded-md object-contain" />
        ) : null}
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel disabled={busy} className="mt-0">Отмена</AlertDialogCancel>
          <Button variant="danger" size="md" disabled={busy} onClick={() => void remove()}>
            {busy ? "Удаляем…" : "Да, удалить"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
