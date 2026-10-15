import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { ActionChannel } from './actions/action-channel.js';
import { CatalogueIndex } from './catalogue/catalogue-index.js';
import { LexicalRanker } from './catalogue/lexical-ranker.js';
import { fetchCatalogue, fetchCollectionDestinations, fetchLiveFacts, fetchPageDestinations } from './catalogue/shopify.js';
import { loadConfig } from './config.js';
import { Destinations } from './destinations/destinations.js';
import { registerActionSocket } from './routes/action-socket.js';
import { registerSessionRoutes } from './routes/session.js';
import { toolWebhookPlugin } from './routes/tool-webhook.js';
import { SessionStore } from './session/session-store.js';
import { RetellVoiceProvider } from './voice/voice-provider.js';
import { TranscriptRelay } from './voice/transcript-relay.js';

export async function buildServer(config = loadConfig()) {
  const app = Fastify({ logger: true });

  const shopify = {
    storeDomain: config.shopifyStoreDomain,
    adminToken: config.shopifyAdminToken,
  };
  const catalogue = new CatalogueIndex(new LexicalRanker(), (args) =>
    fetchLiveFacts(shopify, args),
  );
  const sessions = new SessionStore();
  const actions = new ActionChannel();
  const destinations = new Destinations();

  await app.register(websocket);

  // The widget runs on the storefront origin, the backend on Render; nothing else needs in.
  await app.register(cors, {
    origin: [`https://${config.shopifyStoreDomain}`, ...config.allowedOrigins],
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['content-type', 'x-wayfinder-session-token'],
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    catalogue: catalogue.size,
    sessions: sessions.size,
  }));

  registerActionSocket(app, { sessions, actions });

  registerSessionRoutes(app, {
    sessions,
    catalogue,
    destinations,
    voice: config.retellAgentId
      ? new RetellVoiceProvider(config.retellApiKey, config.retellAgentId)
      : undefined,
    transcripts: new TranscriptRelay(config.retellApiKey, sessions, actions, app.log),
  });

  await app.register(toolWebhookPlugin, {
    catalogue,
    destinations,
    actions,
    sessions,
    retellApiKey: config.retellApiKey,
  });

  // Serve before the catalogue loads rather than block the port: Render health-checks early,
  // and an empty Index answers "none" instead of hanging a voice turn.
  app.ready(() => {
    void fetchCatalogue(shopify)
      .then((products) => {
        catalogue.replace(products);
        app.log.info({ products: products.length }, 'catalogue index built');
      })
      .catch((error: unknown) => app.log.error({ error }, 'catalogue index build failed'));

    void Promise.allSettled([
      fetchCollectionDestinations(shopify),
      fetchPageDestinations(shopify),
    ]).then(([collections, pages]) => {
      const fetched = [collections, pages].flatMap((r) => {
        if (r.status === 'fulfilled') return r.value;
        app.log.error({ error: r.reason }, 'destination fetch failed');
        return [];
      });
      destinations.replace(fetched);
      app.log.info({ destinations: fetched.length }, 'destinations loaded');
    });
  });

  return app;
}
