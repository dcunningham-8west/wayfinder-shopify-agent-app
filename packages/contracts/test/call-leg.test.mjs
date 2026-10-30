import assert from 'node:assert/strict';
import test from 'node:test';
import { AvatarTokenResponse, CallLegRequest, CallLegResponse } from '../dist/index.js';

const leg = {
  call_leg_id: 'leg_1',
  access_token: 'retell-token',
  call_id: 'call_1',
  transport: 'gateway',
  ice_servers: [{ urls: 'stun:stun.example.com' }],
};

test('a call leg without an avatar is voice-only', () => {
  const parsed = CallLegResponse.parse(leg);
  assert.equal(parsed.avatar, undefined);
  assert.equal(parsed.access_token, 'retell-token');
});

test('a call leg can carry an avatar session token', () => {
  const parsed = CallLegResponse.parse({ ...leg, avatar: { session_token: 'simli-token' } });
  assert.deepEqual(parsed.avatar, { session_token: 'simli-token' });
});

test('an avatar with an empty session token is rejected', () => {
  assert.equal(CallLegResponse.safeParse({ ...leg, avatar: { session_token: '' } }).success, false);
});

const request = {
  page_context: { epoch: 1, url: '/', template: 'index', sections: [] },
  action_targets: [],
  form_results: [],
  cart: { count: 0, lines: [] },
};

test('a call leg request without avatar still parses', () => {
  assert.equal(CallLegRequest.parse(request).avatar, undefined);
});

test('a call leg request can ask for the avatar', () => {
  assert.equal(CallLegRequest.parse({ ...request, avatar: true }).avatar, true);
});

test('a non-boolean avatar request is rejected', () => {
  assert.equal(CallLegRequest.safeParse({ ...request, avatar: 'yes' }).success, false);
});

test('the mid-leg avatar token response carries a session token', () => {
  assert.deepEqual(AvatarTokenResponse.parse({ session_token: 'simli-token' }), {
    session_token: 'simli-token',
  });
  assert.equal(AvatarTokenResponse.safeParse({}).success, false);
});
