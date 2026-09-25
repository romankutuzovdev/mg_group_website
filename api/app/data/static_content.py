"""Static content mirrored from the Next.js site (company, FAQ, tariffs, yards, cities)."""

from __future__ import annotations

COMPANY = {
    "name": "MG.GROUP",
    "description": "Подбор и доставка авто под заказ из США, Китая и Кореи. Машинокомплекты из США и Англии",
    "address": "г. Гродно, ул. Гаспадарчая 19, каб. 340/1, БЦ Марро",
    "hours_weekdays": "Будни — 9:00–19:00",
    "hours_weekend": "Суббота, воскресенье — выходной",
    "partners": "Copart, IAAI, Manheim, Mobile.de, Autoplius.lt",
    "consultation_tg": "https://t.me/Yury_MG_Global",
    "office": {"lat": 53.6639, "lng": 23.8208, "zoom": 17, "name": "БЦ Марро"},
}

PHONES = [
    {
        "display": "+375 29 866 88 11",
        "tel": "+375298668811",
        "messengers": [
            {"type": "viber", "href": "viber://chat?number=+375298668811"},
            {"type": "telegram", "href": "https://t.me/+375298668811"},
            {"type": "whatsapp", "href": "https://wa.me/+375298668811"},
        ],
    },
    {
        "display": "+375 29 888 77 80",
        "tel": "+375298887780",
        "messengers": [
            {"type": "viber", "href": "viber://chat?number=+375298887780"},
            {"type": "telegram", "href": "https://t.me/+375298887780"},
            {"type": "whatsapp", "href": "https://wa.me/+375298887780"},
        ],
    },
    {
        "display": "+375 33 617 36 17",
        "tel": "+375336173617",
        "messengers": [{"type": "viber", "href": "viber://chat?number=+375336173617"}],
    },
    {
        "display": "+1 929 280 98 09",
        "tel": "+19292809809",
        "messengers": [
            {"type": "telegram", "href": "https://t.me/+19292809809"},
            {"type": "whatsapp", "href": "https://wa.me/+19292809809"},
        ],
    },
]

TEAM = [
    {"id": "director", "name": "Алексей", "role": "Директор", "photo": "/team/director.png"},
    {"id": "cfo", "name": "Юрий", "role": "Финансовый директор", "photo": "/team/cfo.png"},
    {
        "id": "sales-head",
        "name": "Екатерина",
        "role": "Руководитель отдела продаж",
        "photo": "/team/sales-head.png",
    },
    {"id": "sales-1", "name": "Борис", "role": "Менеджер по продажам", "photo": "/team/sales-1.png"},
    {"id": "sales-2", "name": "Яна", "role": "Менеджер по продажам", "photo": "/team/sales-2.png"},
    {"id": "sales-3", "name": "Роман", "role": "Менеджер по продажам", "photo": "/team/roman.jpg"},
    {"id": "accountant", "name": "Елена", "role": "Бухгалтер", "photo": "/team/accountant.jpg"},
    {"id": "logistics", "name": "Вячеслав", "role": "Логист", "photo": "/team/logistics.png"},
]

HERO = {
    "badge": "Официальные партнёры Copart, IAAI, Manheim, Mobile.de, Autoplius.lt",
    "title": "Автомобили под заказ из США, Китая и Кореи",
    "subtitle": "Машинокомплекты штучно и оптом из США и Англии",
}

BENEFITS = [
    {
        "number": "01",
        "title": "Тщательный подбор автомобилей",
        "description": "Мы подбираем автомобили из США, Китая и Кореи, учитывая предпочтения и требования клиентов.",
    },
    {
        "number": "02",
        "title": "Профессиональная логистика",
        "description": "Мы быстро и надёжно доставляем автомобили из США, Китая и Кореи в Беларусь.",
    },
    {
        "number": "03",
        "title": "Прозрачность и надёжность",
        "description": "Честные цены, чёткая информация и сопровождение на всех этапах сделки.",
    },
]

PARTS = {
    "title": "Машинокомплекты штучно и оптом из США и Англии",
    "subtitle": "Лоты Copart / IAAI / Copart UK под разборку — ставка, расчёт и доставка комплектом в Беларусь",
    "features": [
        {
            "title": "Донор с аукциона",
            "description": "Выкупаем авто на Copart, IAAI или Copart UK и разбираем по бланку",
        },
        {
            "title": "Быстрая доставка",
            "description": "Контейнер и фура по отлаженным маршрутам из США и Англии",
        },
        {
            "title": "Гибкая комплектация",
            "description": "Машинокомплект, полукомплект, ноускат или моторокомплект",
        },
        {
            "title": "Гарантия качества разборки",
            "description": "Контролируем разборку с учётом модели и типа кузова",
        },
    ],
}

CAR_FINDER = {
    "title": "Бесплатный подбор авто из США с выгодой до 30%",
    "subtitle": "Оставьте заявку — подберём варианты под бюджет, сроки и задачу.",
    "messengers": ["Telegram", "Viber", "WhatsApp"],
    "origins": ["США", "Китай", "Корея", "Не важно"],
    "budgets": [
        "До 10.000$",
        "10.000$ – 15.000$",
        "15.000$ – 20.000$",
        "20.000$ – 30.000$",
        "Более 30.000$",
    ],
    "timings": [
        "Сразу, как найду подходящий вариант",
        "В ближайшие пару месяцев",
        "Пока присматриваюсь",
    ],
    "bodies": ["Седан", "Кроссовер / SUV", "Универсал", "Пикап", "Минивэн", "Не важно"],
    "conditions": ["Авто на ходу", "Под ремонт", "Машинокомплект", "Не важно"],
}

CITIES = [
    {
        "slug": "minsk",
        "name": "Минск",
        "name_short": "Минск",
        "in_locative": "в Минске",
        "delivery_note": "Офис MG.GROUP в Гродно; до Минска организуем выдачу и доставку.",
    },
    {
        "slug": "grodno",
        "name": "Гродно",
        "name_short": "Гродно",
        "in_locative": "в Гродно",
        "delivery_note": "Главный офис — ул. Гаспадарчая 19, БЦ Марро.",
    },
    {
        "slug": "brest",
        "name": "Брест",
        "name_short": "Брест",
        "in_locative": "в Бресте",
        "delivery_note": "Подбор, разбор/логистика и доставка до Бреста.",
    },
    {
        "slug": "vitebsk",
        "name": "Витебск",
        "name_short": "Витебск",
        "in_locative": "в Витебске",
        "delivery_note": "Полный расчёт под ключ и доставка через хаб в Гродно.",
    },
    {
        "slug": "gomel",
        "name": "Гомель",
        "name_short": "Гомель",
        "in_locative": "в Гомеле",
        "delivery_note": "Лоты и машинокомплекты с доставкой по Беларуси.",
    },
    {
        "slug": "mogilev",
        "name": "Могилёв",
        "name_short": "Могилёв",
        "in_locative": "в Могилёве",
        "delivery_note": "Доставка авто и комплектов в Могилёв.",
    },
]

WEIGHT_FORMULA = {
    "uk": {"base": 800, "per_kg": 1.6, "label": "Англия"},
    "usa": {"base": 1300, "per_kg": 2.2, "label": "США"},
}

DISMANTLE_TARIFFS = {
    "uk": [
        {"id": "sedan", "label": "Седан", "price": 2200},
        {"id": "suv", "label": "Внедорожник", "price": 2450},
        {"id": "sprinter", "label": "Спринтер", "price": 2350},
        {"id": "pickup", "label": "Пикап / X7 / LR", "price": 2750},
    ],
    "usa": [
        {"id": "sedan", "label": "Легковые авто", "price": 4100},
        {"id": "suv", "label": "Внедорожник / кроссовер", "price": 4450},
        {"id": "frame_suv", "label": "Рамный внедорожник", "price": 4850},
    ],
}

EXTRA_SERVICES = [
    {"name": "Проводка", "uk": "150 USD", "usa": "100 USD"},
    {"name": "Стекло любое", "uk": "30 USD без гарантий"},
    {"name": "Четверть (любая)", "uk": "200 USD седан / 250 USD SUV", "usa": "350 USD (любая)"},
    {"name": "Продольный пил (боковина)", "uk": "650 / 750 USD", "usa": "900 USD"},
    {"name": "Морда", "uk": "550 / 650 USD", "usa": "850 / 950 USD"},
    {"name": "Задняя часть авто", "uk": "550 / 650 USD", "usa": "850 / 950 USD"},
    {"name": "Крыша", "uk": "320 / 420 USD", "usa": "550 / 650 USD"},
    {"name": "Ряд сидений", "uk": "250 USD", "usa": "250 USD"},
]

USA_INLAND_DELIVERY = [
    {"miles": "до 100", "price": 200},
    {"miles": "до 200", "price": 275},
    {"miles": "до 250", "price": 350},
    {"miles": "до 350", "price": 425},
    {"miles": "350–600", "price": 475},
    {"miles": "600–1 000", "price": 550},
    {"miles": "1 000–1 700", "price": 675},
    {"miles": "1 700+", "price": 1200},
]

PRICING_FORMULA = [
    "Стоимость лота + аукционный сбор",
    "Доставка по стране происхождения",
    "Комиссия за перевод 3% от (лот + аукцион + доставка по стране)",
    "Тариф разбора с доставкой и растаможкой до Минска",
]

COMMERCIAL_TERMS = [
    "В тариф разбора включена доставка до Минска. Довоз по РБ — отдельно",
    "Расходы по стране — в течение 3 рабочих дней",
    "Доставка товара — 1,5–2 месяца с момента покупки",
]

COMMERCIAL_UPDATED = "24.08.2026"
USA_DISPATCHING_USD = 200

KIT_SCHEMES = [
    {
        "id": "mishk",
        "code": "МШК",
        "title": "Машинокомплект",
        "hint": "Полная разборка донора",
        "description": "Стандартный бланк: почти весь автомобиль. Сиденья и АКБ по умолчанию не входят.",
    },
    {
        "id": "pk",
        "code": "П/К",
        "title": "Полукомплект",
        "hint": "Кузовные узлы без полного донора",
        "description": "Часть кузова и агрегатов — под задачу ремонта.",
    },
    {
        "id": "nsk",
        "code": "НСК",
        "title": "Ноускат",
        "hint": "Передняя часть",
        "description": "Морда / передний модуль с оптикой и радиаторами.",
    },
    {
        "id": "dvs",
        "code": "ДВС",
        "title": "Моторокомплект",
        "hint": "Силовой агрегат",
        "description": "Двигатель, КПП и сопутствующие узлы.",
    },
]

YARDS = [
    {
        "id": "nj",
        "code": "NJ",
        "city": "Нью-Джерси",
        "place": "Elizabeth · порт Ньюарк",
        "country": "США",
        "lat": 40.668,
        "lng": -74.166,
        "port": "Newark / Elizabeth",
        "sea_label": "Ньюарк → Атлантика → Турция → Новороссийск",
        "headline": "Восточные ворота",
        "body": "Лоты с восточных аукционов США сходятся на разборку у Ньюарка.",
    },
    {
        "id": "tx",
        "code": "TX",
        "city": "Техас",
        "place": "Houston · порт Хьюстон",
        "country": "США",
        "lat": 29.735,
        "lng": -95.265,
        "port": "Houston",
        "sea_label": "Хьюстон → Атлантика → Турция → Новороссийск",
        "headline": "Южный контур",
        "body": "Запад и юг США едут на техасскую разборку.",
    },
    {
        "id": "uk",
        "code": "UK",
        "city": "У Лондона",
        "place": "Dartford · порт Тилбери",
        "country": "Англия",
        "lat": 51.454,
        "lng": 0.35,
        "port": "Tilbury",
        "sea_label": "Лондон → Франция → Гродно → Минск",
        "headline": "Английская разборка",
        "body": "Разборка у Лондона. Груз идёт сушей через Кале на Гродно.",
    },
]

FAQ_CATEGORIES = [
    {"id": "all", "label": "Все вопросы"},
    {"id": "products", "label": "Виды продукции"},
    {"id": "guarantees", "label": "Гарантии"},
    {"id": "payment", "label": "Оплата и скидки"},
    {"id": "partnership", "label": "Сотрудничество"},
]

FAQ_ITEMS = [
    {
        "id": "chto-takoe-mashinokomplekt",
        "category": "products",
        "question": "Что такое машинокомплект?",
        "paragraphs": [
            "Машинокомплект — автомобиль, выкупленный на аукционе и разобранный на узлы и детали.",
            "Кузовные элементы и катализаторы входят в стандартный комплект.",
        ],
        "bullets": ["сиденья;", "аккумулятор;", "бензобак."],
    },
    {
        "id": "komplektnost-zakaza",
        "category": "products",
        "question": "Можно ли самому собрать комплектность заказа?",
        "paragraphs": [
            "Да. Базово: МШК, П/К, НСК и ДВС. Через бланк можно добавить или убрать позиции.",
        ],
    },
    {
        "id": "evropejskie-avto",
        "category": "products",
        "question": "Есть ли европейские автомобили?",
        "paragraphs": ["Из Европы везём только из Англии — Copart UK и партнёры."],
    },
    {
        "id": "garantii",
        "category": "guarantees",
        "question": "Какие гарантии на комплекты?",
        "paragraphs": [
            "На осмотр — 2 недели; при повреждении — компенсация по условиям договора.",
        ],
    },
    {
        "id": "oplata",
        "category": "payment",
        "question": "Как проходит оплата?",
        "paragraphs": [
            "Расходы по стране — в течение 3 рабочих дней; остаток — после получения товара.",
        ],
    },
]

POPULAR_MODELS = [
    {
        "id": 1,
        "title": "Tesla Model Y",
        "year": "2023",
        "price_usa": "от 35 000 $",
        "price_by": "49 000 $",
        "savings": "-29%",
        "condition": "new",
        "specs": ["Long Range", "Полный привод", "533 км"],
    },
    {
        "id": 2,
        "title": "Ford Mustang GT",
        "year": "2022",
        "price_usa": "от 28 000 $",
        "price_by": "40 000 $",
        "savings": "-30%",
        "condition": "used",
        "specs": ["5.0L V8", "450 л.с.", "Задний привод"],
    },
    {
        "id": 3,
        "title": "BMW M4 Competition",
        "year": "2023",
        "price_usa": "от 45 000 $",
        "price_by": "64 000 $",
        "savings": "-30%",
        "condition": "damaged",
        "specs": ["3.0L I6", "503 л.с.", "Лёгкие повреждения"],
    },
]
