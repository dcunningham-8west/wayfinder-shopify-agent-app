import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { ACTION_DESCRIPTIONS, SERVER_FILLED, UNOFFERED_ACTIONS, actionSchema } from './action-definitions.js';
import { ActionName } from './actions.js';
import { TOOL_SCHEMAS, ToolName } from './tools.js';

/**
 * Section 06. The agent's view of a Tool is generated from the same schema the webhook
 * validates against, so a drift between what the agent sends and what we accept is impossible.
 */

/** Written for the model, not for a developer: when to call, and when not to. */
const DESCRIPTIONS: Record<ToolName, string> = {
  search_catalogue:
    'Find products in the store. Call this whenever the shopper describes what they want, ' +
    'however vaguely. Never answer from memory and never invent a product; if match_quality ' +
    'is "none", say so and offer the alternative returned.',
  get_live_facts:
    'Get current price and availability for one product the shopper has already been shown. ' +
    'Call this before stating any price or saying something is in stock. Never use it to search.',
};

/** Only the keys Retell reads; `url` and timing are applied at provisioning time. */
export interface ToolDefinition {
  name: ToolName | ActionName;
  description: string;
  /** An Action runs in the browser, so it needs a live socket and a different timeout. */
  kind: 'tool' | 'action';
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

function parametersOf(schema: ZodTypeAny, drop: readonly string[] = []): ToolDefinition['parameters'] {
  const json = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    // Retell validates against draft-07, where `exclusiveMinimum` is a number, not a flag.
    target: 'jsonSchema7',
  }) as { properties?: Record<string, unknown>; required?: string[] };
  const properties = { ...(json.properties ?? {}) };
  for (const key of drop) delete properties[key];
  return {
    type: 'object',
    properties,
    required: (json.required ?? []).filter((key) => !drop.includes(key)),
  };
}

export function toolDefinitions(): ToolDefinition[] {
  const tools: ToolDefinition[] = ToolName.options.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    kind: 'tool',
    parameters: parametersOf(TOOL_SCHEMAS[name].args),
  }));

  const actions: ToolDefinition[] = ActionName.options
    .filter((name) => !UNOFFERED_ACTIONS.has(name))
    .map((name) => ({
      name,
      description: ACTION_DESCRIPTIONS[name],
      kind: 'action',
      // The agent names the action by calling it; the discriminant is not an argument.
      parameters: parametersOf(actionSchema(name), ['action', ...(SERVER_FILLED[name] ?? [])]),
    }));

  return [...tools, ...actions];
}
