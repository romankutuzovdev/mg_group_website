import { GetStaticProps } from "next";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { getDictionary } from "@/lib/dictionary";

/** Legacy URL — canonical catalog is /avto/usa/ */
export default function AvtoPodZakazRedirect() {
  const router = useRouter();
  useEffect(() => {
    void router.replace("/avto/usa/");
  }, [router]);

  return (
    <>
      <Head>
        <title>Авто из США | MG.GROUP</title>
        <meta httpEquiv="refresh" content="0;url=/avto/usa/" />
        <link rel="canonical" href="https://www.multiglobalgroup.com/avto/usa/" />
      </Head>
      <p className="p-8 text-center text-sm text-zinc-500">
        Перенаправление в{" "}
        <a href="/avto/usa/" className="font-medium text-primary underline">
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
