import { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { GetStaticProps } from "next";

/** Раздел временно скрыт. Редирект из getStaticProps ломает static export. */
export default function PurchasedCarsPage() {
  const router = useRouter();
  useEffect(() => {
    void router.replace("/avto/");
  }, [router]);

  return (
    <Head>
      <meta httpEquiv="refresh" content="0; url=/avto/" />
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: {},
});
