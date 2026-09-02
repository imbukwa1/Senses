from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    app_name: str
    database_url: str | None
    log_level: str
    db_pool_min_size: int
    db_pool_max_size: int
    auth_token_secret: str
    access_token_expire_minutes: int
    gcs_project_id: str | None = None
    gcs_bucket_name: str | None = None


def _read_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == "":
        return default

    try:
        return int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "SENSES Project Management API"),
        database_url=os.getenv("DATABASE_URL"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        db_pool_min_size=_read_int_env("DB_POOL_MIN_SIZE", 1),
        db_pool_max_size=_read_int_env("DB_POOL_MAX_SIZE", 10),
        auth_token_secret=os.getenv("AUTH_TOKEN_SECRET", ""),
        access_token_expire_minutes=_read_int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 60),
        gcs_project_id=os.getenv("GCS_PROJECT_ID"),
        gcs_bucket_name=os.getenv("GCS_BUCKET_NAME"),
    )
