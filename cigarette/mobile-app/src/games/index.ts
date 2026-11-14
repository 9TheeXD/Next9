import type { GameDefinition } from "./engine/types";
import { blocksGame } from "./blocks";
import { lanternGame } from "./lantern";
import { gemsGame } from "./gems";
import { starsGame } from "./stars";
import { blastGame } from "./blast";
import { mergeGame } from "./merge";
import { tilesGame } from "./tiles";
import { sliceGame } from "./slice";
import { bubblesGame } from "./bubbles";
import { sudokuGame } from "./sudoku";
import { shooterGame } from "./shooter";
import { snakeGame } from "./snake";
import { defenseGame } from "./defense";
import { chessGame } from "./chess";
import { xoGame } from "./xo";
import { pulseGame } from "./pulse";
import { partyGame } from "./party";
import { connect4Game } from "./connect4";
import { othelloGame } from "./othello";
import { checkersGame } from "./checkers";
import { dotsGame } from "./dots";
import { hockeyGame } from "./hockey";

export type { GameDefinition, GameEvent } from "./engine/types";

/** All games, in the order the game list shows them. */
export const GAMES: GameDefinition[] = [
  blocksGame, shooterGame, partyGame, pulseGame, chessGame, mergeGame, snakeGame, hockeyGame, xoGame, blastGame,
  defenseGame, connect4Game, tilesGame, dotsGame, sliceGame, checkersGame, bubblesGame, othelloGame, gemsGame,
  starsGame, sudokuGame, lanternGame,
];

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}
