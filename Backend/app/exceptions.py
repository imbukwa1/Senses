import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import DatabaseConstraintError, DatabaseError

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"message": exc.detail}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"error": {"message": "Request validation failed", "details": exc.errors()}},
        )

    @app.exception_handler(DatabaseConstraintError)
    async def database_constraint_exception_handler(
        request: Request,
        exc: DatabaseConstraintError,
    ) -> JSONResponse:
        logger.exception("Database constraint exception")
        return JSONResponse(
            status_code=422,
            content={"error": {"message": "Database constraint failed"}},
        )

    @app.exception_handler(DatabaseError)
    async def database_exception_handler(request: Request, exc: DatabaseError) -> JSONResponse:
        logger.exception("Database exception")
        return JSONResponse(
            status_code=500,
            content={"error": {"message": "Database operation failed"}},
        )

    @app.exception_handler(Exception)
    async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled application exception")
        return JSONResponse(
            status_code=500,
            content={"error": {"message": "Internal server error"}},
        )
