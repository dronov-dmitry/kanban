import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE_PATH ?? '/';
const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:8787';

/**
 * GitHub Pages cannot set HTTP headers, so the production build injects the
 * CSP as a meta tag. Development is left untouched (Vite needs inline scripts
 * for the React refresh preamble).
 */
function productionCsp(): Plugin {
  const apiOrigin = new URL(apiUrl).origin;
  const wsOrigin = apiOrigin.replace(/^http/, 'ws');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} ${wsOrigin} https: wss:`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'kanban-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA ?? 'dev'),
  },
  plugins: [
    react(),
    productionCsp(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Kanban — доска, которая не мешает',
        short_name: 'Kanban',
        description: 'Лёгкая канбан-доска для небольших команд с офлайн-режимом',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#4F46E5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/v1\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === apiUrl && url.pathname.startsWith('/v1/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('@tanstack')) return 'tanstack';
          if (id.includes('@dnd-kit')) return 'dnd';
          if (id.includes('marked') || id.includes('dompurify')) return 'markdown';
          if (id.includes('date-fns')) return 'date';
          if (id.includes('i18next')) return 'i18n';
          if (id.includes('dexie')) return 'storage';
          return 'vendor';
        },
      },
    },
  },
});
