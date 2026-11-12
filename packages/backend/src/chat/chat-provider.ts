import { Retell } from 'retell-sdk';
import type { ChatAgentMessage, SessionSeed } from '@wayfinder/contracts';
import { promptVariables } from '../session/seed.js';

/** The seam Retell chat sits behind, mirroring `VoiceProvider`. */
export interface ChatProvider {
  createChat(seed: SessionSeed): Promise<{ chatId: string }>;
  /** Synchronous: resolves when the agent's whole reply, tool calls included, is done. */
  complete(chatId: string, content: string): Promise<ChatAgentMessage[]>;
  endChat(chatId: string): Promise<void>;
}

export class RetellChatProvider implements ChatProvider {
  readonly #client: Retell;

  constructor(
    apiKey: string,
    private readonly agentId: string,
  ) {
    this.#client = new Retell({ apiKey });
  }

  async createChat(seed: SessionSeed): Promise<{ chatId: string }> {
    const chat = await this.#client.chat.create({
      agent_id: this.agentId,
      retell_llm_dynamic_variables: promptVariables(seed),
      metadata: { session_id: seed.session_id, chat_leg_id: seed.call_leg_id },
    });
    return { chatId: chat.chat_id };
  }

  async complete(chatId: string, content: string): Promise<ChatAgentMessage[]> {
    const { messages } = await this.#client.chat.createChatCompletion({ chat_id: chatId, content });
    return messages.flatMap((m) =>
      m.role === 'agent' && 'content' in m && m.content.trim()
        ? [{ role: 'agent' as const, text: m.content.trim() }]
        : [],
    );
  }

  async endChat(chatId: string): Promise<void> {
    await this.#client.chat.end(chatId);
  }
}
