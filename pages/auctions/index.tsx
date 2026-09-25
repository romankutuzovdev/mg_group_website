"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";

/** /auctions/ → каталог авто под заказ (США). UK-комплекты: /mashinokomplekt/uk/ */
export default function AuctionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/avto/usa/#lots");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center pt-16 text-sm text-muted-foreground">
      Переход к авто под заказ…
    </div>
  );
}
