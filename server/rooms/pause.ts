import { addEvent, type Room } from './model';

export function eligibleVoters(room: Room) {
  return room.players.filter((player) => player.connected && !player.eliminated && !player.bot);
}

export function checkPause(room: Room, now: number): Room {
  const vote = room.pauseVote;
  if (!vote || room.pausedAt !== undefined) return room;
  if (now >= vote.expiresAt) return { ...room, pauseVote: undefined };
  const voters = eligibleVoters(room);
  const votes = voters.filter(({ id }) => vote.by.includes(id));
  if (votes.length <= voters.length / 2) return room;
  return addEvent(
    { ...room, pausedAt: now, pauseVote: undefined, version: room.version + 1 },
    { kind: 'paused' },
  );
}

export function voteToPause(room: Room, id: string, now: number): Room {
  if (room.pausedAt !== undefined || !eligibleVoters(room).some((player) => player.id === id))
    return room;
  const vote =
    room.pauseVote && now < room.pauseVote.expiresAt
      ? room.pauseVote
      : { by: [], expiresAt: now + 45_000 };
  if (vote.by.includes(id)) return room;
  return checkPause({ ...room, pauseVote: { ...vote, by: [...vote.by, id] } }, now);
}

export function resume(room: Room, now: number): Room {
  if (room.pausedAt === undefined) return room;
  const elapsed = now - room.pausedAt;
  const question = room.question;
  return addEvent(
    {
      ...room,
      pausedAt: undefined,
      version: room.version + 1,
      deadline: room.deadline! + elapsed,
      endsAt: room.endsAt! + elapsed,
      question:
        question?.chessStepAt === undefined
          ? question
          : { ...question, chessStepAt: question.chessStepAt + elapsed },
    },
    { kind: 'resumed' },
  );
}
