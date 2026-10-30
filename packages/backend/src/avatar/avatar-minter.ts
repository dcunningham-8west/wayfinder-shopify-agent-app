import type { AvatarGrant } from '@wayfinder/contracts';

export class AvatarOutOfMinutes extends Error {}

/** The seam Simli sits behind, so minting policy stays testable without a network. */
export interface AvatarProvider {
  mintToken(): Promise<string>;
}

export type MintResult = { grant: AvatarGrant } | { error: string };

export interface AvatarMinterOptions {
  timeoutMs?: number;
  outOfMinutesSkipMs?: number;
  now?: () => number;
}

export class AvatarMinter {
  readonly #timeoutMs: number;
  readonly #skipMs: number;
  readonly #now: () => number;
  #skipUntil = 0;

  constructor(
    private readonly provider: AvatarProvider,
    { timeoutMs = 3000, outOfMinutesSkipMs = 60 * 60 * 1000, now = Date.now }: AvatarMinterOptions = {},
  ) {
    this.#timeoutMs = timeoutMs;
    this.#skipMs = outOfMinutesSkipMs;
    this.#now = now;
  }

  async mint(): Promise<MintResult> {
    if (this.#now() < this.#skipUntil) return { error: 'out_of_minutes_skip' };

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.#timeoutMs);
    });
    try {
      const token = await Promise.race([this.provider.mintToken(), timeout]);
      if (token === 'timeout') return { error: 'timeout' };
      return { grant: { session_token: token } };
    } catch (error) {
      if (error instanceof AvatarOutOfMinutes) {
        this.#skipUntil = this.#now() + this.#skipMs;
        return { error: 'out_of_minutes' };
      }
      return { error: 'mint_failed' };
    } finally {
      clearTimeout(timer);
    }
  }
}
