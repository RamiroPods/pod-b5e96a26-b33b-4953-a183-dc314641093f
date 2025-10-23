// API Configuration
const getApiUrl = (): string => {
  // In production, use the environment variable or default to relative path
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_API_URL || '';
  }
  
  // In development, use environment variable or fallback to localhost
  return import.meta.env.VITE_API_URL || 'http://localhost:8000';
};

export const API_BASE_URL = getApiUrl();

// API endpoints
export const API_ENDPOINTS = {
  SUMMARIZE: `./api/summarize`,
  HEALTH: `./health`,
  INFO: `./api/info`,
} as const; 