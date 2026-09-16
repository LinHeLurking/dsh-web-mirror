import { defineConfig } from 'tsdown'

/**
 * Browser-half bundle for the DSH web settings page.
 *
 * The DSH client module system consumes one single-file factory CJS
 * bundle per plugin (`window.__ModuleLoader__.load({id, factory})`), with
 * platform singletons (react, cordis, the slots runtime, the client store)
 * resolved from the web shell's static module table at runtime — so they
 * must stay external and must be requested through `dsh.client.external`
 * in package.json (which is also what orders our row after the providers).
 *
 * `dsh.client.inject` in package.json mirrors the cordis-level service
 * dependencies (slots, settingsScope providers) so the browser plugin
 * activates only after those services exist.
 */
export default defineConfig({
  entry: ['src/dsh-client/index.tsx'],
  outDir: 'dist/dsh-client',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  minify: true,
  deps: {
    neverBundle: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
      '@deepseek-ai/dsh-client-ui-dockkit',
    ],
  },
  // The module system registers factories through one global load() call;
  // keep the bundle a single chunk so the plugin materializes atomically.
  codeSplitting: false,
  outputOptions: {
    // Wrap the plain CJS chunk in the factory envelope the DSH client
    // module system expects (see dsh-client-modules: executing the script
    // only REGISTERS the factory; materialization happens on first
    // require, which is what keeps CSS injection lazy too).
    banner: [
      'window.__ModuleLoader__.load({',
      '\tid: "@moonshot-ai/dsh-web-mirror",',
      '\tfactory: (require) => {',
      '\t\tvar module = { exports: {} };',
      '\t\tvar exports = module.exports;',
    ].join('\n'),
    footer: [
      '\t\treturn module.exports;',
      '\t}',
      '});',
    ].join('\n'),
  },
})
