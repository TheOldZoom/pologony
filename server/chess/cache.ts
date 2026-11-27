import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import type { ChessStage, Question } from '../questions/types';

type Puzzle = { id: string; fen: string; moves: string[]; rating: number; themes: string[] };
export type DailyPuzzles = { easy: Puzzle[]; hard: Puzzle[]; challenge: Puzzle[] };
type Cache = {
  checkedDay?: string;
  rotationDay?: string;
  etag?: string;
  modified?: string;
  reserve?: DailyPuzzles;
  daily?: DailyPuzzles;
  recent: { day: string; ids: string[] }[];
};
const URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const RESERVE = { easy: 12_000, hard: 10_000, challenge: 3_000 };
const DAILY = { easy: 250, hard: 200, challenge: 50 };
const tiers = ['easy', 'hard', 'challenge'] as const;
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function play(board: Chess, uci: string) {
  return board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

function notation(board: Chess, uci: string) {
  return play(board, uci).san;
}

export function lichessQuestion(puzzle: Puzzle): Question {
  const board = new Chess(puzzle.fen);
  play(board, puzzle.moves[0]);
  const turn = board.turn() === 'w' ? 'white' : 'black';
  const stages: ChessStage[] = [];
  const sans: string[] = [];
  for (let i = 1; i < puzzle.moves.length; i += 2) {
    const position = board.fen().split(' ')[0];
    const legal = board.moves({ verbose: true });
    const options = legal.map(({ from, to, promotion }) => from + to + (promotion ?? ''));
    const correct = options.indexOf(puzzle.moves[i]);
    if (correct < 0) throw new Error('Invalid puzzle line');
    const accepted =
      puzzle.moves.length === 2 && legal[correct].san.endsWith('#')
        ? legal.flatMap((move, index) => (move.san.endsWith('#') ? [index] : []))
        : undefined;
    stages.push({
      position,
      options,
      correct,
      accepted,
      reply: i === 1 ? undefined : puzzle.moves[i - 1],
    });
    sans.push(notation(board, puzzle.moves[i]));
    if (i + 1 < puzzle.moves.length) sans.push(notation(board, puzzle.moves[i + 1]));
  }
  const first = stages[0];
  const line = sans.join(' · ');
  const theme = puzzle.themes;
  const [esHint, enHint] = theme.includes('mate')
    ? [
        'Buscá jaques que le quiten las salidas al rey.',
        'Look for checks that cut off the king’s escape squares.',
      ]
    : theme.includes('fork')
      ? [
          'Buscá una jugada que ataque dos piezas al mismo tiempo.',
          'Look for a move that attacks two pieces at once.',
        ]
      : theme.includes('pin')
        ? [
            'Buscá una pieza que no pueda moverse sin dejar otra pieza expuesta.',
            'Look for a piece that cannot move without exposing another piece.',
          ]
        : [
            'Revisá los jaques, las capturas y las amenazas directas.',
            'Check for forcing checks, captures, and threats.',
          ];
  return {
    text: 'Encontrá la mejor jugada',
    hint: esHint,
    explanation: `Línea de Lichess · ${line}`,
    english: {
      text: 'Find the best move',
      hint: enHint,
      explanation: `Lichess solution · ${line}`,
      options: first.options,
    },
    options: first.options,
    correct: first.correct,
    mark: 'none',
    chess: { position: first.position, turn },
    chessStages: stages,
    lichessId: puzzle.id,
  };
}

function isStoredPuzzle(value: unknown): value is Puzzle {
  if (!value || typeof value !== 'object') return false;
  const puzzle = value as Partial<Puzzle>;
  return (
    typeof puzzle.id === 'string' &&
    /^[a-z0-9]{5}$/i.test(puzzle.id) &&
    typeof puzzle.fen === 'string' &&
    Array.isArray(puzzle.moves) &&
    puzzle.moves.length >= 2 &&
    puzzle.moves.length <= 16 &&
    puzzle.moves.length % 2 === 0 &&
    puzzle.moves.every(
      (move) => typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move),
    ) &&
    typeof puzzle.rating === 'number' &&
    Number.isFinite(puzzle.rating) &&
    Array.isArray(puzzle.themes) &&
    puzzle.themes.every((theme) => typeof theme === 'string')
  );
}

async function importExport(
  body: ReadableStream<Uint8Array>,
  directory: string,
): Promise<DailyPuzzles> {
  const archive = join(directory, 'lichess-export.zst.next');
  await unlink(archive).catch(() => {});
  try {
    await pipeline(
      Readable.from(body, { objectMode: false }),
      createWriteStream(archive, { flags: 'wx', mode: 0o600 }),
    );
    const proc = spawn('zstd', ['-dc', archive], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = new Promise<number | null>((resolve) => {
      proc.once('error', () => resolve(null));
      proc.once('close', resolve);
    });
    try {
      const reserve: DailyPuzzles = { easy: [], hard: [], challenge: [] };
      const seen = { easy: 0, hard: 0, challenge: 0 };
      const decoder = new TextDecoder();
      let pending = '';
      let chunks = 0;
      function sample(line: string) {
        const [id, fen, movesText, ratingText, , popularity, , themeText] = line.split(',', 8);
        const rating = Number(ratingText);
        if (!Number.isInteger(rating) || rating < 600 || rating > 2500 || Number(popularity) < 0)
          return;
        const tier = rating < 1450 ? 'easy' : rating < 1800 ? 'hard' : 'challenge';
        const index = Math.floor(Math.random() * ++seen[tier]);
        const bucket = reserve[tier];
        if (bucket.length >= RESERVE[tier] && index >= RESERVE[tier]) return;
        const puzzle = {
          id,
          fen,
          moves: movesText?.split(' '),
          rating,
          themes: themeText?.trim().split(' '),
        };
        if (!isStoredPuzzle(puzzle)) return;
        if (bucket.length < RESERVE[tier]) bucket.push(puzzle);
        else bucket[index] = puzzle;
      }

      for await (const chunk of proc.stdout) {
        if (++chunks % 128 === 0) await Bun.sleep(0);
        const lines = (pending + decoder.decode(chunk, { stream: true })).split('\n');
        pending = lines.pop() ?? '';
        if (pending.length > 8192) throw new Error('Invalid Lichess puzzle record');
        for (const line of lines) sample(line);
      }
      sample(pending + decoder.decode());
      if ((await exited) !== 0 || tiers.some((tier) => reserve[tier].length < DAILY[tier]))
        throw new Error('Incomplete Lichess puzzle export');
      return reserve;
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill();
      await exited;
    }
  } finally {
    await unlink(archive).catch(() => {});
  }
}

async function rotatePuzzles(
  reserve: DailyPuzzles,
  recent: readonly string[],
): Promise<DailyPuzzles | undefined> {
  const used = new Set(recent);
  const daily: DailyPuzzles = { easy: [], hard: [], challenge: [] };
  for (const tier of tiers) {
    for (const puzzle of reserve[tier]) {
      if (!isStoredPuzzle(puzzle) || used.has(puzzle.id)) continue;
      try {
        const board = new Chess(puzzle.fen);
        for (const move of puzzle.moves) play(board, move);
      } catch {
        continue;
      }
      used.add(puzzle.id);
      daily[tier].push(puzzle);
      if (daily[tier].length % 20 === 0) await Bun.sleep(0);
      if (daily[tier].length === DAILY[tier]) break;
    }
    if (daily[tier].length !== DAILY[tier]) return;
  }
  return daily;
}

export function startChessCache(directory: string) {
  let cache: Cache = { recent: [] };
  let checkedInProcess: string | undefined;
  const file = join(directory, 'lichess.json');
  async function refresh() {
    if (process.env.POLOGONY_LICHESS === 'off') return;
    const day = dayFormat.format(Date.now());
    if (checkedInProcess === day) return;
    checkedInProcess = day;
    try {
      await mkdir(directory, { recursive: true });
      const saved = Bun.file(file);
      if (!cache.daily && (await saved.exists())) {
        try {
          const stored = (await saved.json()) as Cache;
          if (
            Array.isArray(stored.recent) &&
            stored.recent.every((entry) => entry && Array.isArray(entry.ids)) &&
            tiers.every((tier) => {
              const daily = stored.daily?.[tier];
              return (
                daily?.length === DAILY[tier] &&
                daily.every(isStoredPuzzle) &&
                Array.isArray(stored.reserve?.[tier])
              );
            })
          )
            cache = stored;
        } catch {}
      }
      if (cache.checkedDay !== day) {
        try {
          const headers = new Headers();
          if (cache.etag) headers.set('If-None-Match', cache.etag);
          if (cache.modified) headers.set('If-Modified-Since', cache.modified);
          const response = await fetch(URL, { headers, signal: AbortSignal.timeout(600_000) });
          if (response.ok && response.body) {
            if (!Bun.which('zstd')) {
              await response.body.cancel();
              throw new Error('zstd is required to import the Lichess puzzle export');
            }
            const reserve = await importExport(response.body, directory);
            cache = {
              ...cache,
              reserve,
              etag: response.headers.get('etag') ?? undefined,
              modified: response.headers.get('last-modified') ?? undefined,
            };
          } else if (response.status !== 304) {
            await response.body?.cancel();
            throw new Error(`Lichess export returned HTTP ${response.status}`);
          }
        } catch (error) {
          console.warn('Lichess export refresh failed:', error);
        }
        const recent = cache.recent.slice(-30);
        if (cache.reserve && cache.rotationDay !== day) {
          const daily = await rotatePuzzles(
            cache.reserve,
            recent.flatMap((entry) => entry.ids),
          );
          if (daily) {
            const ids = tiers.flatMap((tier) => daily[tier].map(({ id }) => id));
            cache = { ...cache, daily, rotationDay: day, recent: [...recent, { day, ids }] };
          }
        }
        cache = { ...cache, checkedDay: day };
        if (cache.reserve && cache.daily) {
          const temporary = file + '.next';
          await Bun.write(temporary, JSON.stringify(cache));
          await rename(temporary, file);
        }
      }
    } catch (error) {
      console.warn('Lichess cache could not be updated:', error);
    }
  }
  let refreshing: Promise<void> | undefined;
  return {
    current: () => cache.daily,
    tick() {
      return (refreshing ??= refresh().finally(() => {
        refreshing = undefined;
      }));
    },
  };
}
