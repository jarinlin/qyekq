import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def _load_env(path: Path):
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


_load_env(ROOT / ".env")

_db = os.environ.get("QYEBOT_DB_PATH", "")
DB_PATH = Path(_db) if _db and Path(_db).is_absolute() else ROOT / (_db or "data/qyebot.sqlite")
REDIS_URL = os.environ.get("QYEBOT_REDIS_URL", "redis://127.0.0.1:6379/0")
