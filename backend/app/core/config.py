from pathlib import Path
import os

from dotenv import load_dotenv


class Settings:
    def __init__(self) -> None:
        self.backend_dir = Path(__file__).resolve().parents[2]
        self.env_file = self.backend_dir / ".env"
        # Если есть backend/.env, подгружаем переменные из него.
        if self.env_file.exists():
            load_dotenv(self.env_file)

        default_data_dir = self.backend_dir / "data"
        self.data_dir = Path(os.getenv("CADRELAY_DATA_DIR", default_data_dir))
        self.storage_dir = self.data_dir / "storage"
        self.originals_dir = self.storage_dir / "originals"
        self.glb_dir = self.storage_dir / "glb"
        self.thumbnails_dir = self.storage_dir / "thumbnails"
        self.metadata_file = self.data_dir / "metadata.json"
        self.queue_file = self.data_dir / "queue.json"
        # local | redis | sqs
        self.queue_backend = os.getenv("CADRELAY_QUEUE_BACKEND", "local").strip().lower()
        self.max_upload_bytes = int(os.getenv("CADRELAY_MAX_UPLOAD_BYTES", 50 * 1024 * 1024))
        self.max_thumbnail_bytes = int(os.getenv("CADRELAY_MAX_THUMBNAIL_BYTES", 5 * 1024 * 1024))
        self.auto_worker_enabled = os.getenv("CADRELAY_AUTO_WORKER_ENABLED", "true").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        # local | firestore | postgres
        self.metadata_backend = os.getenv("CADRELAY_METADATA_BACKEND", "local").strip().lower()
        self.postgres_dsn = os.getenv("CADRELAY_POSTGRES_DSN", os.getenv("DATABASE_URL", "")).strip()
        # local | firebase
        self.storage_backend = os.getenv("CADRELAY_STORAGE_BACKEND", "local").strip().lower()
        self.firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
        self.firebase_storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip()
        self.google_application_credentials = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        # disabled | firebase | postgres
        self.auth_mode = os.getenv("CADRELAY_AUTH_MODE", "disabled").strip().lower()
        self.firebase_auth_credentials = os.getenv("FIREBASE_AUTH_CREDENTIALS", "").strip()
        self.auth_session_days = int(os.getenv("CADRELAY_AUTH_SESSION_DAYS", "30"))
        self.smtp_host = os.getenv("CADRELAY_SMTP_HOST", "").strip()
        self.smtp_port = int(os.getenv("CADRELAY_SMTP_PORT", "587"))
        self.smtp_username = os.getenv("CADRELAY_SMTP_USERNAME", "").strip()
        self.smtp_password = os.getenv("CADRELAY_SMTP_PASSWORD", "").strip()
        self.smtp_from = os.getenv("CADRELAY_SMTP_FROM", self.smtp_username).strip()
        self.smtp_use_tls = os.getenv("CADRELAY_SMTP_USE_TLS", "true").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        self.bootstrap_admin_emails = {
            email.strip().lower()
            for email in os.getenv("CADRELAY_BOOTSTRAP_ADMIN_EMAILS", "").split(",")
            if email.strip()
        }


settings = Settings()
