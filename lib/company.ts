export const CONSULTATION_TG = "https://t.me/Yury_MG_Global";

export const COMPANY = {
  name: "MG.GROUP",
  description:
    "Подбор и доставка авто под заказ из США, Китая и Кореи. Машинокомплекты из США и Англии",
  address: "г. Гродно, ул. Гаспадарчая 19, каб. 340/1, БЦ Марро",
  hoursWeekdays: "Будни — 9:00–19:00",
  hoursWeekend: "Суббота, воскресенье — выходной",
  partners: "Copart, IAAI, Manheim, Mobile.de, Autoplius.lt",
} as const;

/** Координаты БЦ «Марро», ул. Гаспадарчая 19, Гродно */
export const OFFICE_LOCATION = {
  lat: 53.6639,
  lng: 23.8208,
  zoom: 17,
  name: "БЦ Марро",
} as const;

export function officeMapEmbedUrl() {
  const { lat, lng, zoom } = OFFICE_LOCATION;
  return `https://maps.google.com/maps?q=${lat},${lng}&hl=ru&z=${zoom}&output=embed`;
}

export type Messenger = "viber" | "telegram" | "whatsapp";

export type CompanyPhone = {
  display: string;
  tel: string;
  messengers: { type: Messenger; href: string }[];
};

export const PHONES: CompanyPhone[] = [
  {
    display: "+375 29 866 88 11",
    tel: "+375298668811",
    messengers: [
      { type: "viber", href: "viber://chat?number=+375298668811" },
      { type: "telegram", href: "https://t.me/+375298668811" },
      { type: "whatsapp", href: "https://wa.me/+375298668811" },
    ],
  },
  {
    display: "+375 29 888 77 80",
    tel: "+375298887780",
    messengers: [
      { type: "viber", href: "viber://chat?number=+375298887780" },
      { type: "telegram", href: "https://t.me/+375298887780" },
      { type: "whatsapp", href: "https://wa.me/+375298887780" },
    ],
  },
  {
    display: "+375 33 617 36 17",
    tel: "+375336173617",
    messengers: [{ type: "viber", href: "viber://chat?number=+375336173617" }],
  },
  {
    display: "+1 929 280 98 09",
    tel: "+19292809809",
    messengers: [
      { type: "telegram", href: "https://t.me/+19292809809" },
      { type: "whatsapp", href: "https://wa.me/+19292809809" },
    ],
  },
];

export const HEADER_PHONES = [PHONES[2], PHONES[3]] as const;

export const HERO = {
  badge: "Официальные партнёры Copart, IAAI, Manheim, Mobile.de, Autoplius.lt",
  title: "Автомобили под заказ из США, Китая и Кореи",
  subtitle: "Машинокомплекты штучно и оптом из США и Англии",
  cards: [
    {
      title: "Автомобили из США, Китая и Кореи",
      items: ["Выгода до 30% от цен на рынке РБ", "Полное таможенное оформление"],
    },
    {
      title: "Машинокомплекты и двигатели штучно и оптом из США и Англии",
      items: ["Оригинальные детали", "Быстрая доставка"],
    },
    {
      title: "Техника и спецтехника",
      items: ["Гидроциклы", "Квадроциклы", "Моторные лодки, катера", "Строительная техника"],
    },
  ],
  trust: [
    "Официальные партнёры Copart, IAAI, Manheim, Mobile.de, Autoplius.lt",
    "Доставка автомобилей и машинокомплектов оптом",
    "Гарантия качества и оригинальности",
    "Полное таможенное оформление",
  ],
} as const;

export const BENEFITS = [
  {
    number: "01",
    title: "Тщательный подбор автомобилей",
    description:
      "Мы подбираем автомобили из США, Китая и Кореи, учитывая предпочтения и требования клиентов. Наша команда отбирает качественные и надёжные автомобили с чистой историей и оптимальным соотношением цены и качества.",
  },
  {
    number: "02",
    title: "Профессиональная логистика",
    description:
      "Мы быстро и надёжно доставляем автомобили из США, Китая и Кореи в Беларусь. Опытный логистический отдел минимизирует время и риски, гарантируя, что ваш автомобиль прибудет в сохранности и в срок.",
  },
  {
    number: "03",
    title: "Прозрачность и надёжность",
    description:
      "Мы ценим доверие клиентов и обеспечиваем прозрачность и надёжность во всех аспектах работы. Наша цель — комфорт и уверенность при покупке автомобиля из США, Китая или Кореи. Мы предлагаем честные цены, чёткую информацию и профессиональное сопровождение на всех этапах сделки.",
  },
] as const;

export type TeamMember = {
  id: string;
  role: string;
  name?: string;
  photo?: string;
  photoClass?: string;
};

export const TEAM: TeamMember[] = [
  { id: "director", name: "Алексей", role: "Директор", photo: "/team/director.png" },
  { id: "cfo", name: "Юрий", role: "Финансовый директор", photo: "/team/cfo.png" },
  { id: "sales-head", name: "Екатерина", role: "Руководитель отдела продаж", photo: "/team/sales-head.png" },
  { id: "sales-1", name: "Борис", role: "Менеджер по продажам", photo: "/team/sales-1.png" },
  { id: "sales-2", name: "Яна", role: "Менеджер по продажам", photo: "/team/sales-2.png" },
  { id: "sales-3", name: "Роман", role: "Менеджер по продажам", photo: "/team/roman.jpg", photoClass: "object-[center_25%]" },
  { id: "accountant", name: "Елена", role: "Бухгалтер", photo: "/team/accountant.jpg", photoClass: "object-[center_20%]" },
  { id: "logistics", name: "Вячеслав", role: "Логист", photo: "/team/logistics.png", photoClass: "object-[center_28%]" },
];

export const PARTS = {
  title: "Машинокомплекты штучно и оптом из США и Англии",
  subtitle: "Лоты Copart / IAAI / Copart UK под разборку — ставка, расчёт и доставка комплектом в Беларусь",
  features: [
    {
      title: "Донор с аукциона",
      description: "Выкупаем авто на Copart, IAAI или Copart UK и разбираем по бланку — вы получаете комплект с конкретного лота",
    },
    {
      title: "Быстрая доставка",
      description: "Контейнер и фура по отлаженным маршрутам из США и Англии",
    },
    {
      title: "Гибкая комплектация",
      description: "Машинокомплект, полукомплект, ноускат или моторокомплект — собираем под ваш заказ",
    },
    {
      title: "Гарантия качества разборки",
      description: "Контролируем разборку с учётом модели и типа кузова",
    },
  ],
  ctaTitle: "Нужен машинокомплект?",
  ctaDescription:
    "Оставьте заявку — подберём донора и комплектацию под ваш запрос",
} as const;

export type PopularCondition = "new" | "used" | "damaged";

export const POPULAR_MODELS: {
  id: number;
  title: string;
  image: string;
  year: string;
  priceUSA: string;
  priceBY: string;
  savings: string;
  condition: PopularCondition;
  specs: string[];
}[] = [
  {
    id: 1,
    title: "Tesla Model Y",
    image:
      "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&q=80&w=800",
    year: "2023",
    priceUSA: "от 35 000 $",
    priceBY: "49 000 $",
    savings: "-29%",
    condition: "new",
    specs: ["Long Range", "Полный привод", "533 км"],
  },
  {
    id: 2,
    title: "Ford Mustang GT",
    image:
      "https://images.unsplash.com/photo-1611016186353-9af58c69a533?auto=format&fit=crop&q=80&w=800",
    year: "2022",
    priceUSA: "от 28 000 $",
    priceBY: "40 000 $",
    savings: "-30%",
    condition: "used",
    specs: ["5.0L V8", "450 л.с.", "Задний привод"],
  },
  {
    id: 3,
    title: "BMW M4 Competition",
    image:
      "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&q=80&w=800",
    year: "2023",
    priceUSA: "от 45 000 $",
    priceBY: "64 000 $",
    savings: "-30%",
    condition: "damaged",
    specs: ["3.0L I6", "503 л.с.", "Лёгкие повреждения"],
  },
  {
    id: 4,
    title: "Mercedes-AMG GT",
    image:
      "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=800",
    year: "2023",
    priceUSA: "от 52 000 $",
    priceBY: "74 000 $",
    savings: "-30%",
    condition: "new",
    specs: ["4.0L V8", "577 л.с.", "Полный привод"],
  },
  {
    id: 5,
    title: "Porsche 911 GT3",
    image:
      "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&q=80&w=800",
    year: "2023",
    priceUSA: "от 89 000 $",
    priceBY: "125 000 $",
    savings: "-29%",
    condition: "new",
    specs: ["4.0L Flat-6", "502 л.с.", "Задний привод"],
  },
  {
    id: 6,
    title: "Chevrolet Corvette Z06",
    image:
      "https://images.unsplash.com/photo-1612911912327-57b3aff278c4?auto=format&fit=crop&q=80&w=800",
    year: "2023",
    priceUSA: "от 75 000 $",
    priceBY: "105 000 $",
    savings: "-29%",
    condition: "used",
    specs: ["5.5L V8", "670 л.с.", "Задний привод"],
  },
];

export const CAR_FINDER = {
  title: "Бесплатный подбор авто из США с выгодой до 30%",
  subtitle:
    "Оставьте заявку — подберём варианты под бюджет, сроки и задачу. Это бесплатно и ни к чему не обязывает.",
  modelPlaceholder: "Например: Chevrolet Equinox",
  messengers: ["Telegram", "Viber", "WhatsApp"],
  origins: ["США", "Китай", "Корея", "Не важно"],
  budgets: ["До 10.000$", "10.000$ – 15.000$", "15.000$ – 20.000$", "20.000$ – 30.000$", "Более 30.000$"],
  timings: [
    "Сразу, как найду подходящий вариант",
    "В ближайшие пару месяцев",
    "Пока присматриваюсь",
  ],
  bodies: ["Седан", "Кроссовер / SUV", "Универсал", "Пикап", "Минивэн", "Не важно"],
  conditions: ["Авто на ходу", "Под ремонт", "Машинокомплект", "Не важно"],
  points: [
    "Бесплатно, без обязательств",
    "Подбор под бюджет и задачу",
    "Copart, IAAI, площадки Китая и Кореи",
    "Ответим в мессенджер в рабочий день",
  ],
} as const;

export const SITE_METADATA = {
  title: "MG.GROUP — Авто под заказ из США, Китая и Кореи | Машинокомплекты из США и Англии",
  description:
    "Подбор и доставка авто под заказ из США, Китая и Кореи. Машинокомплекты из США и Англии. Официальные партнёры Copart, IAAI, Manheim, Mobile.de. Консультация и таможенное оформление.",
  keywords: [
    "авто под заказ из США",
    "авто под заказ из Китая",
    "авто под заказ из Кореи",
    "машинокомплекты оптом",
    "запчасти из США",
    "запчасти из Англии",
    "Copart",
    "IAAI",
    "Manheim",
    "Mobile.de",
    "Autoplius.lt",
    "таможенное оформление авто",
    "катера из США",
    "гидроциклы из США",
    "спецтехника из США",
  ],
};

export function consultationMessage(text: string) {
  return `${CONSULTATION_TG}?text=${encodeURIComponent(text)}`;
}
