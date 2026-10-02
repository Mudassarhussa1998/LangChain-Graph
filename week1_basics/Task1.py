from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage

# Load environment variables from .env
load_dotenv()


# Initialize the Gemini model
model = init_chat_model(
    "google_genai:gemini-3.7-flash",
    temperature=0.2,
    max_tokens=300,
    timeout=30,
    max_retries=0,
)


def ask_model(question, chat_model=model):
    # Validate input
    if not question.strip():
        return "Error: Question cannot be empty."

    try:
        # Create messages
        messages = [
            SystemMessage(
                content="You are a helpful assistant."
            ),
            HumanMessage(
                content=question
            ),
        ]

        # Call the model
        response = chat_model.invoke(messages)
        print("\nModel Tokens :", response.usage_metadata)

        # Return only the text response
        return response.text

    except TimeoutError as e:
        return f"Timeout Error: {e}"

    except Exception as e:
        return f"Error occurred while asking the model: {e}"


while True:
    question = input("Enter your question (or type 'exit' to quit): ")
    if question.lower() == 'exit':
        break
    answer = ask_model(question)
    print("Model Response:", answer)    


