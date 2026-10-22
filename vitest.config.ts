import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest configuration (#332).
 *
 * The `@/*` alias has to be declared here as well as in `tsconfig.json`: Vitest
 * resolves imports through Vite, which does not read `compilerOptions.paths`.
 * Without it, every test importing `@/lib/...` or `@/components/...` fails to
 * collect with "Failed to resolve import".
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // @stellar/freighter-api is a transitive dep of @creit.tech/stellar-wallets-kit
      // and may not be hoisted to the top-level node_modules. Point Vite at the
      // nested copy so imports from src/lib/stellar.ts resolve in test runs.
      '@stellar/freighter-api': fileURLToPath(
        new URL('./node_modules/@creit.tech/stellar-wallets-kit/node_modules/@stellar/freighter-api', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Build output and dependencies never hold tests worth collecting; keeping
    // them out of the glob keeps collection off large directory trees.
    exclude: ['node_modules/**', '.next/**', 'public/**'],
  },
});
