import { FiAlertCircle, FiBookOpen, FiUser } from 'react-icons/fi';

const MessageBubble = ({ role, content, timestamp }) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const formattedTime = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <article className={`message-row ${isUser ? 'user-row' : ''} ${isSystem ? 'system-row' : ''}`}>
      <span className="message-avatar">{isUser ? <FiUser /> : isSystem ? <FiAlertCircle /> : <FiBookOpen />}</span>
      <div className="message-content">
        <div className="message-meta"><strong>{isUser ? 'You' : isSystem ? 'Notice' : 'Indexia'}</strong><time>{formattedTime}</time></div>
        <div className="message-bubble">{content}</div>
      </div>
    </article>
  );
};

export default MessageBubble;
