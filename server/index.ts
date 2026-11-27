import { Hono } from 'hono';
import { serveStatic, websocket } from 'hono/bun';
import { strings } from '../web/src/i18n/strings';
import { startChessCache } from './chess/cache';
import { tickRooms } from './rooms/registry';
import { registerQuestionImports } from './routes/questionImports';
import { registerWebSocket } from './routes/websocket';

const app = new Hono();
const dev = process.argv.includes('--dev');
const chessCache = startChessCache(process.env.POLOGONY_CACHE_DIR ?? '.cache/pologony');

registerQuestionImports(app);
registerWebSocket(app, chessCache.current);

if (!dev) {
  const root = `${import.meta.dir}/../web/dist`;
  app.get('/', serveStatic({ root, path: 'index.html' }));
  app.use('/*', serveStatic({ root }));
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket: { ...websocket, maxPayloadLength: 4096 },
});
console.log(`${strings.title} server listening at ${server.url}`);

chessCache.tick();
setInterval(() => {
  chessCache.tick();
  const now = Date.now();
  tickRooms(now);
}, 1000);

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: `${import.meta.dir}/../web`,
    server: {
      host: true,
      proxy: {
        '/ws': { target: `ws://127.0.0.1:${server.port}`, ws: true },
        '/rooms': `http://127.0.0.1:${server.port}`,
      },
    },
  });
  await vite.listen();
  vite.printUrls();
}
