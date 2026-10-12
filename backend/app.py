import sys
from pathlib import Path

# Add parent directory to sys.path to import existing modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import os

from chain import ask
from ingest import ingest
from config import DATA_DIR, VECTOR_DIR

app = FastAPI(title="LangChain RAG API")

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
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")


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
            raise HTTPException(status_code=500, detail=result["answer"])
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process question: {str(e)}")


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
