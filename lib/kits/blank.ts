export type KitSchemeId = "mishk" | "pk" | "nsk" | "dvs";
export type KitOrigin = "usa" | "uk";
export type PartGroup = "powertrain" | "front" | "cabin" | "rear" | "chassis";

export type PartMeta = {
  label: string;
  group: PartGroup;
  volume: number;
};

export const PART_GROUPS: { id: PartGroup; label: string }[] = [
  { id: "powertrain", label: "Силовой агрегат" },
  { id: "front", label: "Передняя часть" },
  { id: "cabin", label: "Кузов и салон" },
  { id: "rear", label: "Задняя часть" },
  { id: "chassis", label: "Ходовая и кузов" },
];

export const PART_META: Record<string, PartMeta> = {
  engine: { label: "Двигатель", group: "powertrain", volume: 6 },
  gearbox: { label: "КПП", group: "powertrain", volume: 3 },
  turbo: { label: "Турбина", group: "powertrain", volume: 1 },
  exhaust: { label: "Выхлоп", group: "powertrain", volume: 2 },
  battery: { label: "АКБ", group: "powertrain", volume: 1 },
  hood: { label: "Капот", group: "front", volume: 3 },
  bumper: { label: "Передний бампер", group: "front", volume: 2 },
  headlight: { label: "Фары", group: "front", volume: 1 },
  fender: { label: "Крылья", group: "front", volume: 3 },
  radiator: { label: "Радиатор", group: "front", volume: 2 },
  door: { label: "Передние двери", group: "cabin", volume: 3 },
  "rear-door": { label: "Задние двери", group: "cabin", volume: 3 },
  roof: { label: "Крыша", group: "cabin", volume: 4 },
  seat: { label: "Сиденья", group: "cabin", volume: 2 },
  skirt: { label: "Пороги", group: "cabin", volume: 2 },
  quarter: { label: "Задние крылья", group: "rear", volume: 4 },
  trunk: { label: "Крышка багажника", group: "rear", volume: 2 },
  taillight: { label: "Фонари", group: "rear", volume: 1 },
  "rear-bumper": { label: "Задний бампер", group: "rear", volume: 2 },
  "front-wheel": { label: "Передние колёса", group: "chassis", volume: 2 },
  "rear-wheel": { label: "Задние колёса", group: "chassis", volume: 2 },
  "front-suspension": { label: "Передняя подвеска", group: "chassis", volume: 3 },
  "rear-suspension": { label: "Задняя подвеска", group: "chassis", volume: 3 },
  chassis: { label: "Днище / силовая структура", group: "chassis", volume: 8 },
};

export const KIT_SCHEMES: {
  id: KitSchemeId;
  code: string;
  title: string;
  hint: string;
  description: string;
  parts: readonly string[];
}[] = [
  {
    id: "mishk",
    code: "МШК",
    title: "Машинокомплект",
    hint: "Полная разборка донора",
    description:
      "Стандартный бланк: почти весь автомобиль. Сиденья и АКБ по умолчанию не входят — их можно добавить кликом.",
    parts: [
      "hood",
      "engine",
      "gearbox",
      "turbo",
      "radiator",
      "bumper",
      "headlight",
      "fender",
      "front-wheel",
      "front-suspension",
      "door",
      "rear-door",
      "roof",
      "skirt",
      "quarter",
      "trunk",
      "taillight",
      "rear-wheel",
      "rear-suspension",
      "rear-bumper",
      "exhaust",
      "chassis",
    ],
  },
  {
    id: "pk",
    code: "П/К",
    title: "Полукомплект",
    hint: "Агрегаты + перед и зад",
    description:
      "Силовой агрегат, ноускат и задняя часть без крыши, дверей и днища. Для розницы, где кузов не нужен.",
    parts: [
      "hood",
      "engine",
      "gearbox",
      "turbo",
      "radiator",
      "bumper",
      "headlight",
      "fender",
      "front-wheel",
      "front-suspension",
      "quarter",
      "trunk",
      "taillight",
      "rear-wheel",
      "rear-suspension",
      "rear-bumper",
      "exhaust",
    ],
  },
  {
    id: "nsk",
    code: "НСК",
    title: "Ноускат",
    hint: "Передняя часть в сборе",
    description:
      "Капот, бампер, крылья, оптика, радиатор и навесное. Можно добавить ДВС — кликните по двигателю.",
    parts: ["hood", "bumper", "headlight", "fender", "radiator"],
  },
  {
    id: "dvs",
    code: "ДВС",
    title: "Моторокомплект",
    hint: "Проверенный агрегат",
    description:
      "Двигатель, КПП, турбина и выхлоп. Перед снятием запускаем мотор и снимаем видео — не «мотор с полки».",
    parts: ["engine", "gearbox", "turbo", "exhaust"],
  },
];

export const CONTAINER_CAPACITY = 48;
export const ORIGINS: { id: KitOrigin; label: string }[] = [
  { id: "usa", label: "США" },
  { id: "uk", label: "Англия" },
];

export function schemeById(id: KitSchemeId) {
  return KIT_SCHEMES.find((scheme) => scheme.id === id) ?? KIT_SCHEMES[0];
}

export function volumeOf(ids: Iterable<string>) {
  let total = 0;
  for (const id of ids) total += PART_META[id]?.volume ?? 1;
  return total;
}

export function kitsPerContainer(included: Iterable<string>) {
  const vol = volumeOf(included);
  if (vol <= 0) return 0;
  return Math.max(1, Math.floor(CONTAINER_CAPACITY / vol));
}

export function blankDiff(schemeParts: readonly string[], included: Set<string>) {
  const scheme = new Set(schemeParts);
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of included) {
    if (!scheme.has(id)) added.push(id);
  }
  for (const id of scheme) {
    if (!included.has(id)) removed.push(id);
  }
  return { added, removed };
}
