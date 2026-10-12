from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
VECTOR_DIR = BASE_DIR / "vectorstore"
WORKSPACES_DIR = BASE_DIR / "workspaces"

CHAT_MODEL = "google_genai:gemini-3.7-flash"
EMBED_MODEL = "models/gemini-embedding-001"

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
TOP_K = 4
