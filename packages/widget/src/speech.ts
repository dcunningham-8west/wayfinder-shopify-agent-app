/**
 * A navigate unloads the page, and with it the agent's voice. Leaving on the agent mid-word
 * sounds like a crash, so navigation waits for the sentence to finish.
 */

let talking = false;
const listeners = new Set<() => void>();

export function setAgentTalking(value: boolean): void {
  if (value === talking) return;
  talking = value;
  for (const listener of [...listeners]) listener();
}

/** Resolves true if the predicate held before the timeout, false if it timed out. */
function within(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  if (predicate()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (held: boolean): void => {
      listeners.delete(listener);
      clearTimeout(timer);
      resolve(held);
    };
    const listener = (): void => {
      if (predicate()) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    listeners.add(listener);
  });
}

/**
 * The agent speaks after the Action result, so the line that matters has to survive an LLM
 * turn and a TTS start. Anything shorter leaves during the think.
 */
const WAIT_FOR_SPEECH_MS = 4_000;
/**
 * Retell streams speech in chunks, so `agent_stop_talking` fires between sentences too. Gaps
 * within a turn are short; the long wait is only ever for the model, and that is over once the
 * post-Action line has started.
 */
const SUSTAINED_QUIET_MS = 1_200;
/** Caps the wait when the agent says nothing, or says a great deal. */
const MAX_TOTAL_MS = 20_000;

export async function whenAgentFinishesSpeaking(): Promise<void> {
  const deadline = Date.now() + MAX_TOTAL_MS;

  // Speech already underway is the pre-Action line; the post-Action one still has to arrive.
  if (talking) await within(() => !talking, deadline - Date.now());
  if (!(await within(() => talking, WAIT_FOR_SPEECH_MS))) return;

  while (Date.now() < deadline) {
    if (talking) {
      await within(() => !talking, deadline - Date.now());
      continue;
    }
    if (!(await within(() => talking, SUSTAINED_QUIET_MS))) return;
  }
}
