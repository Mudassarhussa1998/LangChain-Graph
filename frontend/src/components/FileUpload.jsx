import React, { useState, useRef } from 'react';
import { uploadFile, triggerIngest } from '../services/api';

const FileUpload = ({ onStatusChange }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, ingesting, done, error
  const [message, setMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setMessage('');
      setStatus('idle');
    } else {
      setMessage('Please select a valid PDF file');
      setStatus('error');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setMessage('');
      setStatus('idle');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select a file first');
      setStatus('error');
      return;
    }

    try {
      setStatus('uploading');
      setMessage('Uploading file...');
      
      const result = await uploadFile(selectedFile);
      
      setMessage(result.message);
      setStatus('done');
      
      // Notify parent component to refresh status
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error) {
      setMessage(error.message || 'Upload failed');
      setStatus('error');
    }
  };

  const handleIngest = async () => {
    try {
      setStatus('ingesting');
      setMessage('Ingesting documents... This may take a moment.');
      
      const result = await triggerIngest();
      
      setMessage(`${result.message}. Processed ${result.document_count} document(s).`);
      setStatus('done');
      
      // Clear selected file after successful ingestion
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Notify parent component to refresh status
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error) {
      setMessage(error.message || 'Ingestion failed');
      setStatus('error');
    }
  };

  const getBorderColor = () => {
    if (isDragOver) return 'border-indigo-500 bg-indigo-50';
    if (status === 'error') return 'border-red-300 bg-red-50';
    if (status === 'done') return 'border-green-300 bg-green-50';
    return 'border-gray-300 bg-white';
  };

  const isLoading = status === 'uploading' || status === 'ingesting';

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Documents</h3>
      
      {/* Drag and drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${getBorderColor()}`}
      >
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="mt-4">
          <label htmlFor="file-upload" className="cursor-pointer">
            <span className="text-indigo-600 hover:text-indigo-500 font-medium">
              Click to upload
            </span>
            <span className="text-gray-600"> or drag and drop</span>
          </label>
          <input
            id="file-upload"
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleFileSelect}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">PDF files only</p>
      </div>

      {/* Selected file display */}
      {selectedFile && (
        <div className="mt-4 p-3 bg-gray-100 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm text-gray-700">{selectedFile.name}</span>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex gap-3">
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isLoading}
          className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {status === 'uploading' ? 'Uploading...' : 'Upload File'}
        </button>
        <button
          onClick={handleIngest}
          disabled={isLoading}
          className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {status === 'ingesting' ? 'Ingesting...' : 'Ingest Documents'}
        </button>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm ${
            status === 'error'
              ? 'bg-red-100 text-red-700 border border-red-200'
              : status === 'done'
              ? 'bg-green-100 text-green-700 border border-green-200'
              : 'bg-blue-100 text-blue-700 border border-blue-200'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
