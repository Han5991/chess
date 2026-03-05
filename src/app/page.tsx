"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import Link from "next/link";

type Difficulty = "beginner" | "easy" | "medium" | "hard" | "expert" | "master";

const DEPTH_MAP: Record<Difficulty, number> = {
  beginner: 1, // Depth 1: Very easy, often blunders
  easy: 3, // Depth 3: Still makes some mistakes
  medium: 5, // Depth 5: Intermediate level
  hard: 8, // Depth 8: Advanced level
  expert: 12, // Depth 12: Expert level
  master: 15, // Depth 15: Master level (slowest)
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "👶 초보자 (Depth 1)",
  easy: "🟢 쉬움 (Depth 3)",
  medium: "🟡 보통 (Depth 5)",
  hard: "🟠 어려움 (Depth 8)",
  expert: "🔴 전문가 (Depth 12)",
  master: "👑 마스터 (Depth 15)",
};

const PIECE_UNICODE: Record<string, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  K: "♔",
};

function getCapturedPieces(game: Chess, color: "w" | "b") {
  const initial: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const remaining: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };

  game.board().forEach((row) =>
    row.forEach((sq) => {
      if (sq && sq.color === color) {
        remaining[sq.type] = (remaining[sq.type] || 0) + 1;
      }
    }),
  );

  const captured: string[] = [];
  for (const piece of Object.keys(initial)) {
    const diff = initial[piece] - (remaining[piece] || 0);
    const symbol =
      color === "w" ? PIECE_UNICODE[piece.toUpperCase()] : PIECE_UNICODE[piece];
    for (let i = 0; i < diff; i++) captured.push(symbol);
  }
  return captured;
}

export default function ChessGame() {
  const [game, setGame] = useState(new Chess());
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [isThinking, setIsThinking] = useState(false);
  const [gameStatus, setGameStatus] = useState<string>("당신의 차례입니다");
  const [statusType, setStatusType] = useState<string>("your-turn");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [boardOrientation] = useState<"white" | "black">("white");
  const workerRef = useRef<Worker | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const pendingFenRef = useRef<string | null>(null);

  // Initialize Stockfish Worker
  useEffect(() => {
    const worker = new Worker(`/chess/stockfish.js`);
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as string;

      if (msg === "uciok") {
        worker.postMessage("isready");
      }

      if (msg === "readyok") {
        setEngineReady(true);
        // If there's a pending position, send it now
        if (pendingFenRef.current) {
          const fen = pendingFenRef.current;
          pendingFenRef.current = null;
          worker.postMessage(`position fen ${fen}`);
          worker.postMessage(`go depth ${DEPTH_MAP[difficulty]}`);
        }
      }

      if (typeof msg === "string" && msg.startsWith("bestmove")) {
        const bestMove = msg.split(" ")[1];
        if (bestMove && bestMove !== "(none)") {
          applyAIMove(bestMove);
        }
        setIsThinking(false);
      }
    };

    worker.postMessage("uci");

    return () => {
      worker.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateGameStatus = useCallback((g: Chess) => {
    if (g.isCheckmate()) {
      const winner = g.turn() === "w" ? "Black (AI)" : "White (You)";
      setGameStatus(`체크메이트! ${winner} 승리 🏆`);
      setStatusType("game-over");
    } else if (g.isStalemate()) {
      setGameStatus("스테일메이트 — 무승부");
      setStatusType("draw");
    } else if (g.isDraw()) {
      setGameStatus("무승부");
      setStatusType("draw");
    } else if (g.isCheck()) {
      setGameStatus(
        g.turn() === "w" ? "체크! 왕을 피하세요" : "AI가 생각 중...",
      );
      setStatusType(g.turn() === "w" ? "your-turn" : "thinking");
    } else {
      setGameStatus(g.turn() === "w" ? "당신의 차례입니다" : "AI가 생각 중...");
      setStatusType(g.turn() === "w" ? "your-turn" : "thinking");
    }
  }, []);

  const applyAIMove = useCallback(
    (moveStr: string) => {
      setGame((prevGame) => {
        const gameCopy = new Chess(prevGame.fen());
        const from = moveStr.substring(0, 2) as Square;
        const to = moveStr.substring(2, 4) as Square;
        const promotion = moveStr.length > 4 ? moveStr[4] : undefined;

        try {
          gameCopy.move({
            from,
            to,
            promotion: promotion as "q" | "r" | "b" | "n" | undefined,
          });
          setMoveHistory(gameCopy.history());
          updateGameStatus(gameCopy);
          return gameCopy;
        } catch {
          // If the move is invalid, just return previous state
          updateGameStatus(prevGame);
          return prevGame;
        }
      });
    },
    [updateGameStatus],
  );

  const requestAIMove = useCallback(
    (fen: string) => {
      if (!workerRef.current) return;
      setIsThinking(true);
      setGameStatus("AI가 생각 중...");
      setStatusType("thinking");

      if (!engineReady) {
        pendingFenRef.current = fen;
        return;
      }

      setTimeout(() => {
        workerRef.current?.postMessage(`position fen ${fen}`);
        workerRef.current?.postMessage(`go depth ${DEPTH_MAP[difficulty]}`);
      }, 200);
    },
    [difficulty, engineReady],
  );

  function handlePieceDrop({
    sourceSquare,
    targetSquare,
  }: {
    piece: { isSparePiece: boolean; position: string; pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    if (isThinking || game.isGameOver() || !targetSquare) return false;

    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: "q",
      });
      if (!move) return false;

      setGame(gameCopy);
      setMoveHistory(gameCopy.history());

      if (!gameCopy.isGameOver()) {
        requestAIMove(gameCopy.fen());
      } else {
        updateGameStatus(gameCopy);
      }
      return true;
    } catch {
      return false;
    }
  }

  function resetGame() {
    const newGame = new Chess();
    setGame(newGame);
    setMoveHistory([]);
    setIsThinking(false);
    setGameStatus("당신의 차례입니다");
    setStatusType("your-turn");
    workerRef.current?.postMessage("ucinewgame");
    workerRef.current?.postMessage("isready");
  }

  // Move pairs for display
  const movePairs: { num: number; white: string; black?: string }[] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1],
    });
  }

  const capturedByBlack = getCapturedPieces(game, "w"); // white pieces captured by black
  const capturedByWhite = getCapturedPieces(game, "b"); // black pieces captured by white

  return (
    <div className="app-container fade-in">
      {/* Header */}
      <div className="game-header">
        <h1>♟ AI Chess</h1>
        <p>Stockfish 18 · Lite Engine · 브라우저에서 바로 대결</p>
        <div style={{ marginTop: 8 }}>
          <Link
            href="/puzzle"
            className="btn"
            style={{
              display: "inline-block",
              padding: "6px 16px",
              fontSize: 13,
              backgroundColor: "rgba(255,255,255,0.1)",
            }}
          >
            🧩 퍼즐 모드 플레이
          </Link>
        </div>
      </div>

      {/* Status Bar */}
      <div className={`status-bar status-${statusType}`}>
        {isThinking && <div className="spinner" />}
        <span>{gameStatus}</span>
      </div>

      {/* Game Layout */}
      <div className="game-layout">
        {/* Board */}
        <div className="board-wrapper">
          {/* AI's captured pieces (shown above board) */}
          <div
            className="captured-pieces"
            style={{ marginBottom: 6, minHeight: 24 }}
          >
            {capturedByBlack.map((p, i) => (
              <span key={i}>{p}</span>
            ))}
          </div>

          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: handlePieceDrop,
              boardOrientation: boardOrientation,
              animationDurationInMs: 250,
              allowDragging: !isThinking && !game.isGameOver(),
              boardStyle: {
                borderRadius: "12px",
                boxShadow: "0 8px 40px rgba(0, 0, 0, 0.5)",
              },
              darkSquareStyle: { backgroundColor: "#4a4a6a" },
              lightSquareStyle: { backgroundColor: "#8888a8" },
            }}
          />

          {/* Player's captured pieces (shown below board) */}
          <div className="captured-pieces" style={{ marginTop: 6 }}>
            {capturedByWhite.map((p, i) => (
              <span key={i}>{p}</span>
            ))}
          </div>
        </div>

        {/* Side Panel */}
        <div className="side-panel">
          {/* Controls */}
          <div className="glass-card panel-section">
            <h3>Controls</h3>
            <div className="controls-row">
              <button
                className="btn btn-primary"
                onClick={resetGame}
                id="new-game-btn"
              >
                ♻ 새 게임
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                AI 난이도
              </label>
              <div className="select-wrapper">
                <select
                  id="difficulty-select"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Move History */}
          <div className="glass-card panel-section">
            <h3>기보 (Move History)</h3>
            <div className="move-history">
              {movePairs.length === 0 ? (
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 13,
                    textAlign: "center",
                    padding: "8px 0",
                  }}
                >
                  기물을 드래그해서 시작하세요
                </p>
              ) : (
                movePairs.map((pair) => (
                  <div key={pair.num} className="move-pair">
                    <span className="move-number">{pair.num}.</span>
                    <span className="move-white">{pair.white}</span>
                    {pair.black && (
                      <span className="move-black">{pair.black}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
