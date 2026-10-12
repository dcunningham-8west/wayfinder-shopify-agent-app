import type { TranscriptTurn } from '@wayfinder/contracts';

/**
 * Retell's live transcript stream. On SDK v3 the browser only gets it by opening this socket
 * with an API key, so the backend opens it and relays what the widget needs.
 */

const MONITOR_URL = 'wss://api.retellai.com/v2/monitor-call/';
/** 4004 means the call is not live yet; the browser is usually still joining. */
const NOT_LIVE = 4004;
const MAX_RETRIES = 8;
const RETRY_MS = 750;
const MAX_TURN_CHARS = 2000;

interface MonitorItem {
  id: string;
  role?: string;
  content?: unknown;
  time_sec?: number;
}

export interface MonitorHandlers {
  onTranscript(turns: TranscriptTurn[]): void;
  onError(message: string): void;
}

/** Returns a stop function. The stream also ends by itself when the call does. */
export function monitorCall(apiKey: string, callId: string, handlers: MonitorHandlers): () => void {
  const items = new Map<string, MonitorItem & { seq: number }>();
  let seq = 0;
  let attempts = 0;
  let stopped = false;
  let socket: WebSocket | undefined;

  const open = (): void => {
    if (stopped) return;
    socket = new WebSocket(MONITOR_URL + encodeURIComponent(callId), ['bearer', apiKey]);

    socket.addEventListener('message', (event) => {
      let message: { type?: string; transcripts?: MonitorItem[] };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }
      attempts = 0;

      if (message.type === 'transcript_snapshot' || message.type === 'transcript_updated') {
        for (const item of message.transcripts ?? []) {
          if (!item.id) continue;
          items.set(item.id, { ...item, seq: items.get(item.id)?.seq ?? seq++ });
        }
        handlers.onTranscript(toTurns([...items.values()]));
      } else if (message.type === 'call_ended') {
        stop();
      }
    });

    socket.addEventListener('close', (event) => {
      if (stopped) return;
      socket = undefined;
      const transient = event.code === NOT_LIVE || event.code < 4000;
      if (event.code !== 1000 && transient && attempts < MAX_RETRIES) {
        attempts += 1;
        setTimeout(open, RETRY_MS * attempts);
        return;
      }
      stopped = true;
      if (event.code !== 1000) handlers.onError(`monitor closed with ${event.code}`);
    });
  };

  const stop = (): void => {
    stopped = true;
    socket?.close();
    socket = undefined;
  };

  open();
  return stop;
}

function toTurns(items: (MonitorItem & { seq: number })[]): TranscriptTurn[] {
  return items
    .sort((a, b) => (a.time_sec ?? 0) - (b.time_sec ?? 0) || a.seq - b.seq)
    .flatMap((item) => {
      if (typeof item.content !== 'string' || !item.content.trim()) return [];
      if (item.role !== 'agent' && item.role !== 'user') return [];
      return [
        {
          role: item.role === 'agent' ? ('agent' as const) : ('shopper' as const),
          text: item.content.slice(-MAX_TURN_CHARS),
        },
      ];
    });
}
