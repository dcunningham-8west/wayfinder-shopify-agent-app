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

function once(predicate: () => boolean, timeoutMs: number): Promise<void> {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      listeners.delete(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (): void => {
      if (predicate()) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    listeners.add(listener);
  });
}

/** The agent is told to speak after an Action, so the reply may not have started yet. */
const WAIT_FOR_SPEECH_MS = 1_500;
/** Caps the wait when the agent says nothing, or says a great deal. */
const MAX_UTTERANCE_MS = 6_000;

export async function whenAgentFinishesSpeaking(): Promise<void> {
  await once(() => talking, WAIT_FOR_SPEECH_MS);
  if (talking) await once(() => !talking, MAX_UTTERANCE_MS);
}
