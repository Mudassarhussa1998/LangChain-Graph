import React from 'react';
import ChatInterface from './components/ChatInterface';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            LangChain RAG
          </h1>
          <p className="text-indigo-100 text-lg">
            Document Question & Answer System
          </p>
          <p className="text-indigo-200 text-sm mt-2">
            Upload PDFs, ingest them, and ask questions powered by AI
          </p>
        </header>

        {/* Main content */}
        <main className="max-w-5xl mx-auto">
          <ChatInterface />
        </main>

        {/* Footer */}
        <footer className="text-center mt-8 text-indigo-100 text-sm">
          <p>
            Powered by LangChain, Google Gemini, and Chroma
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
