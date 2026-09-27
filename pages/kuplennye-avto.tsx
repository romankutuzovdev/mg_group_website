import { GetStaticProps } from "next";

/** Раздел временно скрыт с сайта — редирект в каталог. */
export default function PurchasedCarsPage() {
  return null;
}

export const getStaticProps: GetStaticProps = async () => ({
  redirect: {
    destination: "/avto/",
    permanent: false,
  },
});
