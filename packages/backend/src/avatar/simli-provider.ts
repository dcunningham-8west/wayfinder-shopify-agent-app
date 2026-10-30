import { AvatarOutOfMinutes, type AvatarProvider } from './avatar-minter.js';

export class SimliAvatarProvider implements AvatarProvider {
  constructor(
    private readonly apiKey: string,
    private readonly faceId: string,
  ) {}

  async mintToken(): Promise<string> {
    const response = await fetch('https://api.simli.ai/compose/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-simli-api-key': this.apiKey },
      body: JSON.stringify({
        faceId: this.faceId,
        handleSilence: false,
        maxSessionLength: 600,
        maxIdleTime: 30,
      }),
    });
    if (!response.ok) {
      // Simli doesn't document its out-of-minutes response; 402 or a "minutes" message is the guess.
      const text = await response.text();
      if (response.status === 402 || /minute/i.test(text)) throw new AvatarOutOfMinutes();
      throw new Error(`simli_token_${response.status}`);
    }
    const { session_token } = (await response.json()) as { session_token?: unknown };
    if (typeof session_token !== 'string' || !session_token) throw new Error('simli_token_malformed');
    return session_token;
  }
}
