import { findSearchMatch } from "@/lib/cabinet/client-search";

export function SearchHighlight({ text, query, identifier = false }: { text: string; query: string; identifier?: boolean }) {
  const match = findSearchMatch(text, query, identifier);
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.start)}
      <mark className="rounded bg-emerald-200 text-emerald-950">{text.slice(match.start, match.end)}</mark>
      {text.slice(match.end)}
    </>
  );
}
