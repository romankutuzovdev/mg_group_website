"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";

export default function PartsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/mashinokomplekt/");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center pt-16 text-sm text-muted-foreground">
      Переход на страницу машинокомплектов…
    </div>
  );
}
