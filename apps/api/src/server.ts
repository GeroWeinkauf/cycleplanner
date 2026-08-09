import { buildApp } from './index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(process.env.API_PORT || '3000', 10);
const HOST = process.env.API_HOST || '127.0.0.1';
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = buildApp();

// Valhalla start route (registered here to ensure it's always available)
app.post('/api/valhalla/start', async (_req, reply) => {
  try {
    const { execSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');

    const projectRoot = resolve(__dirname, '../../..');
    const composeFile = resolve(projectRoot, 'docker-compose.yml');
    if (!existsSync(composeFile)) {
      return reply.status(500).send({ ok: false, message: 'docker-compose.yml nicht gefunden' });
    }

    execSync('docker compose -f "' + composeFile + '" up -d valhalla', {
      cwd: projectRoot,
      timeout: 60000,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env },
    });
    return reply.send({ ok: true, message: 'Valhalla wird gestartet...' });
  } catch (err: unknown) {
    let msg = 'Unbekannter Fehler';
    if (err instanceof Error) {
      const execErr = err as { stderr?: Uint8Array | string; stdout?: Uint8Array | string; status?: number };
      const parts: string[] = [];
      for (const channel of ['stdout', 'stderr'] as const) {
        const data = execErr[channel];
        if (data) {
          const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf-8');
          if (text.trim()) parts.push(text.trim());
        }
      }
      msg = parts.join(' | ') || err.message;
      if (execErr.status) msg = '[Exit ' + execErr.status + '] ' + msg;
    }
    return reply.status(500).send({ ok: false, message: 'Konnte Valhalla nicht starten: ' + msg });
  }
});

app.log.level = 'info';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log('API listening on http://' + HOST + ':' + PORT);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
