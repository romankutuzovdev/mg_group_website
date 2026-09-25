export type YardId = "nj" | "tx" | "uk";
export type ChatRole = "yard" | "client";
export type LatLng = [number, number];

export type ChatLine = {
  role: ChatRole;
  text: string;
  tag?: string;
};

export type Yard = {
  id: YardId;
  code: string;
  city: string;
  place: string;
  country: string;
  lat: number;
  lng: number;
  port: string;
  seaLabel: string;
  headline: string;
  body: string;
  seaRoute: LatLng[];
  routeKind?: "sea" | "land";
  chat: ChatLine[];
};

export type AuctionOrigin = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  hub: Extract<YardId, "nj" | "tx">;
  hop?: LatLng[];
};

export type RouteStop = {
  id: string;
  label: string;
  hint: string;
  latlng: LatLng;
  kind: "sea" | "land";
  align?: "left" | "right";
};

export const PORT_TURKEY: LatLng = [40.97, 28.7];
export const PORT_NOVOROSSIYSK: LatLng = [44.724, 37.769];
export const CITY_CALAIS: LatLng = [50.9513, 1.8587];
export const CITY_GRODNO: LatLng = [53.6778, 23.8298];
export const CITY_MINSK: LatLng = [53.9023, 27.5619];

const GIBRALTAR_TO_NOVOROSSIYSK: LatLng[] = [
  [35.95, -5.6],
  [36.35, -2.4],
  [36.85, 3.1],
  [37.15, 8.4],
  [36.9, 12.6],
  [36.4, 16.2],
  [35.7, 19.4],
  [35.5, 23.1],
  [36.3, 26.2],
  [37.9, 26.1],
  [38.9, 25.4],
  [39.9, 25.95],
  [40.15, 26.4],
  [40.65, 27.45],
  PORT_TURKEY,
  [41.18, 29.08],
  [41.7, 30.4],
  [42.6, 32.9],
  [43.55, 35.3],
  [44.25, 36.85],
  PORT_NOVOROSSIYSK,
];

export const LAND_NOVOROSSIYSK_MINSK: LatLng[] = [
  PORT_NOVOROSSIYSK,
  [45.04, 38.98],
  [47.23, 39.7],
  [51.66, 39.2],
  [52.97, 36.07],
  [54.78, 32.05],
  [53.9, 30.33],
  [53.14, 29.23],
  [53.13, 26.01],
  CITY_GRODNO,
  [53.78, 25.55],
  [53.85, 26.55],
  CITY_MINSK,
];

export const LAND_UK_MINSK: LatLng[] = [
  [51.454, 0.35],
  [51.13, 1.31],
  CITY_CALAIS,
  [50.63, 3.06],
  [49.12, 6.18],
  [48.57, 7.75],
  [49.01, 8.4],
  [49.45, 11.08],
  [51.05, 13.74],
  [51.11, 17.04],
  [51.76, 19.46],
  [52.23, 21.01],
  [53.13, 23.16],
  CITY_GRODNO,
  [53.78, 25.55],
  [53.85, 26.55],
  CITY_MINSK,
];

export const ROUTE_STOPS: RouteStop[] = [
  { id: "turkey", label: "Турция", hint: "Турция · порт", latlng: PORT_TURKEY, kind: "sea" },
  {
    id: "novorossiysk",
    label: "Новороссийск",
    hint: "Новороссийск · порт",
    latlng: PORT_NOVOROSSIYSK,
    kind: "sea",
  },
  {
    id: "france",
    label: "Франция",
    hint: "Франция · Кале",
    latlng: CITY_CALAIS,
    kind: "land",
    align: "left",
  },
  {
    id: "grodno",
    label: "Гродно",
    hint: "Гродно · MG.GROUP",
    latlng: CITY_GRODNO,
    kind: "land",
    align: "left",
  },
  { id: "minsk", label: "Минск", hint: "Минск · выдача", latlng: CITY_MINSK, kind: "land" },
];

export const AUCTION_ORIGINS: AuctionOrigin[] = [
  {
    id: "bos",
    label: "Boston",
    lat: 42.36,
    lng: -71.06,
    hub: "nj",
    hop: [[41.55, -72.4]],
  },
  {
    id: "phi",
    label: "Philadelphia",
    lat: 39.95,
    lng: -75.17,
    hub: "nj",
  },
  {
    id: "det",
    label: "Detroit",
    lat: 42.33,
    lng: -83.05,
    hub: "nj",
    hop: [[41.6, -78.2]],
  },
  {
    id: "chi",
    label: "Chicago",
    lat: 41.88,
    lng: -87.63,
    hub: "nj",
    hop: [
      [41.55, -81.7],
      [41.2, -77.2],
    ],
  },
  {
    id: "atl",
    label: "Atlanta",
    lat: 33.75,
    lng: -84.39,
    hub: "nj",
    hop: [
      [36.2, -79.8],
      [38.9, -76.4],
    ],
  },
  {
    id: "clt",
    label: "Charlotte",
    lat: 35.23,
    lng: -80.84,
    hub: "nj",
    hop: [[37.6, -77.1]],
  },
  {
    id: "la",
    label: "Los Angeles",
    lat: 34.05,
    lng: -118.25,
    hub: "tx",
    hop: [
      [33.5, -112.1],
      [32.2, -106.4],
      [31.6, -99.2],
    ],
  },
  {
    id: "phx",
    label: "Phoenix",
    lat: 33.45,
    lng: -112.07,
    hub: "tx",
    hop: [
      [32.3, -106.5],
      [31.7, -99.4],
    ],
  },
  {
    id: "sea",
    label: "Seattle",
    lat: 47.61,
    lng: -122.33,
    hub: "tx",
    hop: [
      [43.6, -116.2],
      [39.1, -108.5],
      [34.2, -100.4],
    ],
  },
  {
    id: "den",
    label: "Denver",
    lat: 39.74,
    lng: -104.99,
    hub: "tx",
    hop: [
      [35.6, -101.2],
      [32.4, -97.2],
    ],
  },
  {
    id: "dal",
    label: "Dallas",
    lat: 32.78,
    lng: -96.8,
    hub: "tx",
    hop: [[31.4, -95.9]],
  },
  {
    id: "mia",
    label: "Miami",
    lat: 25.76,
    lng: -80.19,
    hub: "tx",
    hop: [
      [27.6, -82.4],
      [29.1, -90.2],
    ],
  },
];

export function auctionPath(origin: AuctionOrigin, hub: { lat: number; lng: number }): LatLng[] {
  return [[origin.lat, origin.lng], ...(origin.hop ?? []), [hub.lat, hub.lng]];
}

export const YARDS: Yard[] = [
  {
    id: "nj",
    code: "NJ",
    city: "Нью-Джерси",
    place: "Elizabeth · порт Ньюарк",
    country: "США",
    lat: 40.668,
    lng: -74.166,
    port: "Newark / Elizabeth",
    seaLabel: "Ньюарк → Атлантика → Турция → Новороссийск",
    headline: "Восточные ворота",
    body: "Лоты с восточных аукционов США сходятся на разборку у Ньюарка. После разборки контейнер идёт через Атлантику и Гибралтар в Турцию, дальше Чёрным морем в Новороссийск. Оттуда фура на Гродно и выдача в Минске.",
    seaRoute: [
      [40.668, -74.166],
      [40.48, -73.85],
      [38.6, -64.5],
      [35.2, -47.5],
      [32.6, -31.5],
      [31.6, -17.5],
      [32.4, -9.8],
      ...GIBRALTAR_TO_NOVOROSSIYSK,
    ],
    chat: [
      { role: "yard", tag: "площадка", text: "Донор на боксе. VIN сверили с бланком." },
      { role: "yard", tag: "фото ×3", text: "Капот снят. Кадры узлов в чат." },
      { role: "client", text: "Фары оставьте в сборе, ноускат не разбирайте." },
      { role: "yard", text: "Принято. Оптика идёт модулем." },
      { role: "yard", tag: "видео 0:12", text: "ДВС запущен до снятия — запись отправили." },
      { role: "client", text: "Пороги в плёнку. Сиденья не нужны." },
      { role: "yard", text: "Сиденья остаются на разборке. Пороги упакуем отдельно." },
    ],
  },
  {
    id: "tx",
    code: "TX",
    city: "Техас",
    place: "Houston · порт Хьюстон",
    country: "США",
    lat: 29.735,
    lng: -95.265,
    port: "Houston",
    seaLabel: "Хьюстон → Атлантика → Турция → Новороссийск",
    headline: "Южный контур",
    body: "Запад и юг США едут на техасскую разборку. Из Хьюстона контейнер выходит в Мексиканский залив, огибает Флориду и пересекает Атлантику до Турции. Дальше Новороссийск, фура на Гродно и Минск.",
    seaRoute: [
      [29.735, -95.265],
      [29.25, -94.65],
      [27.1, -90.1],
      [25.1, -85.6],
      [24.15, -81.7],
      [24.05, -79.4],
      [26.2, -72.5],
      [29.4, -58],
      [32.6, -31.5],
      [31.6, -17.5],
      [32.4, -9.8],
      ...GIBRALTAR_TO_NOVOROSSIYSK,
    ],
    chat: [
      { role: "yard", tag: "бокс", text: "Лот в клетке. Осматриваем днище и номера агрегатов." },
      { role: "client", text: "КПП и турбину — отдельно, с бирками и фото." },
      { role: "yard", tag: "фото ×4", text: "Бирки на месте. Сняли до и после." },
      { role: "yard", text: "Ждём ещё указания, пока машина на подъёмнике." },
      { role: "client", text: "Добавьте АКБ. Крышу не трогать." },
      { role: "yard", text: "АКБ в комплект. Крыша остаётся на доноре." },
    ],
  },
  {
    id: "uk",
    code: "UK",
    city: "У Лондона",
    place: "Dartford · порт Тилбери",
    country: "Англия",
    lat: 51.454,
    lng: 0.35,
    port: "Tilbury",
    seaLabel: "Лондон → Франция → Гродно → Минск",
    headline: "Английская разборка",
    body: "Разборка у Лондона. Груз идёт сушей: паром в Кале, дальше фура через Францию на Гродно и выдача в Минске. Американские разборки сюда не заходят — у них свой морской контур через Турцию и Новороссийск.",
    routeKind: "land",
    seaRoute: LAND_UK_MINSK,
    chat: [
      { role: "yard", tag: "прогрев", text: "ДВС на холодную и на ходу. Видео до разборки — в чат." },
      { role: "client", text: "Стёкла везём, без гарантии — ок. Крышу не снимать." },
      { role: "yard", text: "Крыша остаётся. Стёкла маркируем «без гарантии»." },
      { role: "client", text: "Выхлоп и турбину в отдельные места." },
      { role: "yard", tag: "упаковка", text: "Бланк закрыт. Фото мест в контейнере через 40 минут." },
    ],
  },
];

export function yardById(id: YardId) {
  return YARDS.find((yard) => yard.id === id) ?? YARDS[0];
}
