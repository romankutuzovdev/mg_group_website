from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOTS_PATH = REPO_ROOT / "lib" / "auctions" / "generated-lots.json"
DEFAULT_CABINET_DB = API_ROOT / "data" / "cabinet.db"
DEFAULT_UPLOADS_DIR = API_ROOT / "data" / "uploads"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MG.GROUP API"
    api_prefix: str = "/api/v1"
    cors_origins: str = "*"
    lots_json_path: str = str(DEFAULT_LOTS_PATH)
    ingest_api_key: str = ""
    default_fx_gbp_usd: float = 1.29
    host: str = "0.0.0.0"
    port: int = 8000

    # Scraper — one Google Chrome, one tab per source (CDP on Windows)
    scraper_autostart: bool = True
    scraper_sources: str = "copart,iaai,copart_uk,manheim,salvage_market,encar"
    scraper_interval_seconds: int = 600  # 10 min
    scraper_max_pages_copart: int = 5
    scraper_max_pages_iaai: int = 5
    scraper_max_pages_copart_uk: int = 5
    scraper_max_pages_manheim: int = 5
    scraper_max_pages_salvage_market: int = 5
    scraper_max_pages_encar: int = 5
    scraper_page_size: int = 100
    scraper_timeout_ms: int = 60000
    scraper_headless: bool = True
    scraper_persist: bool = True
    # Attach to ONE Google Chrome with remote debugging (all agents = tabs)
    # Windows: run api/scripts/start-chrome-cdp.bat → SCRAPER_CDP_URL=http://127.0.0.1:9223
    # macOS:   run api/scripts/start-chrome-cdp.sh
    scraper_cdp_url: str = ""
    scraper_manheim_bearer_token: str = ""
    # Optional KR egress note for Encar (use KR proxy Chrome profile / VPN with CDP)
    scraper_encar_note: str = ""
    # Drop lots after auctionDate passes (plus grace). Soft-hidden in API immediately.
    scraper_prune_ended: bool = True
    scraper_auction_grace_hours: float = 3

    # Cabinet (Telegram Login Widget + JWT)
    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    jwt_secret: str = "dev-change-me"
    jwt_ttl_days: int = 30
    cabinet_admin_telegram_ids: str = ""  # comma-separated telegram user ids
    cabinet_db_path: str = str(DEFAULT_CABINET_DB)
    cabinet_uploads_dir: str = str(DEFAULT_UPLOADS_DIR)
    telegram_auth_max_age_seconds: int = 86400  # 24h
    # Local-only: POST /auth/dev + кнопки тестового входа в /cabinet/
    cabinet_dev_auth: bool = False
    cabinet_dev_telegram_id: int = 900001  # менеджер (обычно в CABINET_ADMIN_TELEGRAM_IDS)
    cabinet_dev_client_telegram_id: int = 900002  # обычный клиент (не admin)



@lru_cache
def get_settings() -> Settings:
    return Settings()
