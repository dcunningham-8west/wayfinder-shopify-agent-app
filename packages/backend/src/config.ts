/** Fails loudly at boot. A missing secret should not surface as a 401 mid-call. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export interface Config {
  port: number;
  /** Retell signs webhooks with the API key itself — there is no separate webhook secret. */
  retellApiKey: string;
  /** Absent until the agent exists; Call Leg creation reports that rather than failing oddly. */
  retellAgentId?: string;
  shopifyStoreDomain: string;
  shopifyAdminToken: string;
  /** The custom storefront domain, and nothing else; comma-separated. */
  allowedOrigins: string[];
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    retellApiKey: required('RETELL_API_KEY'),
    retellAgentId: process.env.RETELL_AGENT_ID,
    shopifyStoreDomain: required('SHOPIFY_STORE_DOMAIN'),
    shopifyAdminToken: required('SHOPIFY_ADMIN_TOKEN'),
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
