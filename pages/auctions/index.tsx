import { GetStaticProps } from "next";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { absoluteUrl } from "@/lib/catalog";
import { getDictionary } from "@/lib/dictionary";

/** /auctions/ → каталог авто под заказ (США). UK-комплекты: /mashinokomplekt/uk/ */
export default function AuctionsRedirectPage() {
  const router = useRouter();
  const target = "/avto/usa/";

  useEffect(() => {
    void router.replace(`${target}#lots`);
  }, [router]);

  return (
    <>
      <Head>
        <title>Авто из США | MG.GROUP</title>
        <meta name="robots" content="noindex, follow" />
        <meta httpEquiv="refresh" content={`0;url=${target}`} />
        <link rel="canonical" href={absoluteUrl(target)} />
      </Head>
      <p className="flex min-h-[40vh] items-center justify-center pt-16 text-sm text-muted-foreground">
        Переход к{" "}
        <a href={`${target}#lots`} className="ml-1 font-medium text-primary underline">
          каталогу авто из США
        </a>
        …
      </p>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
