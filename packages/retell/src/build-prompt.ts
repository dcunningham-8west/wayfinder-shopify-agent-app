import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolDefinitions } from '@wayfinder/contracts';

/**
 * Section 07. Four hand-authored files plus tool text generated from `contracts`, so the
 * prompt cannot describe a tool surface the schemas no longer have.
 */

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

function authored(): string {
  return readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => readFileSync(join(PROMPTS_DIR, f), 'utf8').trim())
    .join('\n\n');
}

function generatedToolGuidance(): string {
  const all = toolDefinitions();
  const group = (kind: 'tool' | 'action') =>
    all.filter((t) => t.kind === kind).map((t) => `- **${t.name}** — ${t.description}`);

  return [
    '# Tools',
    '',
    'Generated from the schemas the server validates against.',
    '',
    ...group('tool'),
    '',
    '# Actions',
    '',
    'These change what the shopper sees. They happen in their browser, so they take a moment',
    'and can fail. Say what you are doing as you do it, and if one fails, say so plainly.',
    '',
    ...group('action'),
  ].join('\n');
}

/** The brief is absent on a first leg; the continuity rules turn on exactly that. */
const SEED_SECTION = [
  '# Session brief',
  '',
  '{{wayfinder_seed}}',
].join('\n');

export function buildPrompt(): string {
  return [authored(), generatedToolGuidance(), SEED_SECTION].join('\n\n');
}
