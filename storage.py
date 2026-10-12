import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from config import BASE_DIR

DB_PATH = BASE_DIR / "state" / "indexia.db"


@contextmanager
def connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def initialize_storage():
    with connection() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_workspace
                ON messages(workspace_id, id DESC);
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                task TEXT NOT NULL,
                remind_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                message_type TEXT NOT NULL DEFAULT 'reminder',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reminders_due
                ON reminders(status, remind_at);
        """)
        columns = {row[1] for row in db.execute("PRAGMA table_info(reminders)").fetchall()}
        if "message_type" not in columns:
            db.execute("ALTER TABLE reminders ADD COLUMN message_type TEXT NOT NULL DEFAULT 'reminder'")


def add_message(workspace_id: str, role: str, content: str):
    with connection() as db:
        db.execute(
            "INSERT INTO messages(workspace_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (workspace_id, role, content[:12000], datetime.now(timezone.utc).isoformat()),
        )


def recent_messages(workspace_id: str, limit: int = 10) -> list[dict]:
    with connection() as db:
        rows = db.execute(
            "SELECT role, content, created_at FROM messages WHERE workspace_id=? ORDER BY id DESC LIMIT ?",
            (workspace_id, min(limit, 30)),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def clear_messages(workspace_id: str) -> int:
    with connection() as db:
        cursor = db.execute("DELETE FROM messages WHERE workspace_id=?", (workspace_id,))
        return cursor.rowcount


def create_reminder(workspace_id: str, chat_id: str, task: str, remind_at: str, message_type: str = "reminder") -> dict:
    with connection() as db:
        cursor = db.execute(
            "INSERT INTO reminders(workspace_id, chat_id, task, remind_at, message_type, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (workspace_id, chat_id, task[:2000], remind_at, message_type, datetime.now(timezone.utc).isoformat()),
        )
        reminder_id = cursor.lastrowid
    return {"id": reminder_id, "task": task, "remind_at": remind_at, "status": "pending", "message_type": message_type}


def list_reminders(workspace_id: str) -> list[dict]:
    with connection() as db:
        rows = db.execute(
            "SELECT id, task, remind_at, status, message_type FROM reminders WHERE workspace_id=? AND status='pending' ORDER BY remind_at LIMIT 25",
            (workspace_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def due_reminders(limit: int = 25) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        rows = db.execute(
            "SELECT id, chat_id, task, remind_at, message_type FROM reminders WHERE status='pending' AND remind_at<=? ORDER BY remind_at LIMIT ?",
            (now, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def update_reminder(reminder_id: int, status: str, workspace_id: str | None = None) -> int:
    with connection() as db:
        if workspace_id:
            cursor = db.execute("UPDATE reminders SET status=? WHERE id=? AND workspace_id=?", (status, reminder_id, workspace_id))
        else:
            cursor = db.execute("UPDATE reminders SET status=? WHERE id=?", (status, reminder_id))
        return cursor.rowcount


initialize_storage()
