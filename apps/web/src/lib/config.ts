export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
export const WS_URL = (import.meta.env.VITE_WS_URL ?? API_URL.replace(/^http/, 'ws')).replace(
  /\/$/,
  '',
);
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const IS_PRODUCTION = import.meta.env.PROD;
