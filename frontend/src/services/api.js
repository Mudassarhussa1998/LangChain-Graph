import axios from 'axios';

// Allow backend URL to be configured via environment variable
// In development: uses Vite proxy (/api -> http://localhost:8000)
// In production: set VITE_API_URL to your backend URL
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60 seconds timeout for ingestion
  headers: {
    'Content-Type': 'application/json',
  },
});

// Error handler helper
const handleError = (error) => {
  if (error.response) {
    // Server responded with error status
    // Try multiple paths to extract error message for better HTTP 500 handling
    const errorMessage = 
      error.response.data.detail || 
      error.response.data.message || 
      error.response.statusText || 
      'Server error occurred';
    throw new Error(errorMessage);
  } else if (error.request) {
    // Request made but no response
    throw new Error('No response from server. Please check if backend is running.');
  } else {
    // Error in request setup
    throw new Error(error.message || 'Request failed');
  }
};

// API functions
export const askQuestion = async (question) => {
  try {
    const response = await api.post('/ask', { question });
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

export const triggerIngest = async () => {
  try {
    const response = await api.post('/ingest');
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

export const uploadFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

export const getStatus = async () => {
  try {
    const response = await api.get('/status');
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

export const getHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

export default api;
