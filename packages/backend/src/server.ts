import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/healthz', async () => ({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3000);

// Render routes to the container's external interface, so 127.0.0.1 would fail its port scan.
await app.listen({ port, host: '0.0.0.0' });
