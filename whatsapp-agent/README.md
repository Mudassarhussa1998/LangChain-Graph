# Indexia WhatsApp Agent

Free, local WhatsApp bridge for the LangChain RAG application using Baileys.

> This is an unofficial WhatsApp integration. Use a separate test number. WhatsApp can change its protocol or restrict accounts using automation.

## Setup

1. Start the FastAPI backend from the repository root:

   ```bash
   uvicorn backend.app:app --reload
   ```

2. Install and configure the agent:

   ```bash
   cd whatsapp-agent
   npm install
   cp .env.example .env
   npm start
   ```

3. Scan the terminal QR code from **WhatsApp → Settings → Linked devices → Link a device**.

Each private chat receives an isolated document and vector workspace. Group messages are ignored. Set `ALLOWED_CHAT_IDS` to restrict access during testing.

The agent supports:

- General AI conversation even when no document is uploaded
- PDF indexing and retrieval with page citations
- Image and photo understanding, including visible text
- Voice-note and audio analysis
- Short video analysis within the configured 20 MB limit
- Persistent conversation memory in local SQLite
- Background reminders with local natural-language date parsing
- Per-user PDF listing and deletion

## Commands

```text
/help
/status
/files
/delete filename.pdf
/clear
/remind tomorrow at 9am call Ahmed
/reminders
/cancelreminder 3
/memory
/forget
/myid
/text +923001234567 Hello, how are you?
/callrequest +923001234567 Please call me when you are free.
/send +923001234567 in 3 minutes Hello, how are you?
```

Reminder delivery is checked in the background every 15 seconds and does not block chat replies. Conversation prompts load only the ten most recent messages.

Scheduled outbound messages are owner-only. Send `/myid`, copy the returned ID into `OWNER_CHAT_IDS` in `.env`, and restart the agent. Always include the destination country code. Messages are only delivered while both the backend and WhatsApp agent are running.

If `OWNER_CHAT_IDS` is empty and `AUTO_CLAIM_OWNER=true`, the first private account to message a newly paired bot is automatically saved as its owner in `.owner.json`. Set `AUTO_CLAIM_OWNER=false` for a public number and configure owners explicitly.

Immediate `/text` and `/callrequest` commands are also owner-only. Baileys cannot initiate an actual WhatsApp voice call; `/callrequest` sends a clearly labeled request for the recipient to call you. Bulk messaging is intentionally unsupported.

The owner can also use natural language:

```text
text 03045650316 say hi
send a message to 03045650316 saying the meeting starts at 3
call at 03045650316 say please call me
```

Local numbers beginning with `0` use `DEFAULT_COUNTRY_CODE` from `.env` (`92` by default). Natural-language parsing is local and does not add an AI request.
