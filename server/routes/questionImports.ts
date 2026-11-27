import type { Hono } from 'hono';
import { MAX_QUESTION_IMPORT_BYTES } from '../../shared/game';
import { customQuestionEntry, parseQuestionImport, QuestionImportError } from '../questions/custom';
import { codePattern, commit, deleteExpired, rooms } from '../rooms/registry';

function importHost(request: Request, code: string, now: number) {
  const entry = codePattern.test(code) ? rooms.get(code) : undefined;
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{32})$/)?.[1];
  if (
    !entry ||
    !token ||
    deleteExpired(code, entry, now) ||
    entry.closedByHost ||
    entry.tokens.get(token) !== entry.room.hostId ||
    !entry.sockets.has(entry.room.hostId)
  )
    return undefined;
  return entry;
}

async function readImport(request: Request): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_QUESTION_IMPORT_BYTES) throw new QuestionImportError(0, 'size');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function registerQuestionImports(app: Hono) {
  app.get('/rooms/:code/questions', (context) => {
    const entry = importHost(context.req.raw, context.req.param('code'), Date.now());
    if (!entry) return context.json({ issue: 'host' }, 403);
    if (entry.room.phase !== 'lobby') return context.json({ issue: 'phase' }, 409);
    context.header('Cache-Control', 'no-store');
    return context.json({ questions: (entry.room.customDeck ?? []).map(customQuestionEntry) });
  });

  app.on(['PUT', 'DELETE'], '/rooms/:code/questions', async (context) => {
    const request = context.req.raw;
    const code = context.req.param('code');
    const initial = importHost(request, code, Date.now());
    if (!initial) return context.json({ issue: 'host' }, 403);
    const version = initial.room.version;
    if (initial.room.phase !== 'lobby') return context.json({ issue: 'phase' }, 409);

    try {
      const customDeck =
        request.method === 'DELETE'
          ? undefined
          : parseQuestionImport(
              await readImport(request),
              request.headers.get('content-type')?.split(';')[0] === 'text/csv',
            );
      const now = Date.now();
      const entry = importHost(request, code, now);
      if (entry !== initial || entry.room.phase !== 'lobby' || entry.room.version !== version)
        return context.json({ issue: 'phase' }, 409);
      if (context.req.query('preview') === '1') {
        context.header('Cache-Control', 'no-store');
        return context.json({
          count: customDeck?.length ?? 0,
          questions: (customDeck ?? []).map(customQuestionEntry),
        });
      }
      commit(entry, { ...entry.room, customDeck, version: version + 1 }, now);
      return context.json({ count: customDeck?.length ?? 0 });
    } catch (error) {
      const issue = error instanceof QuestionImportError ? error.issue : 'format';
      return context.json(
        { issue, row: error instanceof QuestionImportError ? error.row : 0 },
        issue === 'size' ? 413 : 400,
      );
    }
  });
}
