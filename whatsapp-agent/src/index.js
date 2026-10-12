import 'dotenv/config';
import makeWASocket, { DisconnectReason, downloadMediaMessage, useMultiFileAuthState } from '@whiskeysockets/baileys';
import * as chrono from 'chrono-node';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const apiUrl = (process.env.RAG_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const maxFileBytes = Number(process.env.MAX_FILE_MB || 20) * 1024 * 1024;
const allowedChats = new Set((process.env.ALLOWED_CHAT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));
const ownerChats = new Set((process.env.OWNER_CHAT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));
const autoClaimOwner = (process.env.AUTO_CLAIM_OWNER || 'true').toLowerCase() === 'true';
const ownerFile = new URL('../.owner.json', import.meta.url);
if (existsSync(ownerFile)) {
  try {
    const stored = JSON.parse(readFileSync(ownerFile, 'utf8'));
    if (stored.chatId) ownerChats.add(stored.chatId);
  } catch (error) { console.error('Could not load saved owner:', error.message); }
}
const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || '92').replace(/\D/g, '');
const logger = pino({ level: 'silent' });
const busyChats = new Set();
const processedIds = new Set();
let socket;
let reconnecting = false;
let pollingReminders = false;
let shuttingDown = false;

const headersFor = (chatId) => ({ 'X-Workspace-ID': chatId });

function normalizePhone(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

function parseNaturalOutbound(text) {
  const pattern = /^(call|text|message|whatsapp|send(?:\s+(?:a\s+)?message)?)\s+(?:(?:at|to)\s+)?(\+?[\d\s()-]{8,20})\s+(?:(?:and\s+)?(?:say|saying)\s+)?([\s\S]+)$/i;
  const match = text.trim().match(pattern);
  if (!match) return null;
  const action = match[1].toLowerCase();
  return { phone: normalizePhone(match[2]), body: match[3].trim(), isCallRequest: action === 'call' };
}
async function apiRequest(path, chatId, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { ...headersFor(chatId), ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.message || `Request failed (${response.status})`);
  return payload;
}

function contentOf(raw) {
  let content = raw.message || {};
  if (content.ephemeralMessage) content = content.ephemeralMessage.message || {};
  if (content.viewOnceMessage) content = content.viewOnceMessage.message || {};
  return content;
}

function adaptMessage(raw) {
  const content = contentOf(raw);
  const media = content.documentMessage || content.imageMessage || content.audioMessage || content.videoMessage;
  const body = content.conversation || content.extendedTextMessage?.text || media?.caption || '';
  const from = raw.key.remoteJid;
  return {
    raw, from, body, fromMe: Boolean(raw.key.fromMe), hasMedia: Boolean(media),
    media: media ? { mimetype: media.mimetype || '', filename: media.fileName || '' } : null,
    reply: (text) => socket.sendMessage(from, { text }, { quoted: raw }),
    downloadMedia: () => downloadMediaMessage(raw, 'buffer', {}, { logger, reuploadRequest: socket.updateMediaMessage }),
  };
}

async function handleMedia(message) {
  const bytes = await message.downloadMedia();
  if (!bytes) return message.reply('I could not download that attachment. Please send it again.');
  if (bytes.length > maxFileBytes) return message.reply(`That file is larger than the ${Math.round(maxFileBytes / 1024 / 1024)} MB limit.`);
  const mimeType = message.media.mimetype.split(';', 1)[0].trim().toLowerCase();

  if (mimeType !== 'application/pdf') {
    const supported = ['image/', 'audio/', 'video/'].some((prefix) => mimeType.startsWith(prefix));
    if (!supported) return message.reply(`I cannot analyze ${mimeType || 'that file type'} yet.`);
    await message.reply('🔎 Media received. I am analyzing it now…');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), message.media.filename || `media-${Date.now()}`);
    const prompt = message.body || 'Analyze this media carefully. Extract visible or spoken text and highlight important details.';
    const result = await apiRequest(`/analyze-media?prompt=${encodeURIComponent(prompt)}`, message.from, { method: 'POST', body: form });
    return message.reply(result.answer);
  }

  await message.reply('📄 PDF received. I am reading and indexing it now…');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), message.media.filename || `document-${Date.now()}.pdf`);
  await apiRequest('/upload', message.from, { method: 'POST', body: form });
  const result = await apiRequest('/ingest', message.from, { method: 'POST' });
  return message.reply(`✅ Ready. ${result.document_count} document(s) are indexed. Ask me anything about them.`);
}

async function handleText(message) {
  const text = message.body.trim();
  const lower = text.toLowerCase();
  if (!text) return;
  if (lower === '/help' || lower === 'help') return message.reply('Chat normally or send a PDF, photo, voice note, audio, or video.\n\n/myid\n/status\n/files\n/delete filename.pdf\n/clear\n/remind tomorrow at 9am call Ahmed\n/reminders\n/cancelreminder 3\n/text +923001234567 Hello\n/callrequest +923001234567 Please call me\n/send +923001234567 in 3 minutes Hello\n/memory\n/forget');
  if (lower === '/myid') return message.reply(`Your WhatsApp chat ID is:\n${message.from}`);
  if (lower === '/status') {
    const status = await apiRequest('/status', message.from);
    return message.reply(status.ready ? `✅ Ready — ${status.document_count} document(s) indexed.` : 'No documents are indexed yet. You can still chat normally.');
  }
  if (lower === '/files') {
    const { documents = [] } = await apiRequest('/documents', message.from);
    return message.reply(documents.length ? `📚 Your documents:\n${documents.map((file, i) => `${i + 1}. ${file.name}`).join('\n')}` : 'Your document library is empty.');
  }
  if (lower.startsWith('/delete ')) {
    const result = await apiRequest(`/documents?filename=${encodeURIComponent(text.slice(8).trim())}`, message.from, { method: 'DELETE' });
    return message.reply(`🗑️ Deleted ${result.deleted}. ${result.remaining} document(s) remain.`);
  }
  if (lower === '/clear') {
    const result = await apiRequest('/documents/all', message.from, { method: 'DELETE' });
    return message.reply(`🗑️ Cleared ${result.deleted} document(s).`);
  }
  if (lower === '/memory') {
    const result = await apiRequest('/memory', message.from);
    return message.reply(result.messages?.length ? `🧠 I use your last ${result.messages.length} messages. Send /forget to erase them.` : 'I have no saved memory for you yet.');
  }
  if (lower === '/forget') {
    const result = await apiRequest('/memory', message.from, { method: 'DELETE' });
    return message.reply(`🧹 Memory cleared (${result.deleted} messages removed).`);
  }
  if (lower === '/reminders') {
    const { reminders = [] } = await apiRequest('/reminders', message.from);
    return message.reply(reminders.length ? `⏰ Your reminders:\n${reminders.map((item) => `${item.id}. ${item.task} — ${new Date(item.remind_at).toLocaleString()}`).join('\n')}` : 'You have no pending reminders.');
  }
  if (lower.startsWith('/cancelreminder ')) {
    const id = Number(text.split(/\s+/)[1]);
    if (!Number.isInteger(id)) throw new Error('Use /cancelreminder followed by its number.');
    await apiRequest(`/reminders/${id}`, message.from, { method: 'DELETE' });
    return message.reply(`✅ Reminder ${id} cancelled.`);
  }
  const naturalOutbound = parseNaturalOutbound(text);
  if (naturalOutbound) {
    if (!ownerChats.has(message.from)) return message.reply(ownerChats.size ? 'Sending messages to other numbers is restricted to the bot owner.' : 'Send /myid, add it to OWNER_CHAT_IDS in .env, then restart.');
    if (naturalOutbound.phone.length < 10 || naturalOutbound.phone.length > 15) return message.reply('I could not understand that phone number. Include a valid local number or country code.');
    const target = `${naturalOutbound.phone}@s.whatsapp.net`;
    const registered = await socket.onWhatsApp(target);
    if (!registered?.[0]?.exists) return message.reply('That number is not registered on WhatsApp.');
    const outgoing = naturalOutbound.isCallRequest ? `📞 Call request: ${naturalOutbound.body}` : naturalOutbound.body;
    await socket.sendMessage(target, { text: outgoing });
    console.log(`Natural-language outbound request from ${message.from} sent to ${target}.`);
    return message.reply(`✅ ${naturalOutbound.isCallRequest ? 'Call request' : 'Message'} sent to +${naturalOutbound.phone}: “${naturalOutbound.body}”`);
  }
  if (lower.startsWith('/text ') || lower.startsWith('/callrequest ')) {
    if (!ownerChats.has(message.from)) return message.reply(ownerChats.size ? 'This command is restricted to the bot owner.' : 'Send /myid, add it to OWNER_CHAT_IDS in .env, then restart.');
    const isCallRequest = lower.startsWith('/callrequest ');
    const command = isCallRequest ? 'callrequest' : 'text';
    const match = text.match(new RegExp(`^/${command}\\s+(\\+?\\d{8,15})\\s+([\\s\\S]+)$`, 'i'));
    if (!match) return message.reply(`Use: /${command} +923001234567 ${isCallRequest ? 'Please call me when you are free.' : 'Hello, how are you?'}`);
    const [, phone, body] = match;
    const target = `${normalizePhone(phone)}@s.whatsapp.net`;
    const registered = await socket.onWhatsApp(target);
    if (!registered?.[0]?.exists) return message.reply('That number is not registered on WhatsApp. Include its country code.');
    const outgoing = isCallRequest ? `📞 Call request: ${body.trim()}` : body.trim();
    await socket.sendMessage(target, { text: outgoing });
    console.log(`Owner ${message.from} sent ${command} message to ${target}.`);
    return message.reply(`✅ ${isCallRequest ? 'Call request' : 'Message'} sent to ${phone}.`);
  }
  if (lower.startsWith('/send ')) {
    if (!ownerChats.has(message.from)) return message.reply(ownerChats.size ? 'This command is restricted to the bot owner.' : 'Send /myid, add it to OWNER_CHAT_IDS in .env, then restart.');
    const match = text.match(/^\/send\s+(\+?\d{8,15})\s+(.+)$/i);
    if (!match) return message.reply('Use: /send +923001234567 in 3 minutes Hello');
    const [, phone, remainder] = match;
    const parsed = chrono.parse(remainder, new Date(), { forwardDate: true })[0];
    if (!parsed) return message.reply('I could not understand the delivery time.');
    const outboundText = `${remainder.slice(0, parsed.index)} ${remainder.slice(parsed.index + parsed.text.length)}`.trim();
    if (!outboundText) return message.reply('Please include a message.');
    const target = `${normalizePhone(phone)}@s.whatsapp.net`;
    const registered = await socket.onWhatsApp(target);
    if (!registered?.[0]?.exists) return message.reply('That number is not registered on WhatsApp. Include its country code.');
    const sendAt = parsed.start.date();
    const result = await apiRequest('/reminders', message.from, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: outboundText, remind_at: sendAt.toISOString(), chat_id: target, message_type: 'outbound' }) });
    return message.reply(`✅ Scheduled message ${result.id} for ${sendAt.toLocaleString()}:\n${outboundText}`);
  }
  if (lower.startsWith('/remind ') || lower.startsWith('remind me ')) {
    const parsed = chrono.parse(text, new Date(), { forwardDate: true })[0];
    if (!parsed) return message.reply('Try: /remind tomorrow at 9am call Ahmed');
    let task = `${text.slice(0, parsed.index)} ${text.slice(parsed.index + parsed.text.length)}`.replace(/^\/remind\s*/i, '').replace(/^remind me\s*/i, '').replace(/^to\s+/i, '').trim() || 'Reminder';
    const at = parsed.start.date();
    const result = await apiRequest('/reminders', message.from, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, remind_at: at.toISOString(), chat_id: message.from }) });
    return message.reply(`⏰ Reminder ${result.id} set for ${at.toLocaleString()}: ${task}`);
  }
  const result = await apiRequest('/agent', message.from, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text }) });
  return message.reply(`${result.answer}${result.sources?.length ? `\n\nSources:\n${result.sources.join('\n')}` : ''}`);
}

async function processMessage(raw) {
  const id = raw.key.id;
  if (!id || processedIds.has(id)) return;
  processedIds.add(id);
  if (processedIds.size > 1000) processedIds.delete(processedIds.values().next().value);
  const message = adaptMessage(raw);
  const preview = message.hasMedia ? `[media: ${message.media.mimetype}]` : message.body.slice(0, 60);
  console.log(`Incoming message from ${message.from}${message.fromMe ? ' (from bot account)' : ''}: ${preview}`);
  if (message.fromMe || message.from === 'status@broadcast' || message.from.endsWith('@g.us')) return;
  if (allowedChats.size && !allowedChats.has(message.from)) return console.log(`Ignored: ${message.from} is not allowed.`);
  if (!ownerChats.size && autoClaimOwner) {
    ownerChats.add(message.from);
    writeFileSync(ownerFile, JSON.stringify({ chatId: message.from, claimedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    console.log(`Automatically claimed ${message.from} as the bot owner.`);
    await message.reply('🔐 You are now registered automatically as this bot’s owner. You can use natural-language text and scheduled-message actions.');
  }
  if (busyChats.has(message.from)) return message.reply('I am still processing your previous request.');
  busyChats.add(message.from);
  try { message.hasMedia ? await handleMedia(message) : await handleText(message); }
  catch (error) { console.error(`Request failed for ${message.from}:`, error); await message.reply(`Sorry, I could not complete that request: ${error.message}`); }
  finally { busyChats.delete(message.from); }
}

async function deliverDueReminders() {
  if (!socket || pollingReminders) return;
  pollingReminders = true;
  try {
    const response = await fetch(`${apiUrl}/reminders/due`);
    if (!response.ok) return;
    const { reminders = [] } = await response.json();
    for (const reminder of reminders) {
      try {
        await socket.sendMessage(reminder.chat_id, { text: reminder.message_type === 'outbound' ? reminder.task : `⏰ Reminder: ${reminder.task}` });
        await fetch(`${apiUrl}/reminders/${reminder.id}/complete`, { method: 'POST' });
      } catch (error) { console.error(`Reminder ${reminder.id} failed:`, error.message); }
    }
  } catch (error) { console.error('Reminder poll failed:', error.message); }
  finally { pollingReminders = false; }
}

async function startWhatsApp() {
  if (reconnecting || shuttingDown) return;
  reconnecting = true;
  const { state, saveCreds } = await useMultiFileAuthState('.baileys_auth');
  socket = makeWASocket({ auth: state, logger, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false });
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) await processMessage(message);
  });
  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { console.log('\nScan this QR code in WhatsApp → Linked devices:\n'); qrcode.generate(qr, { small: true }); }
    if (connection === 'open') { reconnecting = false; console.log('Indexia WhatsApp agent is ready. Send “hi” from another WhatsApp number.'); deliverDueReminders(); }
    if (connection === 'close' && !shuttingDown) {
      reconnecting = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) console.error('WhatsApp logged out. Remove .baileys_auth and pair again.');
      else { console.log('WhatsApp disconnected. Reconnecting…'); setTimeout(startWhatsApp, 2000); }
    }
  });
}

const reminderTimer = setInterval(deliverDueReminders, 15000);
reminderTimer.unref();
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true; clearInterval(reminderTimer);
  console.log(`\n${signal} received. Closing WhatsApp cleanly…`);
  socket?.end(new Error('shutdown'));
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
console.log('Starting Indexia with the Baileys WhatsApp connector…');
startWhatsApp().catch((error) => { console.error('WhatsApp startup failed:', error); process.exitCode = 1; });
