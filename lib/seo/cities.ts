export type CitySlug =
  | "minsk"
  | "grodno"
  | "brest"
  | "vitebsk"
  | "gomel"
  | "mogilev";

export type SeoCity = {
  slug: CitySlug;
  name: string;
  /** «в Гродно», «в Минске» */
  inLocative: string;
  /** «Гродно», для title без предлога */
  nameShort: string;
  /** краткий абзац про доставку/выдачу */
  deliveryNote: string;
};

export const CITIES: SeoCity[] = [
  {
    slug: "minsk",
    name: "Минск",
    nameShort: "Минск",
    inLocative: "в Минске",
    deliveryNote:
      "Офис MG.GROUP в Гродно; до Минска организуем выдачу и доставку комплекта или авто после таможни. Удобно для клиентов из столицы и области.",
  },
  {
    slug: "grodno",
    name: "Гродно",
    nameShort: "Гродно",
    inLocative: "в Гродно",
    deliveryNote:
      "Главный офис MG.GROUP — г. Гродно, ул. Гаспадарчая 19, БЦ Марро. Здесь встречаем клиентов, оформляем документы и выдаём авто и машинокомплекты.",
  },
  {
    slug: "brest",
    name: "Брест",
    nameShort: "Брест",
    inLocative: "в Бресте",
    deliveryNote:
      "Работаем с клиентами из Бреста и области: подбор на аукционе, разбор/логистика и доставка до Бреста после таможенного оформления.",
  },
  {
    slug: "vitebsk",
    name: "Витебск",
    nameShort: "Витебск",
    inLocative: "в Витебске",
    deliveryNote:
      "Для Витебска и области считаем полную стоимость под ключ и организуем доставку после разбора и растаможки через наш хаб в Гродно.",
  },
  {
    slug: "gomel",
    name: "Гомель",
    nameShort: "Гомель",
    inLocative: "в Гомеле",
    deliveryNote:
      "Клиентам из Гомеля подбираем лоты и машинокомплекты с прозрачным расчётом и доставкой по Беларуси после прохождения таможни.",
  },
  {
    slug: "mogilev",
    name: "Могилёв",
    nameShort: "Могилёв",
    inLocative: "в Могилёве",
    deliveryNote:
      "Доставляем авто и комплекты в Могилёв: сопровождение сделки из офиса в Гродно и логистика по РБ до выдачи.",
  },
];

export const CITY_SLUGS = CITIES.map((c) => c.slug);

export function getCity(slug: string): SeoCity | undefined {
  return CITIES.find((c) => c.slug === slug);
}

export function cityPath(...parts: string[]) {
  const rest = parts.filter(Boolean).join("/");
  return rest ? `/gorod/${rest}/` : "/gorod/";
}

export function kitCityPath(citySlug: string) {
  return `/mashinokomplekt/${citySlug}/`;
}

export function kitOriginPath(origin: "usa" | "uk") {
  return `/mashinokomplekt/${origin}/`;
}
