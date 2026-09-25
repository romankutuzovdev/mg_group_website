import Head from 'next/head';
import type { Dictionary } from '@/lib/dictionary';
import { absoluteUrl } from '@/lib/catalog';

type JsonLd = Record<string, unknown> | Record<string, unknown>[];

interface SEOProps {
  dictionary: Dictionary;
  lang: string;
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  /** When true, ask crawlers not to index this page */
  noindex?: boolean;
  jsonLd?: JsonLd;
}

function resolveOgImage(image: string | undefined, fallback: string) {
  const src = image?.trim() || fallback;
  if (/^https?:\/\//i.test(src)) return src;
  return absoluteUrl(src);
}

const SEO = ({ dictionary, lang, title, description, path, image, noindex, jsonLd }: SEOProps) => {
  const { metadata } = dictionary;
  const pageTitle = title ?? metadata.title;
  const pageDescription = description ?? metadata.description;
  const canonical = absoluteUrl(path ?? '/');
  const ogImage = resolveOgImage(image, metadata.ogImage);
  const graph = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Head>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="keywords" content={metadata.keywords} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta charSet="utf-8" />
      <meta name="theme-color" content={metadata.themeColor} />
      {noindex ? <meta name="robots" content="noindex, follow" /> : null}

      {/* Open Graph — absolute image URL required for Telegram / messengers */}
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="1200" />
      <meta property="og:image:alt" content="MG.GROUP" />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="MG.GROUP" />
      <meta property="og:locale" content={lang === 'ru' ? 'ru_RU' : lang} />

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={ogImage} />

      <link rel="canonical" href={canonical} />

      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

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
};

export default SEO;
