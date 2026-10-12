import base64

from dotenv import load_dotenv
from google import genai

from config import CHAT_MODEL
from storage import add_message, recent_messages

MODEL_NAME = CHAT_MODEL.split(":", 1)[-1]
load_dotenv()


def remember_exchange(workspace_id: str, question: str, answer: str):
    add_message(workspace_id, "User", question)
    add_message(workspace_id, "Assistant", answer)


def chat(question: str, workspace_id: str) -> str:
    history = recent_messages(workspace_id, limit=10)
    transcript = "\n".join(f"{item['role']}: {item['content']}" for item in history)
    prompt = (
        "You are Indexia, a helpful WhatsApp AI assistant. Answer naturally and accurately. "
        "Be concise enough for WhatsApp. Use recent conversation only when relevant. Never claim "
        "to have read a file unless file evidence was supplied. If unsure, say so.\n\n"
        f"Recent conversation:\n{transcript or '(none)'}\n\nUser: {question}"
    )
    client = genai.Client()
    response = client.interactions.create(model=MODEL_NAME, input=prompt)
    answer = response.output_text or "I could not generate a response."
    remember_exchange(workspace_id, question, answer)
    return answer


def analyze_media(data: bytes, mime_type: str, prompt: str) -> str:
    media_type = mime_type.split("/", 1)[0]
    client = genai.Client()
    response = client.interactions.create(
        model=MODEL_NAME,
        input=[
            {"type": "text", "text": prompt},
            {"type": media_type, "data": base64.b64encode(data).decode("utf-8"), "mime_type": mime_type},
        ],
    )
    return response.output_text or "I could not analyze this media."
