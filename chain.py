from langchain_core.output_parsers import StrOutputParser
from llm import get_model
from prompts import RAG_PROMPT
from retriever import get_retriever

_chain = RAG_PROMPT | get_model() | StrOutputParser()

def _format_context(docs):
    return "\n\n".join(
        f"[{i}] ({d.metadata['source_name']}, p.{d.metadata['page']})\n{d.page_content}"
        for i, d in enumerate(docs, 1))

def ask(question: str, vector_dir=None) -> dict:
    if not question.strip():
        return {"answer": "Error: Question cannot be empty.", "sources": []}
    try:
        retriever = get_retriever(vector_dir=vector_dir) if vector_dir else get_retriever()
        docs = retriever.invoke(question)
        answer = _chain.invoke({"context": _format_context(docs),
                                "question": question})
        sources = [f"[{i}] {d.metadata['source_name']}, p.{d.metadata['page']}"
                   for i, d in enumerate(docs, 1)]
        return {"answer": answer, "sources": sources}
    except Exception as e:
        return {"answer": f"Error: {e}", "sources": []}
