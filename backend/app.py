import sys
from pathlib import Path
import logging

# Add parent directory to sys.path to import existing modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, HTTPException, File, UploadFile, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import shutil
import os

from chain import ask
from ingest import ingest
from config import DATA_DIR, VECTOR_DIR
from workspace import workspace_paths, safe_filename
from agent_service import chat, analyze_media, remember_exchange
from storage import (
    clear_messages, create_reminder, due_reminders, list_reminders,
    recent_messages, update_reminder,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="LangChain RAG API")


# Custom exception handler to prevent internal error leakage
@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc: Exception):
    """Sanitize 500 errors to prevent internal details from leaking to clients"""
    logger.error(f"Internal server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )


# CORS middleware to allow frontend access
# Configure allowed origins via ALLOWED_ORIGINS environment variable
# Example: ALLOWED_ORIGINS="http://localhost:3000,https://yourdomain.com"
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str


class QuestionResponse(BaseModel):
    answer: str
    sources: list


class IngestResponse(BaseModel):
    message: str
    document_count: int


class UploadResponse(BaseModel):
    filename: str
    message: str


class StatusResponse(BaseModel):
    ready: bool
    document_count: int | None


class HealthResponse(BaseModel):
    status: str


class ReminderRequest(BaseModel):
    task: str
    remind_at: str
    chat_id: str
    message_type: str = "reminder"


ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4",
    "video/mp4", "video/webm",
}
MAX_MEDIA_BYTES = 20 * 1024 * 1024


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    try:
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Health check failed")


@app.get("/api/status", response_model=StatusResponse)
async def get_status(x_workspace_id: str = Header(default="web")):
    """Check if vector store exists and is ready"""
    try:
        data_dir, vector_dir = workspace_paths(x_workspace_id)
        ready = vector_dir.exists() and any(vector_dir.iterdir())
        
        # Count documents in data directory
        document_count = len(list(data_dir.glob("*.pdf"))) if data_dir.exists() else 0
        
        return {
            "ready": ready,
            "document_count": document_count if ready else None
        }
    except Exception as e:
        logger.error(f"Status check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Status check failed")


@app.post("/api/ask", response_model=QuestionResponse)
async def ask_question(request: QuestionRequest, x_workspace_id: str = Header(default="web")):
    """Ask a question and get an answer from the RAG system"""
    try:
        if not request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")
        
        # Check if vector store exists
        _, vector_dir = workspace_paths(x_workspace_id)
        if not vector_dir.exists() or not any(vector_dir.iterdir()):
            raise HTTPException(
                status_code=400, 
                detail="Vector store not initialized. Please upload and ingest documents first."
            )
        
        result = ask(request.question, vector_dir=vector_dir)
        
        # Check if there was an error in the response
        if result["answer"].startswith("Error:"):
            logger.error(f"RAG chain error: {result['answer']}")
            raise HTTPException(
                status_code=500, 
                detail="Failed to process your question. Please try again."
            )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process question: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail="An error occurred while processing your question. Please try again."
        )


@app.post("/api/agent", response_model=QuestionResponse)
async def agent_message(request: QuestionRequest, x_workspace_id: str = Header(default="web")):
    """Use document RAG when useful and fall back to a general conversational assistant."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    try:
        _, vector_dir = workspace_paths(x_workspace_id)
        if vector_dir.exists() and any(vector_dir.iterdir()):
            result = ask(request.question, vector_dir=vector_dir)
            if result["answer"] != "The documents do not contain enough information." and not result["answer"].startswith("Error:"):
                remember_exchange(x_workspace_id, request.question, result["answer"])
                return result
        return {"answer": chat(request.question, x_workspace_id), "sources": []}
    except Exception as e:
        logger.error(f"Agent request failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="The AI service could not process this message. Check the backend logs and model configuration.")


@app.post("/api/analyze-media", response_model=QuestionResponse)
async def analyze_uploaded_media(
    file: UploadFile = File(...),
    prompt: str = "Describe and analyze this media carefully. Extract visible text and important details.",
    x_workspace_id: str = Header(default="web"),
):
    """Analyze an image, voice note, audio clip, or short video with Gemini."""
    del x_workspace_id  # Reserved for future persistent media conversations.
    mime_type = (file.content_type or "").lower().split(";", 1)[0].strip()
    if mime_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported media type: {mime_type or 'unknown'}")
    data = await file.read(MAX_MEDIA_BYTES + 1)
    if len(data) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Media must be 20 MB or smaller")
    try:
        return {"answer": analyze_media(data, mime_type, prompt), "sources": []}
    except Exception as e:
        logger.error(f"Media analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="The AI service could not analyze this media.")


@app.get("/api/memory")
async def get_memory(x_workspace_id: str = Header(default="web")):
    return {"messages": recent_messages(x_workspace_id, limit=10)}


@app.delete("/api/memory")
async def forget_memory(x_workspace_id: str = Header(default="web")):
    return {"deleted": clear_messages(x_workspace_id)}


@app.post("/api/reminders")
async def add_reminder(request: ReminderRequest, x_workspace_id: str = Header(default="web")):
    if not request.task.strip():
        raise HTTPException(status_code=400, detail="Reminder task cannot be empty")
    try:
        parsed = __import__("datetime").datetime.fromisoformat(request.remind_at.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Timezone required")
    except ValueError:
        raise HTTPException(status_code=400, detail="remind_at must be an ISO timestamp with timezone")
    if request.message_type not in {"reminder", "outbound"}:
        raise HTTPException(status_code=400, detail="Invalid message type")
    return create_reminder(
        x_workspace_id, request.chat_id, request.task.strip(), parsed.isoformat(), request.message_type
    )


@app.get("/api/reminders")
async def get_reminders(x_workspace_id: str = Header(default="web")):
    return {"reminders": list_reminders(x_workspace_id)}


@app.get("/api/reminders/due")
async def get_due_reminders():
    return {"reminders": due_reminders()}


@app.post("/api/reminders/{reminder_id}/complete")
async def complete_reminder(reminder_id: int):
    if not update_reminder(reminder_id, "sent"):
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"status": "sent"}


@app.delete("/api/reminders/{reminder_id}")
async def cancel_reminder(reminder_id: int, x_workspace_id: str = Header(default="web")):
    if not update_reminder(reminder_id, "cancelled", x_workspace_id):
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"status": "cancelled"}


@app.get("/api/documents")
async def list_documents(x_workspace_id: str = Header(default="web")):
    data_dir, _ = workspace_paths(x_workspace_id)
    files = [{"name": path.name, "size": path.stat().st_size} for path in data_dir.glob("*.pdf")] if data_dir.exists() else []
    return {"documents": sorted(files, key=lambda item: item["name"].lower())}


@app.delete("/api/documents")
async def delete_document(filename: str, x_workspace_id: str = Header(default="web")):
    data_dir, vector_dir = workspace_paths(x_workspace_id)
    target = data_dir / safe_filename(filename)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Document not found")
    target.unlink()
    if vector_dir.exists():
        shutil.rmtree(vector_dir)
    remaining = list(data_dir.glob("*.pdf"))
    if remaining:
        ingest(data_dir=data_dir, vector_dir=vector_dir)
    return {"deleted": target.name, "remaining": len(remaining)}


@app.delete("/api/documents/all")
async def clear_documents(x_workspace_id: str = Header(default="web")):
    data_dir, vector_dir = workspace_paths(x_workspace_id)
    deleted = len(list(data_dir.glob("*.pdf"))) if data_dir.exists() else 0
    if data_dir.exists():
        shutil.rmtree(data_dir)
    if vector_dir.exists():
        shutil.rmtree(vector_dir)
    return {"deleted": deleted}


@app.post("/api/ingest", response_model=IngestResponse)
async def trigger_ingest(x_workspace_id: str = Header(default="web")):
    """Trigger ingestion of all PDFs in the data directory"""
    try:
        data_dir, vector_dir = workspace_paths(x_workspace_id)
        if not data_dir.exists():
            data_dir.mkdir(parents=True, exist_ok=True)
        
        pdf_files = list(data_dir.glob("*.pdf"))
        if not pdf_files:
            raise HTTPException(
                status_code=400, 
                detail="No PDF files found in data directory. Please upload files first."
            )
        
        ingest(data_dir=data_dir, vector_dir=vector_dir)
        
        return {
            "message": "Ingestion completed successfully",
            "document_count": len(pdf_files)
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ingestion failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail="Document ingestion failed. Please try again."
        )


@app.post("/api/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...), x_workspace_id: str = Header(default="web")):
    """Upload a PDF file to the data directory"""
    try:
        # Validate file type
        filename = safe_filename(file.filename)
        if not filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400, 
                detail="Only PDF files are allowed"
            )
        
        # Ensure data directory exists
        data_dir, _ = workspace_paths(x_workspace_id)
        data_dir.mkdir(parents=True, exist_ok=True)
        
        # Save file
        file_path = data_dir / filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        return {
            "filename": filename,
            "message": f"File '{filename}' uploaded successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail="File upload failed. Please try again."
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
