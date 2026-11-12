import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt } from '../dist/build-prompt.js';

const voice = buildPrompt('voice');
const chat = buildPrompt('chat');

test('the voice prompt omits the chat rules', () => {
  assert.match(voice, /^# Voice$/m);
  assert.doesNotMatch(voice, /^# Chat$/m);
});

test('the chat prompt omits the voice rules', () => {
  assert.match(chat, /^# Chat$/m);
  assert.doesNotMatch(chat, /^# Voice$/m);
});

test('both prompts share the rest', () => {
  for (const heading of [/^# Continuity$/m, /^# Tools$/m, /^# Session brief$/m]) {
    assert.match(voice, heading);
    assert.match(chat, heading);
  }
});
