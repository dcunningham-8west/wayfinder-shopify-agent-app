import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Channel, toolDefinitions } from '@wayfinder/contracts';

/**
 * Section 07. Four hand-authored files plus tool text generated from `contracts`, so the
 * prompt cannot describe a tool surface the schemas no longer have.
 */

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

const CHANNEL_FILES: Record<Channel, string> = { voice: '20-voice.md', chat: '20-chat.md' };

function authored(channel: Channel): string {
  const otherChannels = Object.entries(CHANNEL_FILES)
    .filter(([c]) => c !== channel)
    .map(([, f]) => f);
  return readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith('.md') && !otherChannels.includes(f))
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

/** Rendered per Call Leg by the backend; the continuity rules switch on the first line. */
const SEED_SECTION = [
  '# Session brief',
  '',
  'Continuity: {{wayfinder_continuity}}',
  '',
  '## Conversation so far (most recent last)',
  '',
  '{{wayfinder_recent_turns}}',
  '',
  '## Context',
  '',
  '{{wayfinder_seed}}',
].join('\n');

export function buildPrompt(channel: Channel): string {
  return [authored(channel), generatedToolGuidance(), SEED_SECTION].join('\n\n');
}
