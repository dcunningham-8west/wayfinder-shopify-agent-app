import assert from 'node:assert/strict';
import test from 'node:test';
import { AvatarMinter, AvatarOutOfMinutes } from '../dist/avatar/avatar-minter.js';

const HOUR = 60 * 60 * 1000;

function provider(mintToken) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    mintToken: () => {
      calls += 1;
      return mintToken();
    },
  };
}

test('a minted token comes back as a grant', async () => {
  const minter = new AvatarMinter(provider(async () => 'tok'));
  assert.deepEqual(await minter.mint(), { grant: { session_token: 'tok' } });
});

test('a mint slower than the cap fails as a timeout', async () => {
  const minter = new AvatarMinter(provider(() => new Promise(() => {})), { timeoutMs: 10 });
  assert.deepEqual(await minter.mint(), { error: 'timeout' });
});

test('a provider failure is reported without the grant', async () => {
  const minter = new AvatarMinter(provider(async () => { throw new Error('boom'); }));
  assert.deepEqual(await minter.mint(), { error: 'mint_failed' });
});

test('no minutes left skips minting for an hour', async () => {
  let now = 0;
  let outOfMinutes = true;
  const fake = provider(async () => {
    if (outOfMinutes) throw new AvatarOutOfMinutes();
    return 'tok';
  });
  const minter = new AvatarMinter(fake, { now: () => now });

  assert.deepEqual(await minter.mint(), { error: 'out_of_minutes' });
  outOfMinutes = false;

  now = HOUR - 1;
  assert.deepEqual(await minter.mint(), { error: 'out_of_minutes_skip' });
  assert.equal(fake.calls, 1);

  now = HOUR;
  assert.deepEqual(await minter.mint(), { grant: { session_token: 'tok' } });
  assert.equal(fake.calls, 2);
});
