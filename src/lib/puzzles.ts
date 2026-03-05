export interface Puzzle {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  fen: string;
  solution: string[]; // List of SAN moves alternating, starting with player's move
  playerColor: "w" | "b";
}

export const PUZZLES: Puzzle[] = [
  {
    id: "1",
    title: "백랭크 메이트 1",
    difficulty: "Easy",
    fen: "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1",
    solution: ["Re8#"],
    playerColor: "w",
  },
  {
    id: "2",
    title: "스칼라 메이트",
    difficulty: "Easy",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    solution: ["Qxf7#"],
    playerColor: "w",
  },
  {
    id: "3",
    title: "백랭크 메이트 2",
    difficulty: "Medium",
    fen: "3r2k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1",
    solution: ["Re8+", "Rxe8", "Rxe8#"],
    playerColor: "w",
  },
];
