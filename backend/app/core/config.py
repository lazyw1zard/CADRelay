from pathlib import Path
import os


class Settings:
    def __init__(self) -> None:
        default_data_dir = Path(__file__).resolve().parents[2] / "data"
        self.data_dir = Path(os.getenv("CADRELAY_DATA_DIR", default_data_dir))
        self.storage_dir = self.data_dir / "storage"
        self.originals_dir = self.storage_dir / "originals"
        self.glb_dir = self.storage_dir / "glb"
        self.metadata_file = self.data_dir / "metadata.json"
        self.queue_file = self.data_dir / "queue.json"
        self.max_upload_bytes = int(os.getenv("CADRELAY_MAX_UPLOAD_BYTES", 50 * 1024 * 1024))


settings = Settings()
