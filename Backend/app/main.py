from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import router as auth_router
from app.config import Settings, get_settings
from app.db import Database
from app.exceptions import register_exception_handlers
from app.projects import router as projects_router
from app.search import router as search_router
from app.storage import FileStorage, GCSFileStorage


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
    file_storage: FileStorage | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)
    resolved_database = database or Database(resolved_settings)
    resolved_file_storage = file_storage

    if resolved_file_storage is None and resolved_settings.gcs_bucket_name:
        resolved_file_storage = GCSFileStorage(resolved_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = resolved_settings
        app.state.database = resolved_database
        app.state.file_storage = resolved_file_storage
        resolved_database.connect()

        try:
            yield
        finally:
            resolved_database.close()

    app = FastAPI(
        title=resolved_settings.app_name,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(auth_router)
    app.include_router(projects_router)
    app.include_router(search_router)

    @app.get("/health")
    def health(request: Request) -> JSONResponse:
        db_ready = request.app.state.database.ping()
        http_status = (
            status.HTTP_200_OK
            if db_ready
            else status.HTTP_503_SERVICE_UNAVAILABLE
        )

        return JSONResponse(
            status_code=http_status,
            content={
                "status": "ok" if db_ready else "degraded",
                "api": "running",
                "database": "reachable" if db_ready else "unreachable",
            },
        )

    return app


app = create_app()