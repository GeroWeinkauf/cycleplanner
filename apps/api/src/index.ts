import Fastify from 'fastify';
import type { HealthStatus } from '@cycleplanner/shared';

const PORT = parseInt(process.env.API_PORT || '3000', 10);
const HOST = process.env.API_HOST || '127.0.0.1';

const app = Fastify({ logger: true });

// Health check endpoint
app.get<{ Reply: HealthStatus }>('/api/health', async (_req, reply) => {
  return reply.send({ status: 'ok' });
});

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`API listening on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export default app;
