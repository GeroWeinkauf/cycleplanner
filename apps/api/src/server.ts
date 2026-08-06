import { buildApp } from './index.js';

const PORT = parseInt(process.env.API_PORT || '3000', 10);
const HOST = process.env.API_HOST || '127.0.0.1';

const app = buildApp();
app.log.level = 'info';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`API listening on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
