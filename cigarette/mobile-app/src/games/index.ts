import type { GameDefinition } from "./engine/types";
import { blocksGame } from "./blocks";
import { lanternGame } from "./lantern";
import { gemsGame } from "./gems";
import { starsGame } from "./stars";

export type { GameDefinition, GameEvent } from "./engine/types";

/** All games, in the order the game list shows them. */
export const GAMES: GameDefinition[] = [blocksGame, gemsGame, starsGame, lanternGame];

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}
