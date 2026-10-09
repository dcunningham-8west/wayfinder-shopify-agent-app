import Retell from 'retell-sdk';
import { toolDefinitions } from '@wayfinder/contracts';
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

/** Only earned where the shopper is waiting on a lookup they asked for. */
const EXECUTION_MESSAGE: Partial<Record<string, string>> = {
  search_catalogue: 'Say briefly that you are looking, in no more than four words.',
};

function customFunctions(webhookUrl: string) {
  return toolDefinitions().map((tool) => ({
    type: 'custom' as const,
    name: tool.name,
    description: tool.description,
    url: webhookUrl,
    parameters: tool.parameters,
    timeout_ms: TOOL_TIMEOUT_MS,
    speak_during_execution: EXECUTION_MESSAGE[tool.name] !== undefined,
    execution_message_description: EXECUTION_MESSAGE[tool.name],
    // An Action's outcome is the thing to speak; a navigate ack is not worth narrating.
    speak_after_execution: tool.name !== 'navigate' && tool.name !== 'open_product',
  }));
}

async function main(): Promise<void> {
  const client = new Retell({ apiKey: required('RETELL_API_KEY') });
  const agentId = required('RETELL_AGENT_ID');
  const llmId = required('RETELL_LLM_ID');
  const webhookUrl = `${required('BACKEND_PUBLIC_URL').replace(/\/$/, '')}/webhooks/retell/tool`;

  const prompt = buildPrompt();
  await client.llm.update(llmId, {
    general_prompt: prompt,
    general_tools: customFunctions(webhookUrl),
  });

  await client.agent.update(agentId, {
    response_engine: { type: 'retell-llm', llm_id: llmId },
    // 0.8 silently adds ~1.5 s to every turn; this is a latency decision, not a style one.
    responsiveness: 1,
    interruption_sensitivity: 1,
    data_storage_setting: 'everything_except_pii',
  });

  console.log(`synced: ${prompt.length} chars, ${toolDefinitions().length} tools -> ${webhookUrl}`);
}

await main();
