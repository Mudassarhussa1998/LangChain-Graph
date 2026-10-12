import { useState } from 'react';
import { FiBook, FiChevronDown, FiExternalLink } from 'react-icons/fi';

const SourceCitation = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!sources?.length) return null;

  return (
    <div className="sources-card">
      <button onClick={() => setIsExpanded(!isExpanded)} aria-expanded={isExpanded}>
        <span><FiBook /> {sources.length} {sources.length === 1 ? 'source' : 'sources'} used</span>
        <FiChevronDown className={isExpanded ? 'rotated' : ''} />
      </button>
      {isExpanded && <div className="source-list">{sources.map((source, index) => <div key={`${source}-${index}`}><span>{index + 1}</span><p>{source}</p><FiExternalLink /></div>)}</div>}
    </div>
  );
};

export default SourceCitation;
