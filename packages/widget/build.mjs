import { build, context } from 'esbuild';

/** Output lands in the theme so Shopify serves one asset; no CDN in the mic's critical path. */
const options = {
  entryPoints: ['src/main.ts'],
  outdir: '../theme/assets',
  entryNames: 'wayfinder-widget',
  // The voice SDK is a deferred chunk, so a shopper who never speaks never downloads it.
  chunkNames: 'wayfinder-[name]-[hash]',
  splitting: true,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
