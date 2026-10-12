from langchain_chroma import Chroma
from config import VECTOR_DIR, TOP_K
from llm import get_embeddings

def get_retriever(k=TOP_K, vector_dir=VECTOR_DIR):
    store = Chroma(persist_directory=str(vector_dir),
                   embedding_function=get_embeddings())
    return store.as_retriever(search_kwargs={"k": k})
