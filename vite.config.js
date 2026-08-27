import { defineConfig } from 'vite';
import { resolve } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig(({ command }) => {
  // Dev: use a stable hash read from (or written to) public/version.json
  // Build: generate a fresh random hash for each production deploy
  const isProduction = command === 'build';
  let buildHash;

  if (isProduction) {
    buildHash = randomBytes(8).toString('hex');
  } else {
    // In dev, read existing hash or create one that stays stable across reloads
    const versionPath = resolve(__dirname, 'public/version.json');
    try {
      const existing = JSON.parse(readFileSync(versionPath, 'utf8'));
      buildHash = existing.hash;
    } catch {
      buildHash = randomBytes(8).toString('hex');
      writeFileSync(versionPath, JSON.stringify({ hash: buildHash }));
    }
  }

  // Upload source maps to Sentry only when an auth token + org/project are
  // configured (CI / prod). Without them the build is untouched — errors are
  // still captured, just with minified stack traces.
  const sentryUpload =
    isProduction &&
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT;

  return {
    define: {
      __BUILD_HASH__: JSON.stringify(buildHash),
    },
    plugins: [
      ...(sentryUpload
        ? [sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: buildHash },
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          })]
        : []),
      {
        name: 'version-json',
        configureServer(server) {
          // Serve version.json from disk on every request (no caching)
          server.middlewares.use('/version.json', (_req, res) => {
            try {
              const content = readFileSync(resolve(__dirname, 'public/version.json'), 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(content);
            } catch {
              res.statusCode = 404;
              res.end('{}');
            }
          });
        },
        writeBundle() {
          // Write version.json for production build
          writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify({ hash: buildHash }));
        },
      },
    ],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Hidden source maps: emitted for Sentry upload (when configured) but not
    // referenced in the shipped JS, so they aren't exposed to end users.
    sourcemap: sentryUpload ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks: {
          'supabase': ['@supabase/supabase-js'],
          'jssip': ['jssip'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    open: true,
    host: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  };
});