import type { ChessPuzzle, Mark, QuestionCopy } from '../../shared/game';

export type ChessStage = {
  position: string;
  options: string[];
  correct: number;
  accepted?: number[];
  reply?: string;
};

export type Question = QuestionCopy & {
  english: QuestionCopy & { explanation: string };
  correct: number;
  explanation: string;
  n?: number;
  mark: Mark;
  mystery?: true;
  chess?: ChessPuzzle;
  chessStages?: ChessStage[];
  lichessId?: string;
  chessLine?: {
    reply: string;
    position: string;
    options: string[];
    correct: number;
  };
};
