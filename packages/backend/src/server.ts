import { buildServer } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildServer(config);

// Render routes to the container's external interface, so 127.0.0.1 would fail its port scan.
await app.listen({ port: config.port, host: '0.0.0.0' });
