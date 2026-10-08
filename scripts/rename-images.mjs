#!/usr/bin/env node
// Renames product images to CDN-safe names and rewrites Image Src in the CSV to
// match. Shopify's CDN appends a random suffix when a filename contains an
// underscore before dimensions (e.g. _1000x1000), so those are stripped.
// Usage: node scripts/rename-images.mjs [imageDir] [csvPath] [cdnBase] [--apply]

import { readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const [imageDir = '1000x1000', csvPath = 'products.csv', cdnBase = ''] = args.filter(
  (a) => a !== '--apply',
);

const SOURCE_NAME = /^jo_sku_([A-Za-z0-9]+)_\d+x\d+_(\d+)\.(png|jpe?g|webp)$/i;

const safeName = (name) => {
  const m = SOURCE_NAME.exec(name);
  if (!m) return null;
  const [, sku, index, ext] = m;
  return `${sku.toLowerCase()}-${index}.${ext.toLowerCase()}`;
};

const files = readdirSync(imageDir, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name);

const renames = new Map();
const skipped = [];
for (const name of files) {
  const next = safeName(name);
  if (next) renames.set(name, next);
  else skipped.push(name);
}

const collisions = [...renames.values()].filter((v, i, a) => a.indexOf(v) !== i);
if (collisions.length) {
  console.error(`Aborting: duplicate target names: ${[...new Set(collisions)].join(', ')}`);
  process.exit(1);
}

const csv = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
let rewritten = 0;
const nextCsv = csv.replace(/jo_sku_[A-Za-z0-9]+_\d+x\d+_\d+\.(?:png|jpe?g|webp)/gi, (match) => {
  const next = safeName(match);
  if (!next) return match;
  rewritten += 1;
  return next;
});

// Swap the old host prefix for the Shopify CDN base.
const finalCsv = cdnBase
  ? nextCsv.replace(/https?:\/\/[^,"]*?\/([a-z0-9]+-\d+\.(?:png|jpe?g|webp))/gi, `${cdnBase}$1`)
  : nextCsv;

console.log(`${renames.size} files to rename, ${skipped.length} skipped, ${rewritten} CSV refs`);
if (skipped.length) console.log(`  skipped: ${skipped.slice(0, 5).join(', ')}`);
console.log(`  example: ${[...renames.entries()][0]?.join('  ->  ')}`);

if (!apply) {
  console.log('Dry run. Re-run with --apply to write changes.');
  process.exit(0);
}

for (const [from, to] of renames) renameSync(join(imageDir, from), join(imageDir, to));
writeFileSync(csvPath, '\uFEFF' + finalCsv, 'utf8');
console.log(`Renamed ${renames.size} files and updated ${csvPath}`);
