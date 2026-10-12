# FastAPI backend and React frontend for LangChain RAG

This change introduces a web interface to an existing command-line RAG system. The backend wraps existing Python modules (chain.py, ingest.py) with a FastAPI REST API. The frontend provides a React chat interface for uploading PDFs, triggering ingestion, and asking questions. The implementation includes security hardening: HTTP 500 errors are sanitized to prevent internal detail leakage, with full error logging preserved server-side.

The backend CORS configuration pulls allowed origins from an environment variable with a localhost default, but the frontend has no way to override the backend URL if it's not running on localhost:8000. Error handling throughout is functional but the API returns generic messages for all 500 errors, which may hinder debugging in development. The vector store readiness check relies on directory existence rather than actual Chroma health, which could produce false positives if the directory exists but is corrupted.

**Watch for:** Frontend has no backend URL configuration—hardcoded to localhost:8000 via Vite proxy (**confirmed**). API error handler in frontend attempts to extract error.response.data.detail but FastAPI's custom 500 handler returns a generic message, so users never see actionable error details for server failures (**confirmed**). Backend sys.path manipulation works but is fragile—moving backend/app.py or changing the workspace structure will break imports (**likely**).

**Verdict:** NEEDS_CHANGES

## High-level view

The backend adds sys.path[0] to resolve imports from the parent directory, which works for the current structure but breaks if the backend directory is moved or the workspace is reorganized. All five endpoints are present and functional, with CORS configured via environment variable, but the frontend has no way to point to a backend running on a different host or port—the Vite proxy target is hardcoded.

Error handling is split: validation errors (400-level) preserve detail for users, but all 500 errors return the same generic message to clients after logging full details server-side. This protects against information leakage but removes debugging context even in development, where seeing the actual error would be useful.

The frontend API contract matches backend signatures, and React components follow functional patterns with correct hook usage. File upload uses drag-and-drop with PDF validation, ingestion triggers a full reprocess of the data directory, and chat displays AI responses with collapsible source citations.

The README covers installation and API reference but documents ALLOWED_ORIGINS without explaining that the frontend cannot override the backend URL from its side, which will confuse users deploying to non-localhost environments.

<details>
<summary>Issues (7)</summary>

1. **Frontend cannot configure backend URL** — Vite proxy target hardcoded to http://localhost:8000 in vite.config.js. Add VITE_API_URL env var to api.js and use it as baseURL, falling back to '/api' in dev mode.
2. **sys.path manipulation fragile** — Backend imports break if backend/app.py moves or workspace structure changes. Consider installing the project as an editable package (pip install -e .) or adding a proper Python package structure.
3. **Vector store health check insufficient** — Status endpoint checks if vectorstore/ directory exists and is non-empty, not whether Chroma is actually healthy. A corrupted or partially written store would report ready=true.
4. **Generic 500 errors in development** — Custom exception handler returns same message for all server errors. Add environment-based error detail (full traceback in dev, generic message in prod).
5. **Ingestion failure leaves partial state** — If ingest() crashes midway, vectorstore/ may be in an inconsistent state. Status endpoint would still report ready=true if directory exists. Consider atomic ingestion or cleanup on failure.
6. **File upload overwrites without warning** — Backend saves file to data_dir / file.filename with no conflict handling. Uploading document.pdf twice overwrites the first silently. Frontend should warn or backend should handle duplicates.
7. **README doesn't explain frontend URL limitation** — ALLOWED_ORIGINS is documented but there's no mention that the frontend Vite proxy is hardcoded to localhost:8000, which will confuse production deployments.

</details>

<details>
<summary>Details</summary>

## Backend imports via sys.path manipulation

The backend resolves imports to chain.py, ingest.py, and config.py by inserting the parent directory into sys.path:

```python
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

This works when backend/app.py sits one level below the workspace root, but breaks if the backend directory is moved, renamed, or if the project is installed as a package. A workspace restructure or deployment to a different layout (e.g., src/backend/app.py) would require updating this line in multiple places if the pattern were replicated.

The backend could instead be run with PYTHONPATH set to the workspace root, or the project could be installed as an editable package (pip install -e .), which would eliminate the need for sys.path hacks entirely. The verification notes confirm imports resolve successfully in the current structure.

## CORS configuration and frontend URL coupling

The backend CORS middleware pulls allowed origins from the ALLOWED_ORIGINS environment variable, defaulting to http://localhost:3000:

```python
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
```

This is configurable, but the frontend has no corresponding mechanism to point to a different backend. The Vite proxy configuration hardcodes the target:

```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```

In development, requests to /api are forwarded to localhost:8000. In production (after npm run build), the frontend would need to be served from the same host as the backend or use absolute URLs. The api.js client sets baseURL: '/api', which assumes the frontend and backend are on the same origin post-deployment.

If the backend runs on a different host (e.g., api.example.com while the frontend is on app.example.com), the frontend has no way to specify this. The README documents ALLOWED_ORIGINS but doesn't explain that the frontend is coupled to localhost:8000 in development and requires same-origin deployment in production, unless the user modifies api.js directly.

## Error sanitization and development experience

The custom 500 error handler prevents internal details from reaching clients:

```python
@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc: Exception):
    logger.error(f"Internal server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )
```

Every 500 error returns the same message, with full details logged server-side. This protects against information leakage in production but removes debugging context in development. A developer running the backend locally will see "An internal server error occurred" in the browser and have to check terminal logs to find the actual error.

The frontend error handler in api.js attempts to extract error.response.data.detail, but FastAPI's custom handler always returns the same generic message, so users never see actionable error details for server failures. For 400-level errors (validation, missing files), the backend preserves detail and the frontend displays it correctly.

An environment-aware approach (full traceback in dev, generic message in prod) would preserve security in production while improving the development loop. This could be gated on an ENV environment variable or FastAPI's debug mode.

## Vector store health check gap

The /api/status endpoint checks readiness by testing if the vectorstore/ directory exists and is non-empty:

```python
vector_dir = Path(VECTOR_DIR)
ready = vector_dir.exists() and any(vector_dir.iterdir())
```

This returns ready=true if any file or directory is present under vectorstore/, but doesn't verify that Chroma initialized successfully or that the store is usable. A corrupted store, a partially written ingestion, or leftover files from a failed run would all report ready=true.

The retriever (in retriever.py) is instantiated at module load time and may fail silently if the vector store is malformed. The status check should either attempt to instantiate the retriever or query Chroma's metadata to confirm the store is healthy. As written, the frontend would allow the user to ask questions against a broken store, leading to cryptic errors or empty results.



## Ingestion atomicity and partial failure

The /api/ingest endpoint calls ingest() from ingest.py, which processes all PDFs in the data/ directory and writes to the vectorstore/ directory. If ingestion crashes midway (e.g., a PDF fails to parse, an API rate limit is hit, or Chroma write fails), the vectorstore/ directory may be left in an inconsistent state—some documents ingested, others not.

The status endpoint would still report ready=true because the directory exists and is non-empty. The user would not know ingestion is incomplete unless they manually inspect the document count or notice missing results in query responses.

The backend could wrap ingest() in a try/except that cleans up the vectorstore/ directory on failure, or ingest.py could write to a temporary directory and only replace vectorstore/ on success. As written, a failed ingestion leaves the system in an undefined state.

## File upload conflict handling

The upload endpoint saves files to data_dir / file.filename with no conflict resolution:

```python
file_path = data_dir / file.filename
with open(file_path, "wb") as buffer:
    shutil.copyfileobj(file.file, buffer)
```

Uploading document.pdf twice overwrites the first upload silently. The frontend confirms "File 'document.pdf' uploaded successfully" both times, but the user has no indication that the original was replaced.

The backend could check if the file exists and return a 409 Conflict, or append a timestamp/hash to the filename. The frontend could warn the user before uploading a duplicate, but would need a /api/files endpoint to list existing files first.



## API contract alignment

The frontend api.js methods match the backend endpoint signatures. Response shapes align: askQuestion expects {answer, sources}, triggerIngest expects {message, document_count}, uploadFile expects {filename, message}, getStatus expects {ready, document_count}.

The error handler attempts to extract error.response.data.detail || error.response.data.message || error.response.statusText, which covers FastAPI's HTTPException format. For 500 errors, the custom handler returns {detail: "generic message"}, so the frontend displays the generic message rather than the underlying error.

## Dependencies and build configuration

Backend requirements.txt pins minimum versions with >=, which could allow breaking changes in a deployed app. Frontend package.json pins exact versions, which is more stable. The existing project dependencies (langchain, chroma, etc.) are in the workspace root requirements.txt and are not duplicated in backend/requirements.txt.

Vite's proxy configuration forwards /api to localhost:8000 in dev mode, and the production build would serve static files from dist/ without the proxy. The README explains this split but doesn't document how to serve the production build with a reverse proxy (e.g., nginx) to route /api to the backend.

## README completeness and accuracy

The README covers installation, running both servers, usage flow, API reference, troubleshooting, and project structure. It correctly notes that uvicorn must be run from the workspace root due to sys.path manipulation.

The "No module named 'chain'" troubleshooting entry explains the sys.path issue but doesn't suggest alternatives like PYTHONPATH or editable installs. The CORS troubleshooting mentions ALLOWED_ORIGINS but doesn't explain that the frontend cannot point to a different backend without modifying vite.config.js.

</details>

<details>
<summary>File map</summary>

**Backend**
- `backend/app.py` — FastAPI application with 5 endpoints, CORS middleware, custom 500 handler, sys.path manipulation for imports
- `backend/requirements.txt` — fastapi, uvicorn, python-multipart

**Frontend**
- `frontend/package.json` — React 18.3.1, Vite 5.3.1, Tailwind 3.4.4, Axios 1.7.2
- `frontend/vite.config.js` — Vite dev server with /api proxy to localhost:8000
- `frontend/tailwind.config.js` — Tailwind configuration
- `frontend/postcss.config.js` — PostCSS with autoprefixer
- `frontend/index.html` — HTML entry point with root div
- `frontend/src/main.jsx` — React entry point with StrictMode
- `frontend/src/App.jsx` — Root component with gradient background and header
- `frontend/src/index.css` — Tailwind imports and fadeIn animation
- `frontend/src/services/api.js` — Axios client with 5 API methods and error handler
- `frontend/src/components/ChatInterface.jsx` — Main UI with messages, status indicator, input form
- `frontend/src/components/MessageBubble.jsx` — Message display with role-based styling and timestamp
- `frontend/src/components/SourceCitation.jsx` — Collapsible source list
- `frontend/src/components/FileUpload.jsx` — Drag-and-drop upload with ingest button

**Documentation**
- `README_FRONTEND.md` — Installation guide, API reference, troubleshooting, security notes

**Verification**
- `.agents/tasks/verification.md` — Coder's verification notes confirming syntax, imports, file structure, and security fix applied

Full diff: `git diff <base-branch>`

</details>
