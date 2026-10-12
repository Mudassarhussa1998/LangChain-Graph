import { useRef, useState } from 'react';
import { FiAlertCircle, FiCheck, FiFilePlus, FiLoader, FiTrash2, FiUploadCloud, FiZap } from 'react-icons/fi';
import { triggerIngest, uploadFile } from '../services/api';

const FileUpload = ({ onStatusChange }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const isLoading = status === 'uploading' || status === 'ingesting';

  const selectFile = (file) => {
    if (file?.type === 'application/pdf') { setSelectedFile(file); setMessage(''); setStatus('idle'); }
    else { setMessage('Please choose a PDF file.'); setStatus('error'); }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      setStatus('uploading'); setMessage('Uploading securely…');
      const result = await uploadFile(selectedFile);
      setMessage(result.message); setStatus('done'); await onStatusChange?.();
    } catch (error) { setMessage(error.message || 'Upload failed.'); setStatus('error'); }
  };

  const handleIngest = async () => {
    try {
      setStatus('ingesting'); setMessage('Indexing your documents…');
      const result = await triggerIngest();
      setMessage(`${result.message}. ${result.document_count} document(s) processed.`); setStatus('done');
      setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
      await onStatusChange?.();
    } catch (error) { setMessage(error.message || 'Indexing failed.'); setStatus('error'); }
  };

  return (
    <section className="upload-card">
      <div className="upload-card-title"><span><FiFilePlus /></span><div><h3>Add documents</h3><p>PDF files up to 20 MB</p></div></div>
      <label className={`dropzone ${isDragOver ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={(e) => { e.preventDefault(); setIsDragOver(false); selectFile(e.dataTransfer.files[0]); }}>
        <FiUploadCloud /><strong>Drop a PDF here</strong><span>or click to browse</span>
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={(e) => selectFile(e.target.files[0])} />
      </label>
      {selectedFile && <div className="selected-file"><FiFilePlus /><span><strong>{selectedFile.name}</strong><small>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · PDF</small></span><button onClick={() => setSelectedFile(null)} aria-label="Remove selected file"><FiTrash2 /></button></div>}
      <div className="upload-actions">
        <button className="primary-action" onClick={handleUpload} disabled={!selectedFile || isLoading}>{status === 'uploading' ? <FiLoader className="spin" /> : <FiUploadCloud />} Upload</button>
        <button className="secondary-action" onClick={handleIngest} disabled={isLoading}>{status === 'ingesting' ? <FiLoader className="spin" /> : <FiZap />} Index all</button>
      </div>
      {message && <div className={`upload-message ${status}`}>{status === 'error' ? <FiAlertCircle /> : status === 'done' ? <FiCheck /> : <FiLoader className="spin" />}<span>{message}</span></div>}
    </section>
  );
};

export default FileUpload;
