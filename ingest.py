from pathlib import Path
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from config import DATA_DIR, VECTOR_DIR, CHUNK_SIZE, CHUNK_OVERLAP
from llm import get_embeddings

def ingest(data_dir=DATA_DIR, vector_dir=VECTOR_DIR):
    docs = []
    for pdf in data_dir.glob("*.pdf"):
        for d in PyPDFLoader(str(pdf)).load():
            d.metadata["source_name"] = Path(d.metadata["source"]).name
            d.metadata["page"] = d.metadata.get("page", 0) + 1
            docs.append(d)
    if not docs:
        raise FileNotFoundError(f"No PDFs found in {data_dir}")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = splitter.split_documents(docs)

    vector_dir.mkdir(parents=True, exist_ok=True)
    store = Chroma(persist_directory=str(vector_dir), embedding_function=get_embeddings())
    existing_ids = store.get(include=[])["ids"]
    if existing_ids:
        store.delete(ids=existing_ids)
    store.add_documents(chunks)
    print(f"Indexed {len(chunks)} chunks from {len(docs)} pages.")
