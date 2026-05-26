export type GamePhase = "idle" | "playing" | "over";

export interface Die {
  value: number;
  rolling: boolean;
}

export interface GameState {
  phase: GamePhase;
  target: number;
  dice: [Die, Die];
  score: number;
  streak: number;
  bestStreak: number;
  timeLeft: number;
  feedback: "hit" | "miss" | null;
}
