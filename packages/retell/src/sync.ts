import Retell from 'retell-sdk';
import { RETELL_DATA_STORAGE, toolDefinitions } from '@wayfinder/contracts';
import { buildPrompt } from './build-prompt.js';

/**
 * One-way push. Nothing is ever read back from the dashboard: the ids are pinned, the
 * configuration lives here.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/** A voice turn cannot wait two minutes; the default 120 s is a silence, not a timeout. */
const TOOL_TIMEOUT_MS = 8_000;

/** Only earned where the shopper is waiting on a lookup they asked for, or about to leave the page. */
const EXECUTION_MESSAGE: Partial<Record<string, string>> = {
  search_catalogue: 'Say briefly that you are looking, in no more than four words.',
  navigate: 'Say in a few words where you are taking them, e.g. "Taking you home."',
  open_product: 'Say in a few words that you are opening it, naming the product.',
  apply_filter: 'Say in a few words what you are narrowing to.',
  sort: 'Say in a few words how you are reordering them.',
  submit_form: 'Say in a few words that you are sending it.',
};

/** The page unloads on these, so their line is spoken during execution; one after would be cut off. */
const LEAVES_PAGE = new Set(['navigate', 'open_product', 'apply_filter', 'sort', 'submit_form']);

function customFunctions(webhookUrl: string) {
  return chatFunctions(webhookUrl).map((tool) => ({
    ...tool,
    speak_during_execution: EXECUTION_MESSAGE[tool.name] !== undefined,
    execution_message_description: EXECUTION_MESSAGE[tool.name],
    // Their outcome arrives in the next leg's Seed. Everything else must be spoken, or a
    // failure reaches the shopper as silence.
    speak_after_execution: !LEAVES_PAGE.has(tool.name),
  }));
}

function chatFunctions(webhookUrl: string) {
  return toolDefinitions().map((tool) => ({
    type: 'custom' as const,
    name: tool.name,
    description: tool.description,
    url: webhookUrl,
    parameters: tool.parameters,
    timeout_ms: TOOL_TIMEOUT_MS,
  }));
}

const DATA_STORAGE = {
  data_storage_setting: RETELL_DATA_STORAGE.setting,
  data_storage_retention_days: RETELL_DATA_STORAGE.retentionDays,
  pii_config: {
    mode: RETELL_DATA_STORAGE.piiMode,
    categories: [...RETELL_DATA_STORAGE.piiCategories],
  },
};

/** Retell defaults analysis to its flagship model, billed per call or chat. */
const ANALYSIS_MODEL = 'gpt-5.4-mini';

async function main(): Promise<void> {
  const client = new Retell({ apiKey: required('RETELL_API_KEY') });
  const agentId = required('RETELL_AGENT_ID');
  const llmId = required('RETELL_LLM_ID');
  const chatAgentId = required('RETELL_CHAT_AGENT_ID');
  const chatLlmId = required('RETELL_CHAT_LLM_ID');
  const webhookUrl = `${required('BACKEND_PUBLIC_URL').replace(/\/$/, '')}/webhooks/retell/tool`;

  const prompt = buildPrompt('voice');
  await client.llm.update(llmId, {
    general_prompt: prompt,
    general_tools: customFunctions(webhookUrl),
    // The agent opens; the continuity prompt decides whether that is a greeting or a resumption.
    start_speaker: 'agent',
    begin_message: null,
  });

  await client.agent.update(agentId, {
    response_engine: { type: 'retell-llm', llm_id: llmId },
    // 0.8 silently adds ~1.5 s to every turn; this is a latency decision, not a style one.
    responsiveness: 1,
    interruption_sensitivity: 1,
    // "home page" was transcribed as "whole page" and navigated to /collections/all.
    boosted_keywords: ['home page', 'homepage'],
    ...DATA_STORAGE,
    post_call_analysis_model: ANALYSIS_MODEL,
  });

  console.log(`synced voice: ${prompt.length} chars, ${toolDefinitions().length} tools -> ${webhookUrl}`);

  const chatPrompt = buildPrompt('chat');
  await client.llm.update(chatLlmId, {
    general_prompt: chatPrompt,
    general_tools: chatFunctions(webhookUrl),
    // The backend's opening trigger is the first message; the agent replies to it.
    start_speaker: 'agent',
    begin_message: null,
  });

  await client.chatAgent.update(chatAgentId, {
    response_engine: { type: 'retell-llm', llm_id: chatLlmId },
    end_chat_after_silence_ms: 120_000,
    ...DATA_STORAGE,
    post_chat_analysis_model: ANALYSIS_MODEL,
  });

  console.log(`synced chat: ${chatPrompt.length} chars, ${toolDefinitions().length} tools -> ${webhookUrl}`);
}

await main();
