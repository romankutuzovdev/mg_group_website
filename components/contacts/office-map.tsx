import { COMPANY, OFFICE_LOCATION, officeMapEmbedUrl } from "@/lib/company";

type Props = {
  className?: string;
};

export function OfficeMap({ className = "h-72" }: Props) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-bg-base ${className}`}>
      <iframe
        title={`${COMPANY.name} — ${OFFICE_LOCATION.name}`}
        src={officeMapEmbedUrl()}
        className="absolute inset-0 h-full w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}
