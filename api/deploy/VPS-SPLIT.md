# Сайт + API на VPS, лоты с Windows, фото в R2

## Роли

| Роль | Где | Что делает |
|------|-----|------------|
| `APP_ROLE=scraper` | ваш Windows (`91.149…`) | Chrome, парсеры, заливка фото в **R2**, отдача каталога |
| `APP_ROLE=public` | VPS (BY) + домен | сайт, кабинет (`cabinet.db`), **тянет лоты** с Windows |

Браузер → `https://mg-group.by` → VPS (Next `out/` + FastAPI).  
Картинки в лотах → `https://pub-….r2.dev/...` (или свой CDN-домен).

```
[Chrome/VPN Windows] --scrapes--> lots.json + R2 photos
         |
         |  POST /api/v1/internal/lots-ingest  (push every ~3 min)
         v
[VPS 178.172.138.96]  site + cabinet.db + lots.json
         ^
   mg-group.by / IP (Caddy → API :8080)
```

## 1. Windows (фабрика)

В `C:\mg-api\api\.env` (см. `api/deploy/vps/env.scraper.example`):

```env
APP_ROLE=scraper
INGEST_API_KEY=длинный-секрет
PUBLIC_SITE_URL=http://178.172.138.96
REDIRECT_APEX_TO_VERCEL=false
LOTS_PUSH_URL=http://178.172.138.96/api/v1/internal/lots-ingest
LOTS_PUSH_API_KEY=длинный-секрет
LOTS_PUSH_INTERVAL_SECONDS=180
SCRAPER_AUTOSTART=true
R2_ENABLED=true
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=mg-group
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
```

Обновить:

```powershell
powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\update-from-git.ps1
```

Проверка экспорта (ключ обязателен, если задан):

```powershell
Invoke-RestMethod -Headers @{ "X-API-Key" = "длинный-секрет" } `
  http://127.0.0.1/api/v1/internal/lots-catalog | Select-Object -Expand counts
```

Фаервол: разрешить **только IP VPS** на 80/443 к Windows (или держать API за VPN).

## 2. VPS / хостер (сайт + кабинет)

См. скрипты в `api/deploy/vps/`.

Кратко:

```bash
# один раз
sudo bash api/deploy/vps/install.sh
# скопировать env
sudo cp api/deploy/vps/env.public.example /opt/mg-group/api/.env
sudo nano /opt/mg-group/api/.env   # домен, ключ, LOTS_SOURCE_URL, CABINET_SOURCE_URL
# DNS A-запись mg-group.by → IP VPS
sudo bash api/deploy/vps/update.sh
# подтянуть кабинет с Windows (сделки, юзеры, логистика, uploads)
sudo bash /opt/mg-group/api/deploy/vps/pull-cabinet.sh
```

Важные переменные VPS:

```env
APP_ROLE=public
REDIRECT_APEX_TO_VERCEL=false
INGEST_API_KEY=тот-же-секрет
LOTS_SOURCE_URL=http://91.149.133.54/api/v1/internal/lots-catalog
LOTS_SOURCE_API_KEY=тот-же-секрет
LOTS_SYNC_INTERVAL_SECONDS=120
CABINET_SOURCE_URL=http://91.149.133.54/api/v1/internal/cabinet-backup
CABINET_SOURCE_API_KEY=тот-же-секрет
CABINET_DB_PATH=/opt/mg-group/api/data/cabinet.db
CABINET_UPLOADS_DIR=/opt/mg-group/api/data/uploads
WEB_ROOT=/opt/mg-group/out
JWT_SECRET=...
TELEGRAM_BOT_TOKEN=...
```

### База кабинета на хостере

`cabinet.db` + `uploads/` (сделки, Telegram-юзеры, логистика, купленные авто) живут **только на VPS**.  
Один раз при переезде — `pull-cabinet.sh` (или `POST …/cabinet-pull-now`). Дальше Windows кабинет не пишет.

```bash
# с VPS
sudo bash /opt/mg-group/api/deploy/vps/pull-cabinet.sh

# или через API на public-ноде
curl -X POST -H "X-API-Key: секрет" https://mg-group.by/api/v1/internal/cabinet-pull-now
```

На Windows можно собрать zip вручную:

```powershell
powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\export-cabinet-backup.ps1
```

Принудительный sync лотов:

```bash
curl -X POST -H "X-API-Key: секрет" https://mg-group.by/api/v1/internal/lots-sync-now
```

Статус:

```bash
curl https://mg-group.by/api/v1/internal/lots-sync-status
curl https://mg-group.by/api/v1/internal/cabinet-pull-status
```

## 3. DNS

1. Пока тестируете VPS — поддомен `vps.mg-group.by` → VPS.  
2. Когда готово: `mg-group.by` / `www` → VPS, снять с Vercel.  
3. Windows больше не обслуживает домен (только экспорт лотов).

## 4. Фото

Парсер на Windows архивирует JPEG и **загружает в R2** (все регионы).  
В каталоге у лотов `imageUrl` / `imageUrls` уже CDN.  
VPS **не хранит** `/api/lot-photos` на диске.

## 5. Пока VPS нет

Код уже в репо. Режим `APP_ROLE=all` (по умолчанию) — как сейчас: всё на Windows + Vercel.  
Когда дадите VPS — запускаем `install.sh` / `update.sh`.
