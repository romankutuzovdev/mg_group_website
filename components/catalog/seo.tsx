import Head from "next/head";
import { absoluteUrl } from "@/lib/catalog";
import { COMPANY } from "@/lib/company";

type JsonLd = Record<string, unknown> | Record<string, unknown>[];

type Props = {
  title: string;
  description: string;
  path: string;
  image?: string;
  jsonLd?: JsonLd;
  noindex?: boolean;
};

export function CatalogSEO({ title, description, path, image, jsonLd, noindex }: Props) {
  const url = absoluteUrl(path);
  const ogImage = image
    ? image.startsWith("http")
      ? image
      : absoluteUrl(image)
    : absoluteUrl("/og-image.png");

  const graph = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd
      : [jsonLd]
    : [];

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noindex ? <meta name="robots" content="noindex, follow" /> : null}
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="1200" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:locale" content="ru_BY" />
      <meta property="og:site_name" content={COMPANY.name} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {graph.map((item, i) => (
        <script
          // eslint-disable-next-line react/no-danger
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </Head>
  );
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function serviceJsonLd(opts: {
  name: string;
  description: string;
  path: string;
  areaServed?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    provider: {
      "@type": "AutoDealer",
      name: COMPANY.name,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Гродно",
        streetAddress: "ул. Гаспадарчая 19",
        addressCountry: "BY",
      },
    },
    areaServed: opts.areaServed
      ? { "@type": "City", name: opts.areaServed }
      : { "@type": "Country", name: "Belarus" },
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "AutoDealer", "LocalBusiness"],
    "@id": `${absoluteUrl("/")}#organization`,
    name: COMPANY.name,
    legalName: COMPANY.name,
    description: COMPANY.description,
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/logo.png"),
    },
    image: absoluteUrl("/logo.png"),
    telephone: "+375298668811",
    sameAs: ["https://t.me/Yury_MG_Global"],
    address: {
      "@type": "PostalAddress",
      streetAddress: "ул. Гаспадарчая 19, каб. 340/1, БЦ Марро",
      addressLocality: "Гродно",
      addressCountry: "BY",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 53.6639,
      longitude: 23.8208,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "19:00",
      },
    ],
    areaServed: { "@type": "Country", name: "Belarus" },
    priceRange: "$$",
  };
}

export function itemListJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
