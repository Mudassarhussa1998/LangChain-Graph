import React from 'react';

const MessageBubble = ({ role, content, timestamp }) => {
  const isUser = role === 'user';
  
  const formattedTime = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-fadeIn`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 shadow-md ${
          isUser
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
            : 'bg-white text-gray-800 border border-gray-200'
        }`}
      >
        <div className="text-sm mb-1">
          <span className={`font-semibold ${isUser ? 'text-indigo-100' : 'text-indigo-600'}`}>
            {isUser ? 'You' : 'AI Assistant'}
          </span>
        </div>
        <div className="text-base whitespace-pre-wrap break-words">
          {content}
        </div>
        <div className={`text-xs mt-2 ${isUser ? 'text-indigo-200' : 'text-gray-500'}`}>
          {formattedTime}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
