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
        self.metadata_file = self.data_dir / "metadata.json"
        self.queue_file = self.data_dir / "queue.json"
        self.max_upload_bytes = int(os.getenv("CADRELAY_MAX_UPLOAD_BYTES", 50 * 1024 * 1024))
        self.auto_worker_enabled = os.getenv("CADRELAY_AUTO_WORKER_ENABLED", "true").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        # local | firestore
        self.metadata_backend = os.getenv("CADRELAY_METADATA_BACKEND", "local").strip().lower()
        # local | firebase
        self.storage_backend = os.getenv("CADRELAY_STORAGE_BACKEND", "local").strip().lower()
        self.firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
        self.firebase_storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip()
        self.google_application_credentials = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        # disabled | firebase
        self.auth_mode = os.getenv("CADRELAY_AUTH_MODE", "disabled").strip().lower()
        self.firebase_auth_credentials = os.getenv("FIREBASE_AUTH_CREDENTIALS", "").strip()


settings = Settings()
