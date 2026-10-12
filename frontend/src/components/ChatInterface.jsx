import { useEffect, useRef, useState } from 'react';
import { FiArrowUp, FiBookOpen, FiCheckCircle, FiClock, FiCommand, FiFileText, FiMenu, FiMessageSquare, FiRefreshCw, FiSearch, FiX } from 'react-icons/fi';
import { askQuestion, getStatus } from '../services/api';
import FileUpload from './FileUpload';
import MessageBubble from './MessageBubble';
import SourceCitation from './SourceCitation';

const suggestions = [
  'Summarize the key points in my documents',
  'What topics are covered in the knowledge base?',
  'Find the most important facts and figures',
];

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState({ ready: false, document_count: null });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const checkStatus = async () => {
    try { setSystemStatus(await getStatus()); }
    catch (error) {
      console.error('Failed to check status:', error);
      setSystemStatus((current) => ({ ...current, ready: false }));
    }
  };

  useEffect(() => { checkStatus(); }, []);

  const handleSubmit = async (event, proposedQuestion) => {
    event?.preventDefault();
    const question = (proposedQuestion ?? inputValue).trim();
    if (!question || isLoading) return;
    if (!systemStatus.ready) {
      setMessages((current) => [...current, { id: Date.now(), role: 'system', content: 'Your knowledge base is not ready yet. Upload a PDF and run indexing first.', timestamp: new Date().toISOString() }]);
      return;
    }

    const userMessage = { id: Date.now(), role: 'user', content: question, timestamp: new Date().toISOString() };
    setMessages((current) => [...current, userMessage]);
    setInputValue('');
    setIsLoading(true);
    try {
      const response = await askQuestion(question);
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', content: response.answer, sources: response.sources, timestamp: new Date().toISOString() }]);
    } catch (error) {
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'system', content: error.message, timestamp: new Date().toISOString() }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="workspace-grid">
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-heading">
          <div><span className="eyebrow">Workspace</span><h2>Knowledge base</h2></div>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><FiX /></button>
        </div>
        <FileUpload onStatusChange={checkStatus} />
        <div className="library-section">
          <div className="section-label"><span>Library</span><span>{systemStatus.document_count || 0}</span></div>
          {systemStatus.ready ? (
            <div className="library-item">
              <span className="file-icon"><FiFileText /></span>
              <span><strong>Indexed documents</strong><small>{systemStatus.document_count || 0} files ready to search</small></span>
              <FiCheckCircle className="success-icon" />
            </div>
          ) : (
            <div className="empty-library"><FiBookOpen /><strong>Your library is empty</strong><span>Upload a PDF to start building your private knowledge base.</span></div>
          )}
        </div>
        <div className="sidebar-footer">
          <span className={`status-dot ${systemStatus.ready ? 'is-ready' : ''}`} />
          <span><strong>{systemStatus.ready ? 'Knowledge base ready' : 'Waiting for documents'}</strong><small>Gemini · Chroma</small></span>
          <button className="icon-button" onClick={checkStatus} aria-label="Refresh status"><FiRefreshCw /></button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><FiMenu /></button>
          <div>
            <div className="chat-title-row"><h1>Document assistant</h1><span className="status-pill"><span /> Online</span></div>
            <p>Ask questions and get grounded answers from your sources.</p>
          </div>
          <button className="new-chat" type="button" onClick={() => setMessages([])}><FiMessageSquare /> <span>New conversation</span></button>
        </header>

        <div className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome-state">
              <span className="welcome-icon"><FiSearch /></span><span className="eyebrow">AI research assistant</span>
              <h2>What would you like to know?</h2>
              <p>Explore your documents with natural language. Every answer is grounded in your uploaded sources.</p>
              <div className="suggestion-grid">
                {suggestions.map((suggestion) => <button key={suggestion} onClick={(event) => handleSubmit(event, suggestion)}><FiCommand /><span>{suggestion}</span><FiArrowUp /></button>)}
              </div>
            </div>
          ) : messages.map((message) => (
            <div key={message.id}><MessageBubble {...message} />{message.role === 'assistant' && message.sources?.length > 0 && <SourceCitation sources={message.sources} />}</div>
          ))}
          {isLoading && <div className="thinking-row"><span className="assistant-avatar"><FiBookOpen /></span><div className="thinking-bubble"><span /><span /><span /><small>Searching your sources</small></div></div>}
          <div ref={messagesEndRef} />
        </div>

        <footer className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
            <textarea ref={inputRef} rows="1" value={inputValue} onChange={(event) => setInputValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) handleSubmit(event); }} placeholder={systemStatus.ready ? 'Ask anything about your documents…' : 'Index a document to begin…'} disabled={isLoading} aria-label="Question" />
            <button type="submit" disabled={isLoading || !inputValue.trim()} aria-label="Send question"><FiArrowUp /></button>
          </form>
          <p><FiClock /> AI can make mistakes. Verify important details in the cited sources.</p>
        </footer>
      </section>
    </div>
  );
};

export default ChatInterface;
