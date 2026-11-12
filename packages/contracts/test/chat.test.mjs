import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_MESSAGE_MAX_CHARS,
  Channel,
  ChatLegRequest,
  ChatLegResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from '../dist/index.js';

const request = {
  page_context: { epoch: 1, url: '/', template: 'index', sections: [] },
  action_targets: [],
  form_results: [],
  cart: { count: 0, lines: [] },
};

test('the channel is chat or voice', () => {
  assert.equal(Channel.parse('chat'), 'chat');
  assert.equal(Channel.parse('voice'), 'voice');
  assert.equal(Channel.safeParse('live').success, false);
});

test('a chat leg request takes the call leg body', () => {
  assert.deepEqual(ChatLegRequest.parse(request).cart, { count: 0, lines: [] });
});

test('a chat leg request rejects the avatar flag', () => {
  assert.equal(ChatLegRequest.safeParse({ ...request, avatar: true }).success, false);
});

test('a chat leg response carries the opening messages', () => {
  const parsed = ChatLegResponse.parse({
    chat_leg_id: 'leg_1',
    messages: [{ role: 'agent', text: 'Hi there' }],
  });
  assert.equal(parsed.messages[0].text, 'Hi there');
});

test('a message is trimmed and must not be empty', () => {
  assert.equal(ChatMessageRequest.parse({ content: '  vanilla  ' }).content, 'vanilla');
  assert.equal(ChatMessageRequest.safeParse({ content: '   ' }).success, false);
});

test('a message is capped in length', () => {
  const max = 'a'.repeat(CHAT_MESSAGE_MAX_CHARS);
  assert.equal(ChatMessageRequest.safeParse({ content: max }).success, true);
  assert.equal(ChatMessageRequest.safeParse({ content: `${max}a` }).success, false);
});

test('a message response holds only agent messages', () => {
  assert.equal(
    ChatMessageResponse.safeParse({ messages: [{ role: 'shopper', text: 'hi' }] }).success,
    false,
  );
  assert.equal(ChatMessageResponse.parse({ messages: [] }).messages.length, 0);
});
