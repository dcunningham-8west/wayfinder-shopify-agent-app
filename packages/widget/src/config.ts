/** Set by the Liquid section so the theme owns the URL, not the bundle. */
declare global {
  interface Window {
    __WAYFINDER__?: { backendUrl?: string; avatar?: boolean };
  }
}

export interface WidgetConfig {
  backendUrl: string;
  socketUrl: string;
  avatar: boolean;
}

export function loadConfig(): WidgetConfig {
  const backendUrl = (window.__WAYFINDER__?.backendUrl ?? '').replace(/\/$/, '');
  if (!backendUrl) throw new Error('Wayfinder: no backendUrl');
  return {
    backendUrl,
    socketUrl: backendUrl.replace(/^http/, 'ws'),
    avatar: window.__WAYFINDER__?.avatar === true,
  };
}
