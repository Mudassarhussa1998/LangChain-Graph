# Implementation Plan: Frontend for RAG Project

## Project Analysis Summary

**Existing Backend Structure:**
- **Core Functions:** `ask(question: str) -> dict` in `chain.py` and `ingest()` in `ingest.py`
- **Data Flow:** PDFs in `data/` → ingest → Chroma vectorstore → retriever → LLM → answer with sources
- **Dependencies:** LangChain, Google Gemini (gemini-3.7-flash), Chroma, PyPDF
- **Configuration:** `config.py` defines paths (DATA_DIR, VECTOR_DIR), model names, and chunking params
- **Response Format:** `{"answer": str, "sources": [str]}` where sources are "[1] filename.pdf, p.3" format
- **Environment:** Python 3.14, requires .env with Google API key

**Design Decisions:**
1. **Backend Architecture:** FastAPI wrapper in `backend/app.py` that imports existing modules without modification. Use `sys.path.insert(0, parent_dir)` to enable imports from workspace root.
2. **File Upload Strategy:** Accept PDFs via multipart/form-data, save to existing `data/` directory, then trigger ingestion.
3. **Frontend Stack:** Vite + React 18 + Tailwind CSS for modern, fast development with hot module replacement.
4. **API Communication:** Axios for cleaner error handling and request/response interceptors.
5. **State Management:** React hooks (useState, useEffect) - no Redux needed for this scope.
6. **Styling Approach:** Tailwind utility classes with custom gradient backgrounds, smooth transitions, and responsive breakpoints.

---

## Implementation Steps

- [ ] 1. Create FastAPI backend structure and requirements file.
      Create `backend/` directory with `app.py` and `requirements.txt`. The app.py imports `ask` from `chain.py` and `ingest` from `ingest.py` using sys.path manipulation to include parent directory. Include CORS middleware for http://localhost:3000.
      Files: backend/app.py, backend/requirements.txt
      Verify: `cd backend && python3 -m pip install -r requirements.txt && python3 -c "from app import app; print('Import successful')"` confirms no import errors.

- [ ] 2. Implement FastAPI endpoints for chat, ingestion, upload, status, and health checks.
      In `backend/app.py`, implement: POST /api/ask (accepts {question: str}, returns {answer, sources}), POST /api/ingest (triggers ingest() function), POST /api/upload (accepts PDF file, saves to data/), GET /api/status (checks if vectorstore exists), GET /api/health (returns OK). Use FastAPI's File and UploadFile for multipart uploads. Include error handling that returns proper HTTP status codes.
      Files: backend/app.py
      Verify: `cd backend && python3 -m uvicorn app:app --reload &` starts server, then `curl http://localhost:8000/api/health` returns {"status":"ok"}.

- [ ] 3. Create React frontend project structure with Vite and Tailwind CSS.
      Initialize Vite project in `frontend/` directory with React template. Install dependencies: react, react-dom, axios, tailwind, autoprefixer, postcss. Configure Tailwind in tailwind.config.js with custom colors/gradients. Set up basic src/ structure with components/, services/, and App.jsx.
      Files: frontend/package.json, frontend/vite.config.js, frontend/tailwind.config.js, frontend/postcss.config.js, frontend/src/index.css, frontend/index.html
      Verify: `cd frontend && npm install && npm run dev` starts dev server on port 3000 without errors.

- [ ] 4. Implement API service layer with axios for backend communication.
      Create `frontend/src/services/api.js` with functions: askQuestion(question), uploadFile(file), triggerIngest(), getStatus(), getHealth(). Configure axios baseURL to http://localhost:8000. Include error handling and response transformation.
      Files: frontend/src/services/api.js
      Verify: `cd frontend && npm run build` completes successfully, confirming no syntax errors.

- [ ] 5. Build MessageBubble component for displaying user and AI messages.
      Create `frontend/src/components/MessageBubble.jsx` that renders individual messages with role-based styling (user messages right-aligned with blue gradient, AI messages left-aligned with gray background). Include timestamp, message text, and conditional sources display. Use Tailwind for rounded corners, shadows, and animations.
      Files: frontend/src/components/MessageBubble.jsx
      Verify: `cd frontend && npm run build` completes successfully.

- [ ] 6. Build SourceCitation component for collapsible source references.
      Create `frontend/src/components/SourceCitation.jsx` that displays sources array in a collapsible section. Show source count badge, toggle expand/collapse, render each source with icon. Use smooth height transitions and proper accessibility attributes.
      Files: frontend/src/components/SourceCitation.jsx
      Verify: `cd frontend && npm run build` completes successfully.

- [ ] 7. Build FileUpload component with drag-and-drop and button upload.
      Create `frontend/src/components/FileUpload.jsx` with dropzone functionality. Handle file validation (PDF only, size limits), visual feedback for drag-over state, upload progress indicator, and success/error messages. Integrate with api.uploadFile() and api.triggerIngest().
      Files: frontend/src/components/FileUpload.jsx
      Verify: `cd frontend && npm run build` completes successfully.

- [ ] 8. Build ChatInterface component integrating all sub-components.
      Create `frontend/src/components/ChatInterface.jsx` as main component. Manage chat state (messages array, loading state, error state). Include scrollable message container with auto-scroll to bottom, input field with submit handling, FileUpload integration, and status indicator showing vectorstore state. Implement loading spinner for pending requests.
      Files: frontend/src/components/ChatInterface.jsx
      Verify: `cd frontend && npm run build` completes successfully.

- [ ] 9. Create App.jsx with layout, header, and ChatInterface integration.
      Build `frontend/src/App.jsx` with header (project title, description), main content area with gradient background, and footer. Center ChatInterface component with max-width container. Apply responsive design with Tailwind breakpoints (mobile-first approach). Include error boundary for graceful error handling.
      Files: frontend/src/App.jsx
      Verify: `cd frontend && npm run build` completes successfully.

- [ ] 10. Write comprehensive README_FRONTEND.md with setup and usage instructions.
       Create documentation covering: project overview, prerequisites (Python 3.14+, Node.js 18+), backend setup (virtualenv creation, dependency installation, .env configuration with GOOGLE_API_KEY), frontend setup (npm install), running both servers (uvicorn for backend on :8000, vite for frontend on :3000), API endpoint documentation (request/response schemas), troubleshooting section (CORS issues, import errors, missing vectorstore), and architecture notes (sys.path import strategy, file upload flow).
       Files: README_FRONTEND.md
       Verify: Read through README_FRONTEND.md and confirm all commands are accurate and match the implementation.

- [ ] 11. Integration test: upload PDF, ingest, and query end-to-end.
       Start both servers (backend on :8000, frontend on :3000). Using the frontend UI, upload a sample PDF to data/, trigger ingestion, verify vectorstore creation in filesystem, then submit a question and verify AI response with source citations appears correctly. Check browser console for errors and network tab for proper API communication.
       Files: (no new files, testing only)
       Verify: Open browser at http://localhost:3000, complete upload → ingest → query flow, confirm response displays with sources and no console errors.

---

## Files to Create

### Backend
- `backend/app.py` - FastAPI application with CORS, file upload, and endpoint implementations
- `backend/requirements.txt` - fastapi, uvicorn[standard], python-multipart

### Frontend
- `frontend/package.json` - Dependencies and scripts
- `frontend/vite.config.js` - Vite configuration
- `frontend/tailwind.config.js` - Tailwind customization
- `frontend/postcss.config.js` - PostCSS configuration
- `frontend/index.html` - Entry HTML
- `frontend/src/main.jsx` - React entry point
- `frontend/src/App.jsx` - Root component
- `frontend/src/index.css` - Global styles with Tailwind directives
- `frontend/src/services/api.js` - API client
- `frontend/src/components/ChatInterface.jsx` - Main chat UI
- `frontend/src/components/MessageBubble.jsx` - Message display component
- `frontend/src/components/SourceCitation.jsx` - Source references component
- `frontend/src/components/FileUpload.jsx` - File upload component

### Documentation
- `README_FRONTEND.md` - Complete setup and usage guide

---

## Key Implementation Notes

### Import Path Strategy
The backend must add the workspace root to sys.path before importing:
```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from chain import ask
from ingest import ingest
```

### API Response Format
Maintain exact compatibility with existing `ask()` return format:
```json
{
  "answer": "The answer text with [1], [2] citations...",
  "sources": ["[1] document.pdf, p.5", "[2] document.pdf, p.7"]
}
```

### File Upload Flow
1. Frontend uploads PDF → POST /api/upload
2. Backend saves to `data/` directory (same location ingest.py expects)
3. Frontend calls POST /api/ingest to trigger vectorstore rebuild
4. Backend calls `ingest()` which processes all PDFs in data/
5. Frontend polls GET /api/status to confirm vectorstore exists

### Environment Variables
Backend needs .env file in workspace root (already exists) with GOOGLE_API_KEY for Gemini access.

### CORS Configuration
Enable CORS for http://localhost:3000 in development. For production, restrict to actual frontend domain.

### Error Handling
- Backend: Return 400 for validation errors, 500 for processing errors, include error messages in response body
- Frontend: Display error messages in UI with dismissible alerts, log to console for debugging

### Responsive Design Breakpoints
- Mobile: < 640px (single column, full-width messages)
- Tablet: 640px - 1024px (centered container, 80% width)
- Desktop: > 1024px (max-width 1200px container)
