import { z } from 'zod';
import { CallLegRequest } from './session.js';

/** Section 14. */

/** Not `SessionMode`: that is standby/live within a voice Session. */
export const Channel = z.enum(['chat', 'voice']);
export type Channel = z.infer<typeof Channel>;

export const ChatLegId = z.string().min(1).brand<'ChatLegId'>();
export type ChatLegId = z.infer<typeof ChatLegId>;

/** Sent as the first completion of every Chat Leg; a Retell chat agent never opens on its own. */
export const CHAT_OPENING_TRIGGER = '[[widget_opened]]';

export const CHAT_MESSAGE_MAX_CHARS = 1000;

export const ChatAgentMessage = z
  .object({ role: z.literal('agent'), text: z.string().min(1) })
  .strict();
export type ChatAgentMessage = z.infer<typeof ChatAgentMessage>;

/** The page-load body is identical; the avatar flag is meaningless and rejected. */
export const ChatLegRequest = CallLegRequest.omit({ avatar: true });
export type ChatLegRequest = z.input<typeof ChatLegRequest>;

export const ChatLegResponse = z
  .object({ chat_leg_id: ChatLegId, messages: z.array(ChatAgentMessage) })
  .strict();
export type ChatLegResponse = z.infer<typeof ChatLegResponse>;

export const ChatMessageRequest = z
  .object({ content: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS) })
  .strict();
export type ChatMessageRequest = z.infer<typeof ChatMessageRequest>;

export const ChatMessageResponse = z.object({ messages: z.array(ChatAgentMessage) }).strict();
export type ChatMessageResponse = z.infer<typeof ChatMessageResponse>;
