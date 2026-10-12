from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from config import CHAT_MODEL, EMBED_MODEL

load_dotenv()

def get_model():
    return init_chat_model(CHAT_MODEL, temperature=0.2, max_tokens=800,
                           timeout=30, max_retries=0)

def get_embeddings():
    return GoogleGenerativeAIEmbeddings(model=EMBED_MODEL)