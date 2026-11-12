import { buildPrompt } from './build-prompt.js';

process.stdout.write(buildPrompt(process.argv[2] === 'chat' ? 'chat' : 'voice'));
