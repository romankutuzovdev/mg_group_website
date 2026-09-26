import { GetStaticProps } from "next";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { absoluteUrl } from "@/lib/catalog";
import { getDictionary } from "@/lib/dictionary";

/** Legacy URL — canonical is /mashinokomplekt/ */
export default function PartsRedirectPage() {
  const router = useRouter();
  const target = "/mashinokomplekt/";

  useEffect(() => {
    void router.replace(target);
  }, [router]);

  return (
    <>
      <Head>
        <title>Машинокомплекты | MG.GROUP</title>
        <meta name="robots" content="noindex, follow" />
        <meta httpEquiv="refresh" content={`0;url=${target}`} />
        <link rel="canonical" href={absoluteUrl(target)} />
      </Head>
      <p className="flex min-h-[40vh] items-center justify-center pt-16 text-sm text-muted-foreground">
        Переход на{" "}
        <a href={target} className="ml-1 font-medium text-primary underline">
          страницу машинокомплектов
        </a>
        …
      </p>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
