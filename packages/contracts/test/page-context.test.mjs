import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Furniture, PageContext } from '../dist/index.js';

const homeTemplateSource = await readFile(
  new URL('../../theme/templates/index.json', import.meta.url),
  'utf8',
);
const homeTemplate = JSON.parse(homeTemplateSource.slice(homeTemplateSource.indexOf('{')));

test('home Complimentary Benefits furniture contains structure without column copy', () => {
  const section = homeTemplate.sections.multicolumn_3eaP9g;
  const columns = section.block_order.map((blockId) => section.blocks[blockId].settings);
  const furniture = {
    kind: 'multicolumn',
    label: cleanText(section.settings.title),
    columns: columns.map((column) => ({
      title: cleanText(column.title),
      cta_label: cleanText(column.link_label),
      destination: column.link,
    })),
  };

  const pageContext = PageContext.parse({
    epoch: 1,
    url: '/',
    template: 'index',
    sections: [
      {
        section_id: 'multicolumn_3eaP9g',
        kind: 'multicolumn',
        furniture: [furniture],
      },
    ],
  });

  assert.deepEqual(pageContext.sections[0].furniture[0], {
    kind: 'multicolumn',
    label: 'Complimentary Benefits',
    columns: [
      {
        title: 'Complimentary Gift Wrap',
        cta_label: 'Find A Gift',
        destination: 'shopify://collections/our-best-gift-collection-yet',
      },
      {
        title: 'Delivery options',
        cta_label: 'Find Out More',
        destination: 'shopify://pages/delivery-options',
      },
      {
        title: 'Help & Contact',
        cta_label: 'Contact Us',
        destination: 'shopify://pages/contact',
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(pageContext), /Each Jo Malone London gift/);
  assert.throws(() => Furniture.parse({ ...furniture, body_copy: columns[0].text }));
});

function cleanText(value) {
  return value.replaceAll('&nbsp;', ' ').trim();
}