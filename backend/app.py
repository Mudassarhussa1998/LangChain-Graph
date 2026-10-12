import sys
from pathlib import Path
import logging

# Add parent directory to sys.path to import existing modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, HTTPException, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import shutil
import os

from chain import ask
from ingest import ingest
from config import DATA_DIR, VECTOR_DIR

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


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    try:
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Health check failed")


@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    """Check if vector store exists and is ready"""
    try:
        vector_dir = Path(VECTOR_DIR)
        ready = vector_dir.exists() and any(vector_dir.iterdir())
        
        # Count documents in data directory
        data_dir = Path(DATA_DIR)
        document_count = len(list(data_dir.glob("*.pdf"))) if data_dir.exists() else 0
        
        return {
            "ready": ready,
            "document_count": document_count if ready else None
        }
    except Exception as e:
        logger.error(f"Status check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Status check failed")


@app.post("/api/ask", response_model=QuestionResponse)
async def ask_question(request: QuestionRequest):
    """Ask a question and get an answer from the RAG system"""
    try:
        if not request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")
        
        # Check if vector store exists
        vector_dir = Path(VECTOR_DIR)
        if not vector_dir.exists() or not any(vector_dir.iterdir()):
            raise HTTPException(
                status_code=400, 
                detail="Vector store not initialized. Please upload and ingest documents first."
            )
        
        result = ask(request.question)
        
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


@app.post("/api/ingest", response_model=IngestResponse)
async def trigger_ingest():
    """Trigger ingestion of all PDFs in the data directory"""
    try:
        data_dir = Path(DATA_DIR)
        if not data_dir.exists():
            data_dir.mkdir(parents=True, exist_ok=True)
        
        pdf_files = list(data_dir.glob("*.pdf"))
        if not pdf_files:
            raise HTTPException(
                status_code=400, 
                detail="No PDF files found in data directory. Please upload files first."
            )
        
        ingest()
        
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
async def upload_file(file: UploadFile = File(...)):
    """Upload a PDF file to the data directory"""
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400, 
                detail="Only PDF files are allowed"
            )
        
        # Ensure data directory exists
        data_dir = Path(DATA_DIR)
        data_dir.mkdir(parents=True, exist_ok=True)
        
        # Save file
        file_path = data_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        return {
            "filename": file.filename,
            "message": f"File '{file.filename}' uploaded successfully"
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
