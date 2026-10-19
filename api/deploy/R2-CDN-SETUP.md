# Cloudflare R2 — фото USA/UK (бесплатный тариф)

Раздача архивных фото лотов через CDN. Windows парсит и кладёт JPEG на диск, затем заливает в R2. В каталоге — публичные URL. После конца аукциона prune удаляет и диск, и объекты в R2.

## Важно: два разных URL

| Что | Пример | Куда писать |
|-----|--------|-------------|
| **S3 API** (загрузка с сервера) | `https://ACCOUNT_ID.r2.cloudflarestorage.com` | не в `.env` как public; Account ID берём из него |
| **Public URL** (браузер) | `https://pub-xxxx.r2.dev` или `https://img.mg-group.by` | `R2_PUBLIC_BASE_URL` |

`….r2.cloudflarestorage.com` — **не** для картинок на сайте. Без публичного доступа браузер получит 401/AccessDenied.

## 1. Cloudflare Dashboard

1. [R2](https://dash.cloudflare.com/) → **Create bucket** → например `mg-lot-photos`
2. **Manage R2 API Tokens** → Create API token  
   - Object Read & Write  
   - этот bucket  
3. Скопируйте Access Key ID, Secret, Account ID
4. Bucket → **Settings** → **Public Development URL** → **Enable**  
   (подтвердите `allow`)  
5. Скопируйте **Public Bucket URL** вида `https://pub-….r2.dev`  
   Или подключите Custom Domain.

## 2. Windows: `C:\mg-api\api\.env`

```
R2_ENABLED=true
R2_ACCOUNT_ID=ваш_account_id
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=mg-lot-photos
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
```

Account ID — это часть API-хоста:  
`https://**9251135f1b2774cd83b03ac72d4acd55**.r2.cloudflarestorage.com`

## 3. Обновить API

```powershell
powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\update-from-git.ps1
```

## 4. Поведение

| Регион | CDN |
|--------|-----|
| USA, UK | да |
| Korea, China | нет |

URL в лоте: `https://pub-…/lots/{id}/01-….jpg`

Если ключи светились в чате/мессенджере — **перевыпустите** API token в Cloudflare.
