from dataclasses import dataclass
import logging
from typing import Protocol

from app.config import Settings

logger = logging.getLogger(__name__)


class FileStorageError(RuntimeError):
    """Raised when object storage cannot complete a requested operation."""


@dataclass(frozen=True)
class StoredFile:
    content: bytes
    content_type: str | None


class FileStorage(Protocol):
    def upload(
        self,
        storage_key: str,
        content: bytes,
        content_type: str | None,
    ) -> None:
        ...

    def download(self, storage_key: str) -> StoredFile:
        ...

    def delete(self, storage_key: str) -> None:
        ...


class GCSFileStorage:
    def __init__(self, settings: Settings) -> None:
        if not settings.gcs_bucket_name:
            raise FileStorageError("GCS_BUCKET_NAME is not configured")

        try:
            from google.cloud import storage
            from google.api_core.exceptions import GoogleAPIError, NotFound
        except ImportError as exc:
            raise FileStorageError("google-cloud-storage is not installed") from exc

        self._google_cloud_error = GoogleAPIError
        self._not_found = NotFound
        self._client = storage.Client(project=settings.gcs_project_id)
        self._bucket = self._client.bucket(settings.gcs_bucket_name)

    def upload(
        self,
        storage_key: str,
        content: bytes,
        content_type: str | None,
    ) -> None:
        try:
            blob = self._bucket.blob(storage_key)
            blob.upload_from_string(content, content_type=content_type)
        except self._google_cloud_error as exc:
            raise FileStorageError("File upload failed") from exc

    def download(self, storage_key: str) -> StoredFile:
        try:
            blob = self._bucket.blob(storage_key)
            content = blob.download_as_bytes()
            return StoredFile(content=content, content_type=blob.content_type)
        except self._not_found as exc:
            raise FileStorageError("File not found in storage") from exc
        except self._google_cloud_error as exc:
            raise FileStorageError("File download failed") from exc

    def delete(self, storage_key: str) -> None:
        try:
            self._bucket.blob(storage_key).delete()
        except self._not_found:
            logger.warning("GCS object already missing during cleanup: %s", storage_key)
        except self._google_cloud_error as exc:
            raise FileStorageError("File cleanup failed") from exc
