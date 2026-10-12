import sys
from config import VECTOR_DIR

def main():
    if "--ingest" in sys.argv or not VECTOR_DIR.exists():
        from ingest import ingest
        ingest()

    from chain import ask
    while True:
        q = input("\nAsk (or 'exit'): ")
        if q.lower() == "exit":
            break
        result = ask(q)
        print("\nAnswer:", result["answer"])
        print("Sources:", *result["sources"], sep="\n  ")

if __name__ == "__main__":
    main()