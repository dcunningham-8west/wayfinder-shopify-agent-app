import { Retell } from 'retell-sdk';
import type { SessionId } from '@wayfinder/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { dispatchToolCall, RESULT_CHAR_CAP, type ToolDeps } from '../tools/dispatch.js';

/**
 * Section 06: a Tool resolves entirely backend-side and changes nothing the shopper can see.
 * Retell calls this from its own servers, so localhost is unreachable — tunnel to test.
 */

interface ToolWebhookBody {
  name?: unknown;
  args?: unknown;
  call?: { call_id?: string; metadata?: { session_id?: string } };
}

export interface ToolWebhookOptions extends ToolDeps {
  retellApiKey: string;
}

/**
 * Registered with `app.register`, which encapsulates it — the raw-body parser below must not
 * apply to routes that want ordinary JSON.
 */
export async function toolWebhookPlugin(
  app: FastifyInstance,
  { retellApiKey, ...deps }: ToolWebhookOptions,
): Promise<void> {
  // Signatures are over the exact bytes Retell sent; a re-serialised body reorders keys.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, { raw: body as string });
  });

  app.post('/webhooks/retell/tool', async (request, reply) => {
    const raw = (request.body as { raw?: string } | undefined)?.raw ?? '';

    if (!(await isFromRetell(request, raw, retellApiKey))) {
      request.log.warn('rejected tool call: bad signature');
      return reply.code(401).send({ error: 'unauthorized' });
    }

    let body: ToolWebhookBody;
    try {
      body = JSON.parse(raw) as ToolWebhookBody;
    } catch {
      return reply.code(400).send({ error: 'malformed_body' });
    }

    const name = typeof body.name === 'string' ? body.name : '';
    const sessionId = body.call?.metadata?.session_id as SessionId | undefined;
    const outcome = await dispatchToolCall({ name, args: body.args ?? {}, sessionId }, deps);

    // Ids and outcomes only — logs never carry conversation content (ticket 014).
    request.log.info({ tool: name, call_id: body.call?.call_id, ok: outcome.ok }, 'tool call');

    // Always 2xx: a non-2xx hands the agent a raw HTTP error to read out. A failure the
    // agent can narrate beats one the shopper hears as silence.
    return reply.code(200).send(truncate(outcome));
  });
}

async function isFromRetell(
  request: FastifyRequest,
  raw: string,
  apiKey: string,
): Promise<boolean> {
  const signature = request.headers['x-retell-signature'];
  if (typeof signature !== 'string') return false;
  try {
    return await Retell.verify(raw, apiKey, signature);
  } catch {
    return false;
  }
}

function truncate(outcome: unknown): unknown {
  const serialised = JSON.stringify(outcome);
  if (serialised.length <= RESULT_CHAR_CAP) return outcome;
  return { ok: false, error: 'result_too_large' };
}
