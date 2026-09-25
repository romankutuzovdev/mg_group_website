import type { CatalogMake, CatalogModel, CatalogRegion } from "@/lib/catalog";
import type { SeoCity } from "@/lib/seo/cities";

export function cityHubTitle(city: SeoCity) {
  return `Купить авто и машинокомплект ${city.inLocative} | MG.GROUP`;
}

export function cityHubDescription(city: SeoCity) {
  return `Авто из США, Китая, Кореи и Англии ${city.inLocative}. Машинокомплекты, подбор на аукционе, расчёт под ключ и доставка — MG.GROUP, офис в Гродно.`;
}

export function cityHubH1(city: SeoCity) {
  return `Авто и машинокомплекты ${city.inLocative}`;
}

export function cityRegionTitle(city: SeoCity, region: CatalogRegion) {
  return `Авто из ${region.nameGenitive} ${city.inLocative} — купить под ключ | MG.GROUP`;
}

export function cityRegionDescription(city: SeoCity, region: CatalogRegion) {
  return `Купить автомобиль из ${region.nameGenitive} ${city.inLocative}. Подбор лота, логистика, растаможка и расчёт под ключ — MG.GROUP.`;
}

export function cityRegionH1(city: SeoCity, region: CatalogRegion) {
  return `Авто из ${region.nameGenitive} ${city.inLocative}`;
}

export function cityMakeTitle(city: SeoCity, region: CatalogRegion, make: CatalogMake) {
  return `${make.name} из ${region.nameGenitive} купить ${city.inLocative} | MG.GROUP`;
}

export function cityMakeDescription(city: SeoCity, region: CatalogRegion, make: CatalogMake) {
  return `Купить ${make.name} из ${region.nameGenitive} ${city.inLocative}. Подбор на аукционе, доставка, таможенное оформление и расчёт под ключ — MG.GROUP.`;
}

export function cityMakeH1(city: SeoCity, region: CatalogRegion, make: CatalogMake) {
  return `${make.name} из ${region.nameGenitive} ${city.inLocative}`;
}

export function kitCityTitle(city: SeoCity) {
  return `Машинокомплект ${city.inLocative} из США и Англии | MG.GROUP`;
}

export function kitCityDescription(city: SeoCity) {
  return `Машинокомплекты из США и Англии ${city.inLocative}: выкуп лота, разборка, упаковка и доставка. Copart / IAAI / Copart UK — MG.GROUP.`;
}

export function kitCityH1(city: SeoCity) {
  return `Машинокомплект ${city.inLocative}`;
}

export function kitOriginTitle(origin: "usa" | "uk") {
  return origin === "usa"
    ? "Машинокомплекты из США в Беларусь | MG.GROUP"
    : "Машинокомплекты из Англии в Беларусь | MG.GROUP";
}

export function kitOriginDescription(origin: "usa" | "uk") {
  return origin === "usa"
    ? "Машинокомплекты с аукционов США (Copart, IAAI / Bid.cars): разбор, море, таможня и доставка в Беларусь — MG.GROUP."
    : "Машинокомплекты с Copart UK: разбор в Англии, сухопутная доставка в Беларусь — MG.GROUP.";
}

export function kitOriginH1(origin: "usa" | "uk") {
  return origin === "usa" ? "Машинокомплекты из США" : "Машинокомплекты из Англии";
}

export type FaqItem = { q: string; a: string };

function regionDeliveryAnswer(region: CatalogRegion): string {
  switch (region.slug) {
    case "usa":
      return "Из США ориентир около 1,5–2 месяцев с учётом аукциона, моря и таможни; точный срок зависит от лота и сезона.";
    case "uk":
      return "Из Англии обычно быстрее морского маршрута США: ориентир несколько недель с учётом разбора и границы — уточняем по лоту.";
    case "korea":
      return "Из Кореи ориентир несколько недель с учётом покупки, логистики и таможни — срок уточняем по конкретному авто.";
    case "china":
      return "Из Китая срок зависит от комплектации и логистики: обычно от нескольких недель до 1,5–2 месяцев — считаем по заказу.";
    default:
      return "Срок зависит от площадки и логистики — уточняем по конкретному авто.";
  }
}

function regionSourcesLabel(region: CatalogRegion): string {
  switch (region.slug) {
    case "usa":
      return "Copart и IAAI";
    case "korea":
      return "Encar и корейский рынок";
    case "china":
      return "дилеры и экспортный рынок Китая";
    case "uk":
      return "Copart UK";
    default:
      return `площадки ${region.name}`;
  }
}

export function cityMakeFaq(
  city: SeoCity,
  region: CatalogRegion,
  make: CatalogMake,
): FaqItem[] {
  return [
    {
      q: `Можно ли купить ${make.name} из ${region.nameGenitive} ${city.inLocative}?`,
      a: `Да. MG.GROUP подбирает ${make.name} на ${regionSourcesLabel(region)}, считает стоимость под ключ и организует доставку ${city.inLocative}. Офис — в Гродно.`,
    },
    {
      q: "Что входит в цену под ключ?",
      a: "Ставка/выкуп, сборы площадки, логистика, разбор (для комплектов), таможня и доставка по Беларуси — считаем до выдачи.",
    },
    {
      q: "Сколько занимает доставка?",
      a: regionDeliveryAnswer(region),
    },
    {
      q: `Как получить авто или комплект ${city.inLocative}?`,
      a: city.deliveryNote,
    },
  ];
}

export function cityRegionFaq(city: SeoCity, region: CatalogRegion): FaqItem[] {
  return [
    {
      q: `Как купить авто из ${region.nameGenitive} ${city.inLocative}?`,
      a: `Оставляете заявку, мы подбираем лот, считаем под ключ и ведём сделку до выдачи ${city.inLocative}.`,
    },
    {
      q: "Работаете только с целыми авто?",
      a: "Нет — также машинокомплекты из США и Англии: разбор по бланку и доставка комплектом.",
    },
    {
      q: "Где ваш офис?",
      a: "г. Гродно, ул. Гаспадарчая 19, БЦ Марро. Доставку по РБ организуем после оформления.",
    },
  ];
}

export function kitCityFaq(city: SeoCity): FaqItem[] {
  return [
    {
      q: `Заказать машинокомплект ${city.inLocative}?`,
      a: `Да. Выкупаем донор на Copart / IAAI / Copart UK, разбираем и везём комплект ${city.inLocative}.`,
    },
    {
      q: "Чем комплект отличается от авто под ключ?",
      a: "Это донор на запчасти: разборка, упаковка и доставка комплектом, без постановки целого авто на учёт в РБ.",
    },
    {
      q: "Можно ли посчитать заранее?",
      a: "Да — по лоту или бланку считаем ставку, разбор, логистику и доставку до вашего города.",
    },
  ];
}

export function catalogHubFaq(): FaqItem[] {
  return [
    {
      q: "Откуда берётся каталог марок и моделей?",
      a: "Каталог /avto/ единый для США, Китая, Кореи и Англии: марки и модели подтягиваются из спарсенных лотов и рынка. На страницах региона показываем актуальные лоты, если они есть.",
    },
    {
      q: "Чем отличаются направления?",
      a: "США — Copart/IAAI со ставкой и просчётом. Корея — Encar и корейский рынок. Китай — новые модели под заказ с дилеров. Англия — авто и машинокомплекты Copart UK. Структура каталога у всех одинаковая.",
    },
    {
      q: "Что входит в цену под ключ?",
      a: "Ставка/выкуп, сборы площадки, логистика, таможня и доставка по Беларуси — считаем до выдачи.",
    },
  ];
}

export function catalogRegionFaq(region: CatalogRegion): FaqItem[] {
  return [
    {
      q: `Как купить авто из ${region.nameGenitive}?`,
      a: `Выберите марку или лот в каталоге /avto/${region.slug}/ — мы подтвердим вариант на ${regionSourcesLabel(region)}, посчитаем под ключ и доведём до выдачи в Беларуси.`,
    },
    {
      q: "Сколько занимает доставка?",
      a: regionDeliveryAnswer(region),
    },
    {
      q: "Где ваш офис?",
      a: "г. Гродно, ул. Гаспадарчая 19, БЦ Марро. Доставку по РБ организуем после оформления.",
    },
  ];
}

export function catalogMakeFaq(region: CatalogRegion, make: CatalogMake): FaqItem[] {
  return [
    {
      q: `Можно ли купить ${make.name} из ${region.nameGenitive}?`,
      a: `Да. MG.GROUP подбирает ${make.name} на ${regionSourcesLabel(region)}, считает стоимость под ключ и организует доставку в Беларусь.`,
    },
    {
      q: `Какие модели ${make.name} доступны?`,
      a: `В каталоге — модели ${make.name} для ${region.nameGenitive}. На странице марки показываем живые лоты, если они есть; иначе подберём под заказ.`,
    },
    {
      q: "Как получить расчёт?",
      a: "Откройте калькулятор или напишите менеджеру — посчитаем ставку/цену, доставку и таможню под ваш бюджет.",
    },
  ];
}

export function catalogModelFaq(
  region: CatalogRegion,
  make: CatalogMake,
  model: CatalogModel,
): FaqItem[] {
  return [
    {
      q: `Купить ${make.name} ${model.name} из ${region.nameGenitive}?`,
      a: `Да. Подберём ${make.name} ${model.name} на ${regionSourcesLabel(region)}, проверим историю, посчитаем под ключ и доставим в Беларусь.`,
    },
    {
      q: "Можно ли посмотреть похожие лоты?",
      a: `На странице модели в каталоге /avto/${region.slug}/${make.slug}/${model.slug}/ показываем актуальные лоты, если они есть. Иначе менеджер пришлёт варианты под заказ.`,
    },
    {
      q: "Что влияет на итоговую цену?",
      a: "Цена лота/ставка, сборы, логистика, таможня и доставка по РБ. Точную сумму считаем по конкретному авто.",
    },
  ];
}
