import { Retell } from 'retell-sdk';
import type { SessionSeed } from '@wayfinder/contracts';

/** The seam Retell sits behind, so Session and Seed logic stays testable without a network. */
export interface WebCall {
  callId: string;
  accessToken: string;
  /** Retell's v3 transport; without it the web client falls back to a retired LiveKit path. */
  transport: string;
  iceServers: unknown[];
}

export interface VoiceProvider {
  createWebCall(seed: SessionSeed): Promise<WebCall>;
}

export class RetellVoiceProvider implements VoiceProvider {
  readonly #client: Retell;

  constructor(
    apiKey: string,
    private readonly agentId: string,
  ) {
    this.#client = new Retell({ apiKey });
  }

  async createWebCall(seed: SessionSeed): Promise<WebCall> {
    const call = await this.#client.call.createWebCall({
      agent_id: this.agentId,
      // The Seed rides in as dynamic variables; Retell interpolates them into the prompt.
      retell_llm_dynamic_variables: { wayfinder_seed: JSON.stringify(seed) },
      metadata: { session_id: seed.session_id, call_leg_id: seed.call_leg_id },
    });
    return {
      callId: call.call_id,
      accessToken: call.access_token,
      transport: call.transport,
      iceServers: call.ice_servers,
    };
  }
}
