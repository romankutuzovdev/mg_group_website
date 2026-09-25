# MG.GROUP API (FastAPI)

Отдельный бэкенд для сайта. Лоты аукционов живут здесь; Playwright на этом же сервере будет обновлять каталог через ingest-эндпоинты.

## Запуск

```bash
cd api
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Документация: http://localhost:8000/docs  
Health: http://localhost:8000/health

По умолчанию лоты читаются из `../lib/auctions/generated-lots.json`.

## Эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Статус + число лотов |
| GET | `/api/v1/lots` | Каталог с фильтрами и пагинацией |
| GET | `/api/v1/lots/featured` | Ближайшие / «живые» лоты |
| GET | `/api/v1/lots/meta` | Makes, sources, counts |
| GET | `/api/v1/lots/{slug}` | Один лот |
| PUT | `/api/v1/lots/{id}` | Upsert лота (Playwright) |
| POST | `/api/v1/lots/bulk` | Массовый upsert |
| DELETE | `/api/v1/lots/{id}` | Удалить лот |
| POST | `/api/v1/lots/reload` | Перечитать JSON с диска |
| GET | `/api/v1/pricing/commercial` | Тарифы разбора / доставки |
| POST | `/api/v1/pricing/quote` | Калькулятор USA / UK (комплекты) |
| POST | `/api/v1/pricing/customs-by` | Растаможка РБ (ЕЭК №107, как в боте) |
| POST | `/api/v1/pricing/weight` | Цена по весу |
| GET | `/api/v1/pricing/quote/lot/{slug}` | Просчёт конкретного лота |
| GET | `/api/v1/company` | Компания, телефоны, hero |
| GET | `/api/v1/team` | Команда |
| GET | `/api/v1/cities` | SEO-города |
| GET | `/api/v1/faq` | FAQ |
| GET | `/api/v1/kits/schemes` | Схемы комплектов (МШК/П/К/…) |
| GET | `/api/v1/kits/yards` | Разборки NJ/TX/UK |
| GET | `/api/v1/cases` | Кейсы из лотов + quote |
| GET | `/api/v1/purchased` | Купленные комплекты (feed из лотов) |
| GET | `/api/v1/purchased-cars` | Купленные целые авто (добавляет менеджер) |
| POST | `/api/v1/admin/purchased-cars` | Добавить целое авто на витрину |
| PATCH | `/api/v1/admin/purchased-cars/{id}` | Обновить |
| DELETE | `/api/v1/admin/purchased-cars/{id}` | Удалить |
| POST | `/api/v1/admin/purchased-cars/{id}/photo` | Загрузить фото |
| GET | `/api/v1/popular-models` | Популярные модели |
| POST | `/api/v1/leads` | Заявка с сайта |
| GET | `/api/v1/scraper/status` | Статус 24/7 парсера |
| POST | `/api/v1/scraper/start` | Запуск цикла Copart.com + IAAI |
| POST | `/api/v1/scraper/stop` | Остановка |
| POST | `/api/v1/scraper/run-once?sources=all` | Один проход (`copart` / `iaai` / `all`) |
| GET | `/api/v1/auth/telegram/config` | Username бота для Login Widget |
| POST | `/api/v1/auth/telegram` | Вход только через Telegram → JWT |
| GET | `/api/v1/me` | Профиль (Bearer JWT) |
| GET | `/api/v1/me/deals` | Сделки клиента |
| GET | `/api/v1/me/deals/{id}` | Сделка + этапы + медиа |
| POST | `/api/v1/admin/deals` | Создать сделку (admin JWT или `X-API-Key`) |
| PATCH | `/api/v1/admin/deals/{id}` | Обновить сделку |
| POST | `/api/v1/admin/deals/{id}/stages/{key}` | Обновить этап |
| POST | `/api/v1/admin/deals/{id}/media` | Загрузить фото/документ |
| GET | `/api/v1/media/{id}` | Скачать медиа (`Bearer` или `?access_token=`) |

## Личный кабинет (Telegram-only)

Вход **только** через [Telegram Login Widget](https://core.telegram.org/widgets/login). Email/пароль/SMS нет.

1. Создайте бота у [@BotFather](https://t.me/BotFather), включите Domain для домена сайта.
2. В `api/.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_BOT_USERNAME=YourBotName
JWT_SECRET=длинный-случайный-секрет
CABINET_ADMIN_TELEGRAM_IDS=11111111,22222222
INGEST_API_KEY=optional-admin-key
```

3. На сайте: `NEXT_PUBLIC_API_URL=https://api.example.com`, страница `/cabinet/`.
4. Менеджер создаёт сделку (telegram_id клиента):

```bash
curl -X POST http://127.0.0.1:8000/api/v1/admin/deals \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INGEST_API_KEY" \
  -d '{"telegram_id":123456789,"title":"2018 Toyota Camry","vin":"JT...","lot_number":"51369106"}'
```

Этапы: `selection`, `auction`, `logistics_usa`, `ocean_customs`, `delivery`.

Данные: SQLite `api/data/cabinet.db`, файлы в `api/data/uploads/`.

### Купленные целые авто (витрина)

Менеджер (Telegram ID в `CABINET_ADMIN_TELEGRAM_IDS`) добавляет авто в `/cabinet/` или через API:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/admin/purchased-cars \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INGEST_API_KEY" \
  -d '{
    "year": 2019, "make": "Toyota", "model": "Camry",
    "source": "Copart", "region": "США",
    "auction_price": 8500, "delivery": 2200, "market_by": 14500,
    "damage": "Front", "odometer": "87 000 mi",
    "image_url": "https://example.com/photo.jpg",
    "published": true
  }'
```

Публичная лента: `GET /api/v1/purchased-cars` → страница `/kuplennye-avto/`.

## Парсер newly listed (один Chrome, вкладки)

Не Bid.cars. Обходит **Copart.com**, **IAAI**, **Copart UK**, **Manheim**, **SalvageMarket**, **Encar** —
каждый источник в **своей вкладке одного Google Chrome**. Новые лоты upsert в store (+ persist JSON).

На фронте Manheim, SalvageMarket и Copart UK **Category B** помечаются как **«Закрытый аукцион»**.

### Один Chrome для всех агентов (Windows / macOS)

1. Закройте обычный Chrome (или используйте отдельный профиль из скрипта).
2. Запустите CDP-Chrome:
   - Windows: `api\scripts\start-chrome-cdp.bat`
   - macOS: `api/scripts/start-chrome-cdp.sh`
3. При необходимости войдите в IAAI / Manheim / Copart UK в этом же окне (капчи/логин). Encar — нужен KR egress (VPN/прокси).
4. В `api/.env`:

```env
SCRAPER_AUTOSTART=true
SCRAPER_SOURCES=copart,iaai,copart_uk,manheim,salvage_market,encar
SCRAPER_INTERVAL_SECONDS=600
SCRAPER_HEADLESS=false
SCRAPER_CDP_URL=http://127.0.0.1:9223
```

5. Старт API — агенты подключатся к этому Chrome и откроют вкладки (не новые окна).

По умолчанию автозапуск включён: цикл каждые `SCRAPER_INTERVAL_SECONDS` (600 сек).

```bash
cd api
uv pip install -r requirements.txt
playwright install chromium

# статус / ручное управление
curl http://127.0.0.1:8000/api/v1/scraper/status
curl -X POST 'http://127.0.0.1:8000/api/v1/scraper/run-once?sources=all'
curl -X POST http://127.0.0.1:8000/api/v1/scraper/start
curl -X POST http://127.0.0.1:8000/api/v1/scraper/stop
curl -X POST 'http://127.0.0.1:8000/api/v1/scraper/photos/run-once?limit=25'
```

В `status` смотрите `browser_mode: cdp`, `shared_chrome: true`, у каждого агента `tab_open: true`, плюс блок `photos` (очередь галерей).

### Фото с карточек лотов (нонстоп)

Отдельная вкладка Chrome (`photos`) обходит **каждую** карточку из каталога (`lotUrl`), собирает все фотографии и пишет в `imageUrls` / `imageUrl`.

- Включено по умолчанию: `SCRAPER_PHOTOS_ENABLED=true`
- Между лотами пауза `SCRAPER_PHOTO_DELAY_SECONDS` (по умолчанию 2.5 с)
- Когда очередь пуста — ждёт `SCRAPER_PHOTO_IDLE_SECONDS`, затем снова берёт новые лоты / следующий UTC-день
- List-парсеры **не затирают** уже собранную галерею (merge upsert)

```env
SCRAPER_PHOTOS_ENABLED=true
SCRAPER_PHOTO_BATCH_SIZE=25
SCRAPER_PHOTO_DELAY_SECONDS=2.5
SCRAPER_PHOTO_IDLE_SECONDS=300
```

### Очистка закончившихся аукционов

Лоты с `auctionDate` в прошлом **сразу скрываются** из API/каталога и **удаляются** из store
при каждом цикле парсера (и при старте API). Запас: `SCRAPER_AUCTION_GRACE_HOURS` (по умолчанию 3 ч).

```bash
# ручная очистка
curl -X POST http://127.0.0.1:8000/api/v1/lots/prune-ended
```

Новые лоты: `GET /api/v1/lots`. Фронт при `NEXT_PUBLIC_API_URL` обновляет каталог раз в 5 минут.

## Playwright ingest (ручная заливка)

```bash
curl -X POST http://localhost:8000/api/v1/lots/bulk \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INGEST_API_KEY" \
  -d '[{"id":"usa-1","slug":"copart-...","region":"usa","source":"copart",...}]'
```

Если `INGEST_API_KEY` пустой — ключ не требуется (dev).

## Связка с фронтом (Next.js)

В корне сайта задайте:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Фронт берёт лоты, featured, кейсы, купленные и заявки из этого API.
Если URL пустой — используется локальный `generated-lots.json`.

## Деплой на Windows Server (CI/CD)

Паттерн как у CRM-бота: push в `main` → GitHub Actions → SSH → `update-from-git.ps1` → рестарт службы `mg-api`.

### Один раз на сервере

Требования: Windows Server с OpenSSH Server, Git, Python 3.12+, Google Chrome, права администратора.

```powershell
git clone https://github.com/romankutuzovdev/mg_group_website.git C:\mg-api
powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\install-windows.ps1
```

Скрипт:

1. Ставит venv + зависимости + Playwright Chromium в `C:\mg-api\api\.venv`
2. Создаёт `api\data` / `api\data\uploads` (`cabinet.db` появится при первом старте)
3. Копирует `.env.example` → `api\.env`, если файла ещё нет
4. Регистрирует NSSM-службу **mg-api** (uvicorn `:80`)
5. Открывает firewall TCP 80

Заполните `C:\mg-api\api\.env` (Telegram, JWT, scraper). Для наполнения каталога лотов запустите Chrome с CDP:

```powershell
C:\mg-api\api\scripts\start-chrome-cdp.bat
```

При `SCRAPER_AUTOSTART=true` и `SCRAPER_PERSIST=true` API сам крутит парсер и пишет `lib\auctions\generated-lots.json`.

### GitHub Secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Описание |
|--------|----------|
| `SSH_HOST` | IP / домен Windows Server |
| `SSH_USER` | например `Administrator` |
| `SSH_PRIVATE_KEY` | приватный ключ целиком (`BEGIN`…`END`) |
| `SSH_PORT` | опционально, по умолчанию `22` |
| `APP_DIR` | опционально, по умолчанию `C:\mg-api` |

Workflow: [`.github/workflows/deploy-api-windows.yml`](../.github/workflows/deploy-api-windows.yml)  
Триггер: push в `main` по путям `api/**`, `lib/auctions/**`, или ручной **Run workflow**.

### Ручное обновление на сервере

```powershell
powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\update-from-git.ps1
```

Скрипт **не трогает** `api\.env`, `api\data\cabinet.db`, `api\data\uploads` и существующий `generated-lots.json` — только код, зависимости и рестарт службы. Health: `http://127.0.0.1/health` (порт **80**).
