import { COMPANY } from "@/lib/company";

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
      "После таможенного оформления организуем доставку автомобиля или машинокомплекта в Минск. Подбор и документы ведёт офис MG.GROUP в Гродно.",
  },
  {
    slug: "grodno",
    name: "Гродно",
    nameShort: "Гродно",
    inLocative: "в Гродно",
    deliveryNote:
      `Офис MG.GROUP находится по адресу ${COMPANY.address}. В Гродно оформляем документы и согласуем выдачу автомобилей и машинокомплектов.`,
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
