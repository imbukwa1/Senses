from __future__ import annotations

from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import os
import secrets
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from app.config import Settings
from app.db import DatabaseSession

router = APIRouter(tags=["authentication"])
bearer_scheme = HTTPBearer(auto_error=False)

PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 260000


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class UserResponse(BaseModel):
    id: UUID
    name: str
    email: EmailStr


@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    name: str
    email: str


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return "$".join(
        (
            PASSWORD_HASH_ALGORITHM,
            str(PASSWORD_HASH_ITERATIONS),
            _base64url_encode(salt),
            _base64url_encode(password_hash),
        )
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, encoded_salt, encoded_hash = stored_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False

        salt = _base64url_decode(encoded_salt)
        expected_hash = _base64url_decode(encoded_hash)
        candidate_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
        return hmac.compare_digest(candidate_hash, expected_hash)
    except (ValueError, TypeError):
        return False


def create_access_token(
    user: AuthenticatedUser,
    settings: Settings,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    if not settings.auth_token_secret:
        raise RuntimeError("AUTH_TOKEN_SECRET is not configured")

    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "exp": int(expires_at.timestamp()),
    }
    encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign_token_payload(encoded_payload, settings.auth_token_secret)
    return f"{encoded_payload}.{signature}", expires_at


def verify_access_token(token: str, settings: Settings) -> UUID:
    if not settings.auth_token_secret:
        raise_unauthorized()

    try:
        encoded_payload, signature = token.split(".", 1)
        expected_signature = _sign_token_payload(encoded_payload, settings.auth_token_secret)
        if not secrets.compare_digest(signature, expected_signature):
            raise_unauthorized()

        payload = json.loads(_base64url_decode(encoded_payload))
        expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=UTC)
        if expires_at <= datetime.now(UTC):
            raise_unauthorized()

        return UUID(str(payload["sub"]))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise_unauthorized()


def authenticate_user(session: DatabaseSession, email: str, password: str) -> AuthenticatedUser | None:
    row = session.fetch_one(
        """
        SELECT users.id, users.name, users.email, user_credentials.password_hash
        FROM users
        JOIN user_credentials ON user_credentials.user_id = users.id
        WHERE users.email = %s
        """,
        (email,),
    )
    if row is None or not verify_password(password, row["password_hash"]):
        return None

    return AuthenticatedUser(id=row["id"], name=row["name"], email=row["email"])


def load_user(session: DatabaseSession, user_id: UUID) -> AuthenticatedUser | None:
    row = session.fetch_one(
        "SELECT id, name, email FROM users WHERE id = %s",
        (user_id,),
    )
    if row is None:
        return None

    return AuthenticatedUser(id=row["id"], name=row["name"], email=row["email"])


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise_unauthorized()

    settings: Settings = request.app.state.settings
    user_id = verify_access_token(credentials.credentials, settings)

    with request.app.state.database.session(actor_user_id=user_id) as session:
        user = load_user(session, user_id)

    if user is None:
        raise_unauthorized()

    return user


@router.post("/auth/login", response_model=TokenResponse)
def login(request: Request, payload: LoginRequest) -> TokenResponse:
    settings: Settings = request.app.state.settings

    with request.app.state.database.session() as session:
        user = authenticate_user(session, payload.email, payload.password)

    if user is None:
        raise_unauthorized()

    token, expires_at = create_access_token(user, settings)
    return TokenResponse(access_token=token, expires_at=expires_at)


@router.get("/me", response_model=UserResponse)
def read_me(current_user: AuthenticatedUser = Depends(get_current_user)) -> UserResponse:
    return UserResponse(id=current_user.id, name=current_user.name, email=current_user.email)


def raise_unauthorized() -> None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _sign_token_payload(encoded_payload: str, secret: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _base64url_encode(digest)


def _base64url_encode(value: bytes) -> str:
    return urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return urlsafe_b64decode(value + padding)
