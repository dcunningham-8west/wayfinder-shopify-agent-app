#!/usr/bin/env node
// Converts the scraped product JSON (data.products.items[]) into a Shopify
// product import CSV. Usage:
//   node scripts/json-to-shopify-csv.mjs test.json products.csv [imageBaseUrl]

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath = 'test.json', outPath = 'products.csv', imageBase = ''] = process.argv;

const COLUMNS = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Product Category',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Variant SKU',
  'Variant Grams',
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Compare At Price',
  'Variant Requires Shipping',
  'Variant Taxable',
  'Variant Barcode',
  'Image Src',
  'Image Position',
  'Image Alt Text',
  'Gift Card',
  'SEO Title',
  'SEO Description',
  'Status',
];

const VENDOR = 'Jo Malone London';
const CURRENCY = 'GBP';

const text = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

const handleOf = (product) =>
  text(product.display_name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

const gramsOf = (size) => {
  const m = /^([\d.]+)\s*(g|kg|ml|l)$/i.exec(text(size));
  if (!m) return '';
  const n = Number(m[1]);
  // ml treated 1:1 with grams; good enough for shipping weight.
  switch (m[2].toLowerCase()) {
    case 'kg':
    case 'l':
      return Math.round(n * 1000);
    default:
      return Math.round(n);
  }
};

const taxonomyTags = (product) => {
  const groups = ['maincat', 'subcat', 'style', 'mood', 'fragrance_family', 'fragrance_key_notes'];
  const out = new Set();
  for (const g of groups) {
    for (const entry of product[g] ?? []) {
      const label = text(entry?.key).replace(/-/g, ' ');
      if (label) out.add(label);
    }
  }
  for (const t of product.tags?.items ?? []) {
    const label = text(t?.name ?? t?.value ?? t);
    if (label && label !== '[object Object]') out.add(label);
  }
  return [...out].join(', ');
};

const bodyHtml = (product) => {
  const parts = [];
  if (text(product.description)) parts.push(`<p>${text(product.description)}</p>`);
  const usage = Array.isArray(product.usage) ? product.usage : [product.usage];
  for (const u of usage) {
    if (!text(u?.content)) continue;
    if (text(u.label)) parts.push(`<h4>${text(u.label)}</h4>`);
    parts.push(`<p>${text(u.content)}</p>`);
  }
  return parts.join('');
};

const priceOf = (sku) => {
  const p = (sku.prices ?? []).find((x) => x.currency === CURRENCY) ?? sku.prices?.[0];
  const inc = p?.include_tax;
  if (!inc) return { price: '', compareAt: '' };
  const compareAt = p.is_discounted && inc.original_price !== inc.price ? inc.original_price : '';
  return { price: inc.price ?? '', compareAt };
};

const imagesOf = (sku) => {
  const list = sku.media?.large ?? sku.media?.medium ?? [];
  return list.map((m) => ({ src: imageBase + text(m.src), alt: text(m.alt) }));
};

const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const json = JSON.parse(readFileSync(inPath, 'utf8'));
const products = json?.data?.products?.items ?? [];

const rows = [];
for (const product of products) {
  const handle = handleOf(product);
  const skus = product.skus?.items ?? [];
  const optionName = skus.some((s) => s.sizes?.[0]?.value) ? 'Size' : 'Title';
  let imagePosition = 0;
  let first = true;

  for (const sku of skus) {
    const { price, compareAt } = priceOf(sku);
    const optionValue = text(sku.sizes?.[0]?.value) || 'Default Title';
    const images = imagesOf(sku);
    const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));

    row.Handle = handle;
    row['Option1 Name'] = optionName;
    row['Option1 Value'] = optionValue;
    row['Variant SKU'] = text(sku.sku_id);
    row['Variant Grams'] = gramsOf(sku.sizes?.[0]?.value);
    row['Variant Inventory Tracker'] = 'shopify';
    row['Variant Inventory Qty'] = String(1 + Math.floor(Math.random() * 50));
    row['Variant Inventory Policy'] = 'deny';
    row['Variant Fulfillment Service'] = 'manual';
    row['Variant Price'] = price;
    row['Variant Compare At Price'] = compareAt;
    row['Variant Requires Shipping'] = 'TRUE';
    row['Variant Taxable'] = 'TRUE';
    row['Variant Barcode'] = text(sku.upc);

    if (first) {
      row.Title = text(product.display_name);
      row['Body (HTML)'] = bodyHtml(product);
      row.Vendor = VENDOR;
      row.Type = text(product.default_category?.value);
      row.Tags = taxonomyTags(product);
      row.Published = 'TRUE';
      row['Gift Card'] = 'FALSE';
      row['SEO Title'] = text(product.display_name).slice(0, 70);
      row['SEO Description'] = text(product.short_description || product.description).slice(0, 320);
      row.Status = 'draft';
      first = false;
    }

    if (images.length) {
      imagePosition += 1;
      row['Image Src'] = images[0].src;
      row['Image Position'] = imagePosition;
      row['Image Alt Text'] = images[0].alt;
    }
    rows.push(row);

    // Remaining images go on handle-only rows.
    for (const img of images.slice(1)) {
      imagePosition += 1;
      const imgRow = Object.fromEntries(COLUMNS.map((c) => [c, '']));
      imgRow.Handle = handle;
      imgRow['Image Src'] = img.src;
      imgRow['Image Position'] = imagePosition;
      imgRow['Image Alt Text'] = img.alt;
      rows.push(imgRow);
    }
  }
}

const csv = [COLUMNS.join(',')]
  .concat(rows.map((r) => COLUMNS.map((c) => csvEscape(r[c])).join(',')))
  .join('\r\n');

writeFileSync(outPath, '\uFEFF' + csv, 'utf8');
console.log(`${products.length} products -> ${rows.length} rows written to ${outPath}`);
