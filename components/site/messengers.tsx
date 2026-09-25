import type { Messenger } from "@/lib/company";

const ICONS: Record<Messenger, { label: string; path: string }> = {
  viber: {
    label: "Viber",
    path: "M11.4 0C5.1 0 0 5 0 11.1c0 2.2.6 4.3 1.8 6.1L.6 22.4c-.1.4.3.8.7.7l5.4-1.5c1.7.9 3.6 1.4 5.5 1.4h.1C18.6 23 24 18 24 11.9 24 5.3 18.2 0 11.4 0zm.1 20.8h-.1c-1.7 0-3.4-.4-4.9-1.3l-.4-.2-3.2.9.9-3.1-.2-.4c-1.1-1.6-1.7-3.5-1.7-5.5C1.9 6 6.3 1.7 11.5 1.7c5.5 0 9.9 4.3 9.9 9.6 0 5.3-4.5 9.5-9.9 9.5z",
  },
  telegram: {
    label: "Telegram",
    path: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 8.2-1.8 8.6c-.1.6-.5.7-1 .5l-2.8-2.1-1.4 1.3c-.1.2-.3.3-.6.3l.2-2.9 5.3-4.8c.2-.2 0-.3-.3-.1l-6.5 4.1-2.8-.9c-.6-.2-.6-.6.1-.9l11-4.2c.5-.2 1 .1.6 1.1z",
  },
  whatsapp: {
    label: "WhatsApp",
    path: "M12 0C5.4 0 0 5.3 0 11.9c0 2.1.6 4.1 1.6 5.9L0 24l6.4-1.6c1.7.9 3.6 1.4 5.6 1.4h.1C18.7 23.8 24 18.5 24 11.9 24 5.3 18.6 0 12 0zm6.5 16.8c-.3.8-1.6 1.4-2.6 1.6-.7.1-1.6.2-4.6-1-3.9-1.5-6.4-5.3-6.6-5.5-.2-.3-1.6-2.1-1.6-4s1-2.8 1.4-3.2c.3-.4.8-.5 1.1-.5h.8c.3 0 .6 0 .8.6.3.8.9 2.7 1 2.9.1.2.1.4 0 .7-.1.2-.2.4-.4.6l-.6.7c-.2.2-.4.4-.2.8.2.4 1 1.6 2.1 2.6 1.5 1.3 2.7 1.7 3.1 1.9.4.2.6.1.8-.1.2-.3.9-1 1.1-1.4.2-.3.5-.3.8-.2.3.1 2 .9 2.4 1.1.3.2.6.2.7.4.1.1.1.8-.2 1.6z",
  },
};

export function MessengerIcon({ type, className = "h-4 w-4" }: { type: Messenger; className?: string }) {
  const icon = ICONS[type];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d={icon.path} />
    </svg>
  );
}

export function MessengerLinks({
  messengers,
  className = "",
}: {
  messengers: { type: Messenger; href: string }[];
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {messengers.map((item) => (
        <a
          key={item.type}
          href={item.href}
          target={item.href.startsWith("http") ? "_blank" : undefined}
          rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="text-text-muted transition hover:text-accent"
          aria-label={ICONS[item.type].label}
          title={ICONS[item.type].label}
        >
          <MessengerIcon type={item.type} />
        </a>
      ))}
    </span>
  );
}
