"use client";

import { useRef, useState, type FormEvent } from "react";
import { Badge, Button, Card, CardBody, CardHeader, textareaClass } from "@/components/cabinet/ui";
import {
  adminSetClaimStatus,
  createDealClaim,
  dealHasArrived,
  mediaAbsoluteUrl,
  type Deal,
  type DealClaim,
} from "@/lib/api/cabinet";

const MAX_PHOTOS = 10;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU");
}

function ClaimItem({
  claim,
  isManager,
  busy,
  onToggle,
}: {
  claim: DealClaim;
  isManager: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const resolved = claim.status === "resolved";
  return (
    <li className="rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">{formatDate(claim.created_at)}</span>
        <Badge tone={resolved ? "success" : "warning"}>{resolved ? "Решено" : "В работе"}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-900">{claim.text}</p>
      {claim.photos.length ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {claim.photos.map((photo) => (
            <a
              key={photo.id}
              href={mediaAbsoluteUrl(photo.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square overflow-hidden rounded-md border border-zinc-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaAbsoluteUrl(photo.url)}
                alt={photo.filename || "Фото к заметке"}
                className="h-full w-full object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}
      {isManager ? (
        <Button size="sm" className="mt-3" disabled={busy} onClick={onToggle}>
          {resolved ? "Вернуть в работу" : "Отметить решённым"}
        </Button>
      ) : null}
    </li>
  );
}

/** После получения машины клиент пишет, что не доехало или потерялось, и прикладывает фото. */
export function DealClaims({
  deal,
  isManager = false,
  onUpdated,
}: {
  deal: Deal;
  isManager?: boolean;
  onUpdated?: (deal: Deal) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const claims = deal.claims || [];
  const canCreate = !isManager && dealHasArrived(deal);
  if (!canCreate && !claims.length) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setError("Опишите, что не доехало или потерялось");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onUpdated?.(await createDealClaim(deal.id, text.trim(), files));
      setText("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить заметку");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (claim: DealClaim) => {
    setBusy(true);
    setError(null);
    try {
      const next = claim.status === "resolved" ? "open" : "resolved";
      onUpdated?.(await adminSetClaimStatus(deal.id, claim.id, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={isManager ? "Заметки клиента" : "Что-то не доехало?"}
        description={
          isManager ? undefined : "Напишите, что потерялось или не доехало, и приложите фото."
        }
      />
      <CardBody className="space-y-4">
        {canCreate ? (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <textarea
              aria-label="Что не доехало или потерялось"
              className={textareaClass}
              rows={3}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Например: нет правого зеркала и комплекта ключей"
            />
            <input
              ref={fileInput}
              aria-label="Фото"
              type="file"
              accept="image/*"
              multiple
              className="block w-full text-[13px] text-zinc-600"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                setFiles(picked.slice(0, MAX_PHOTOS));
                setError(picked.length > MAX_PHOTOS ? `Возьмём первые ${MAX_PHOTOS} фото` : null);
              }}
            />
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Отправляем…" : "Отправить менеджеру"}
            </Button>
          </form>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {claims.length ? (
          <ul className="space-y-3">
            {claims.map((claim) => (
              <ClaimItem
                key={claim.id}
                claim={claim}
                isManager={isManager}
                busy={busy}
                onToggle={() => void toggle(claim)}
              />
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}
