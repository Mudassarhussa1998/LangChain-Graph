# LangChain RAG Frontend

A modern web interface for the LangChain RAG (Retrieval-Augmented Generation) project. Upload PDF documents, process them, and ask questions powered by Google Gemini AI.

## Architecture

### Backend (FastAPI)
- Located in `backend/app.py`
- Wraps existing RAG functionality (`chain.py`, `ingest.py`)
- Provides REST API endpoints
- Runs on port 8000

### Frontend (React + Vite)
- Located in `frontend/`
- Modern React 18 with Vite build tool
- Tailwind CSS for styling
- Axios for API communication
- Runs on port 3000 (dev server)

## Prerequisites

- **Python 3.10+** (tested with Python 3.14)
- **Node.js 18+** and npm
- **Google API Key** for Gemini access

## Installation

### 1. Backend Setup

#### Create and activate virtual environment (recommended):

```bash
# From workspace root
python3 -m venv .venv
source .venv/bin/activate  # On macOS/Linux
# or
.venv\Scripts\activate  # On Windows
```

#### Install dependencies:

```bash
# Install existing project dependencies
pip install -r requirements.txt

# Install backend-specific dependencies
pip install -r backend/requirements.txt
```

#### Configure environment variables:

Create a `.env` file in the workspace root (if not already present):

```
GOOGLE_API_KEY=your_google_api_key_here
```

To get a Google API key:
1. Visit https://makersuite.google.com/app/apikey
2. Create a new API key
3. Copy and paste it into your `.env` file

### 2. Frontend Setup

```bash
cd frontend
npm install
cd ..
```

## Running the Application

You need to run both the backend and frontend servers simultaneously.

### Terminal 1 - Backend Server

```bash
# From workspace root, with virtual environment activated
uvicorn backend.app:app --reload
```

The backend will start at `http://localhost:8000`

You can verify it's running by visiting:
- http://localhost:8000/api/health (should return `{"status":"ok"}`)

### Terminal 2 - Frontend Server

```bash
# From workspace root
cd frontend
npm run dev
```

The frontend will start at `http://localhost:3000`

Open your browser and visit `http://localhost:3000`

## Usage Guide

### 1. Upload Documents

- Click the upload area or drag and drop a PDF file
- Click **Upload File** to send it to the server
- Files are saved to the `data/` directory

### 2. Ingest Documents

- After uploading one or more PDFs, click **Ingest Documents**
- This processes all PDFs in the `data/` directory and creates the vector store
- Wait for the success message (may take 10-30 seconds depending on document size)
- The status indicator will turn green when ready

### 3. Ask Questions

- Type your question in the input box at the bottom
- Click **Send** or press Enter
- The AI will respond with an answer and cite sources
- Click on "Sources" to see which document pages were used

## API Endpoint Reference

### GET /api/health
Health check endpoint.

**Response:**
```json
{"status": "ok"}
```

### GET /api/status
Check if the vector store is ready and count documents.

**Response:**
```json
{
  "ready": true,
  "document_count": 3
}
```

### POST /api/upload
Upload a PDF file.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "filename": "document.pdf",
  "message": "File 'document.pdf' uploaded successfully"
}
```

### POST /api/ingest
Trigger ingestion of all PDFs in the data directory.

**Response:**
```json
{
  "message": "Ingestion completed successfully",
  "document_count": 3
}
```

### POST /api/ask
Ask a question about the documents.

**Request:**
```json
{
  "question": "What is the main topic?"
}
```

**Response:**
```json
{
  "answer": "The main topic is... [1][2]",
  "sources": [
    "[1] document.pdf, p.5",
    "[2] document.pdf, p.7"
  ]
}
```

## Project Structure

```
LangChain-Graph/
├── backend/
│   ├── app.py              # FastAPI application
│   └── requirements.txt    # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.jsx    # Main chat UI
│   │   │   ├── MessageBubble.jsx    # Message display
│   │   │   ├── SourceCitation.jsx   # Source references
│   │   │   └── FileUpload.jsx       # File upload UI
│   │   ├── services/
│   │   │   └── api.js              # API client
│   │   ├── App.jsx                 # Root component
│   │   ├── main.jsx                # Entry point
│   │   └── index.css               # Global styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── chain.py              # RAG chain logic (existing)
├── ingest.py             # Document ingestion (existing)
├── config.py             # Configuration (existing)
├── llm.py                # LLM setup (existing)
├── retriever.py          # Vector retriever (existing)
├── prompts.py            # Prompt templates (existing)
├── data/                 # PDF storage directory
├── vectorstore/          # Chroma vector database
├── .env                  # Environment variables
└── requirements.txt      # Project dependencies
```

## Troubleshooting

### Backend Issues

**Error: "No module named 'chain'"**
- Make sure you're running uvicorn from the workspace root
- The backend uses `sys.path` manipulation to import from the parent directory
- Command: `uvicorn backend.app:app --reload` (not `cd backend && uvicorn app:app`)

**Error: "GOOGLE_API_KEY not set"**
- Ensure `.env` file exists in workspace root
- Verify GOOGLE_API_KEY is set correctly
- Restart the backend server after modifying `.env`

**Error: "Vector store not initialized"**
- You need to upload PDFs and click "Ingest Documents" before asking questions
- Check that `data/` directory contains PDF files
- Check that `vectorstore/` directory exists after ingestion

### Frontend Issues

**CORS errors in browser console**
- Ensure backend is running on port 8000
- Check CORS middleware in `backend/app.py` allows http://localhost:3000
- Try restarting both servers

**"No response from server" error**
- Verify backend is running: visit http://localhost:8000/api/health
- Check if backend crashed (look at Terminal 1)
- Ensure no firewall is blocking port 8000

**Vite proxy not working**
- The frontend uses Vite's proxy feature to forward `/api` requests to `http://localhost:8000`
- This is configured in `frontend/vite.config.js`
- If issues persist, you can modify `api.js` to use absolute URLs

### Document Processing Issues

**Ingestion takes too long**
- Large PDFs (100+ pages) may take 30-60 seconds
- The UI will show "Ingesting documents..." status
- Wait for completion message before asking questions

**Sources not displaying**
- Sources are only shown for successful AI responses
- Click the "Sources" button to expand the citation list
- Sources format: `[1] filename.pdf, p.5`

**AI says "The documents do not contain enough information"**
- The question may be outside the scope of uploaded documents
- Try rephrasing the question
- Ensure ingestion completed successfully
- Check that relevant PDFs were uploaded

## Development

### Running in Production

**Backend:**
```bash
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

Or serve the `frontend/dist` directory with any static file server.

### Environment Variables

- `GOOGLE_API_KEY` - Required for Google Gemini API access
- Other LangChain/Chroma variables are configured in `config.py`

### Customization

**Change AI model:**
Edit `config.py` and modify `CHAT_MODEL` or `EMBED_MODEL`

**Adjust chunk size:**
Edit `CHUNK_SIZE` and `CHUNK_OVERLAP` in `config.py`

**Change number of retrieved documents:**
Edit `TOP_K` in `config.py`

**Modify styling:**
Edit Tailwind classes in React components or extend `tailwind.config.js`

## Tech Stack

### Backend
- FastAPI - Modern Python web framework
- Uvicorn - ASGI server
- LangChain - LLM orchestration
- Google Gemini - Language model
- Chroma - Vector database
- PyPDF - PDF processing

### Frontend
- React 18 - UI library
- Vite - Build tool and dev server
- Tailwind CSS - Utility-first CSS framework
- Axios - HTTP client
- PostCSS & Autoprefixer - CSS processing

## License

This project extends the existing LangChain RAG implementation with a web interface.
