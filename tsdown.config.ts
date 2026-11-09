import { defineConfig } from 'tsdown'
import manifest from './package.json' with { type: 'json' }

export default defineConfig([
  { entry: ['src/index.ts'], format: ['esm'], dts: true, outDir: 'lib', hash: false },
  {
    entry: ['src/client.tsx'],
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    outDir: 'lib',
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
    // DSH loads browser plugins through its synchronous module factory.
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
      intro: 'const module = { exports: {} }; const exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
