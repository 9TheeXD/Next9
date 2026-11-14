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

export type { GameDefinition, GameEvent } from "./engine/types";

/** All games, in the order the game list shows them. */
export const GAMES: GameDefinition[] = [blocksGame, blastGame, mergeGame, tilesGame, sliceGame, bubblesGame, gemsGame, starsGame, sudokuGame, lanternGame];

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}
