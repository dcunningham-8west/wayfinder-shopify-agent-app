#!/usr/bin/env node
// Fills "On hand (new)" with a random quantity for rows at the target location.
// Usage: node scripts/fill-inventory.mjs <in.csv> <out.csv> [location] [min] [max]

import { readFileSync, writeFileSync } from 'node:fs';

const [
  ,
  ,
  inPath = 'inventory_export_1.csv',
  outPath = 'inventory_import.csv',
  location = 'Shop location',
  min = '1',
  max = '50',
] = process.argv;

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const csvEscape = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const rows = parseCsv(readFileSync(inPath, 'utf8').replace(/^\uFEFF/, ''));
const header = rows[0];
const locCol = header.indexOf('Location');
const qtyCol = header.indexOf('On hand (new)');
if (locCol === -1 || qtyCol === -1) {
  console.error('Missing "Location" or "On hand (new)" column');
  process.exit(1);
}

const lo = Number(min);
const hi = Number(max);
let filled = 0;
for (const row of rows.slice(1)) {
  if (row[locCol] !== location) continue;
  row[qtyCol] = String(lo + Math.floor(Math.random() * (hi - lo + 1)));
  filled += 1;
}

const out = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
writeFileSync(outPath, '\uFEFF' + out, 'utf8');
console.log(`Filled ${filled} rows at "${location}" (${lo}-${hi}) -> ${outPath}`);
