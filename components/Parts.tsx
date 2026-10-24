import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import type { ReactNode, SVGProps } from "react";

interface PartsProps {
  dictionary: Dictionary;
}

function IconMark({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/** Custom marks — not stock Lucide set */
const PART_ICONS = [
  // Original parts — stamped crate / OEM plate
  function OriginalPartsIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <IconMark {...props}>
        <rect x="8" y="12" width="32" height="26" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 20h32" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 12V9.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 32 9.5V12" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="24" cy="29" r="5.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M24 25.5v7M20.5 29h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12 24h6M30 24h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      </IconMark>
    );
  },
  // Fast delivery — route arc + container
  function FastShipIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <IconMark {...props}>
        <path
          d="M9 30c4-8 10-12 15-12s11 4 15 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="9" cy="30" r="2.2" fill="currentColor" />
        <circle cx="39" cy="30" r="2.2" fill="currentColor" />
        <rect x="16" y="14" width="16" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 19.5h16M24 14v11" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
        <path d="M14 36h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M18 36l2.5 4h7L30 36" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </IconMark>
    );
  },
  // Any parts — gear + bolt hybrid
  function AnyPartsIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <IconMark {...props}>
        <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="24" cy="24" r="2.4" fill="currentColor" />
        <path
          d="M24 9v4M24 35v4M9 24h4M35 24h4M13.2 13.2l2.8 2.8M32 32l2.8 2.8M13.2 34.8l2.8-2.8M32 16l2.8-2.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M33 11l4 1.2-1.2 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </IconMark>
    );
  },
  // Quality — inspection loupe over part silhouette
  function QualityIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <IconMark {...props}>
        <path
          d="M12 32c0-6.627 5.373-12 12-12s12 5.373 12 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M16 32h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M18 32v3.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V32" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="28" cy="16" r="7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M33.2 21.2L39 27" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M25 16h6M28 13v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      </IconMark>
    );
  },
] as const;

const Parts = ({ dictionary }: PartsProps) => {
  return (
    <section id="parts" className="relative overflow-hidden bg-muted/50 py-24">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-[0.03]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-16 text-center">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl">{dictionary.parts.title}</h2>
          <p className="text-xl text-muted-foreground">{dictionary.parts.subtitle}</p>
        </div>

        <div className="mb-16 grid grid-cols-1 gap-8 md:grid-cols-2">
          {dictionary.parts.features.map((feature, index) => {
            const Icon = PART_ICONS[index] ?? PART_ICONS[0];
            return (
              <Card key={feature.title} className="bg-background/50 p-8 backdrop-blur-sm">
                <div className="flex items-start gap-6">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#2E7D32]/25 bg-gradient-to-br from-[#2E7D32]/12 to-transparent text-[#1b5e20] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                    <Icon className="h-9 w-9" />
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#2E7D32]/80" />
                  </div>
                  <div>
                    <h3 className="mb-3 text-xl font-semibold">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="border-primary/10 bg-primary/5 p-8 text-center">
          <h3 className="mb-4 text-2xl font-semibold">{dictionary.parts.cta.title}</h3>
          <p className="mb-6 text-muted-foreground">{dictionary.parts.cta.description}</p>
          <Button variant="consultation" asChild size="lg" className="min-w-[200px]">
            <a
              href={dictionary.global.tgLink}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap"
              aria-label="Получить консультацию в Telegram"
            >
              <MessageCircle className="mr-2 h-5 w-5" />
              {dictionary.parts.cta.button}
            </a>
          </Button>
        </Card>
      </div>
    </section>
  );
};

export default Parts;
