/**
 * Application Configuration
 * Uses environment variables from Vite build process
 */

// API Configuration
export const config = {
  // API URLs - defaults to relative paths for same-origin deployment
  apiUrl: import.meta.env.VITE_API_URL || "",
  wsUrl: import.meta.env.VITE_WS_URL || "",
  frontendUrl: import.meta.env.VITE_FRONTEND_URL || window.location.origin,

  // Feature flags
  enableOfflineMode: true,
  enablePWA: true,

  // Polling interval when WebSocket is not connected (ms)
  pollInterval: 5000,

  // Map defaults (Sri Lanka center)
  defaultMapCenter: {
    lat: 7.8731,
    lng: 80.7718,
  },
  defaultMapZoom: 8,
};

// API endpoints helper
export const endpoints = {
  reports: `${config.apiUrl}/api/reports`,
  rescuers: `${config.apiUrl}/api/rescuers`,
  stats: `${config.apiUrl}/api/stats`,
  upload: `${config.apiUrl}/api/upload/presigned`,
  sms: `${config.apiUrl}/api/sms/incoming`,
  health: `${config.apiUrl}/api/health`,
};

export default config;
