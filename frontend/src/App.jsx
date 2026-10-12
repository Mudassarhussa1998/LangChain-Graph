import { FiBookOpen, FiGithub, FiHelpCircle } from 'react-icons/fi';
import ChatInterface from './components/ChatInterface';

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Indexia home">
          <span className="brand-mark"><FiBookOpen /></span>
          <span><strong>Indexia</strong><small>Document intelligence</small></span>
        </a>
        <nav className="topbar-actions" aria-label="Application links">
          <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub"><FiGithub /></a>
          <button type="button" aria-label="Help and documentation"><FiHelpCircle /></button>
          <span className="avatar" aria-label="Current user">MH</span>
        </nav>
      </header>
      <main id="top" className="workspace"><ChatInterface /></main>
    </div>
  );
}

export default App;
