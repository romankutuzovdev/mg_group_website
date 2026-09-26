import { GetStaticProps } from "next";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { absoluteUrl } from "@/lib/catalog";
import { getDictionary } from "@/lib/dictionary";

/** Legacy URL — canonical catalog is /avto/usa/ */
export default function AvtoPodZakazRedirect() {
  const router = useRouter();
  const target = "/avto/usa/";

  useEffect(() => {
    void router.replace(target);
  }, [router]);

  return (
    <>
      <Head>
        <title>Авто из США | MG.GROUP</title>
        <meta name="robots" content="noindex, follow" />
        <meta httpEquiv="refresh" content={`0;url=${target}`} />
        <link rel="canonical" href={absoluteUrl(target)} />
      </Head>
      <p className="p-8 text-center text-sm text-zinc-500">
        Перенаправление в{" "}
        <a href={target} className="font-medium text-primary underline">
          каталог авто из США
        </a>
        …
      </p>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
