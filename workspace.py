import hashlib
import re
from pathlib import Path

from config import DATA_DIR, VECTOR_DIR, WORKSPACES_DIR


def workspace_paths(workspace_id: str | None) -> tuple[Path, Path]:
    """Return isolated storage paths without exposing user identifiers on disk."""
    if not workspace_id or workspace_id == "web":
        return DATA_DIR, VECTOR_DIR

    digest = hashlib.sha256(workspace_id.encode("utf-8")).hexdigest()[:24]
    root = WORKSPACES_DIR / digest
    return root / "data", root / "vectorstore"


def safe_filename(filename: str | None) -> str:
    name = Path(filename or "document.pdf").name
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .")
    return cleaned or "document.pdf"
