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
  
  // Teacher Mode States
  const [teacherMode, setTeacherMode] = useState(false);
  const [evaluation, setEvaluation] = useState<string>("0.0");
  const [bestMove, setBestMove] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

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

      // Parse evaluation
      if (msg.startsWith("info depth") && msg.includes("score")) {
        const scoreMatch = msg.match(/score (cp|mate) (-?\d+)/);
        if (scoreMatch) {
          const type = scoreMatch[1];
          const value = parseInt(scoreMatch[2]);
          
          // Adjust score for current side to move
          const displayScore = game.turn() === "w" ? value : -value;
          
          if (type === "cp") {
            setEvaluation((displayScore / 100).toFixed(1));
          } else if (type === "mate") {
            setEvaluation(`M${Math.abs(value)}`);
          }
        }
        
        const pvMatch = msg.match(/ pv (\w+)/);
        if (pvMatch) {
          setBestMove(pvMatch[1]);
        }
      }

      if (typeof msg === "string" && msg.startsWith("bestmove")) {
        const moveParts = msg.split(" ");
        const move = moveParts[1];
        if (move && move !== "(none)") {
          // If it's AI's turn, apply it
          if (game.turn() === "b") {
            applyAIMove(move);
          } else {
            // If it's player's turn (eval finished), just store it
            setBestMove(move);
          }
        }
        setIsThinking(false);
      }
    };

    worker.postMessage("uci");
    worker.postMessage("setoption name MultiPV value 1");

    return () => {
      worker.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]); // Need game to correctly orient evaluation

  const updateGameStatus = useCallback((g: Chess) => {
    // Reset teacher mode specific states on new move
    setShowHint(false);
    
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
      
      if (game.turn() === "b") {
        setGameStatus("AI가 생각 중...");
        setStatusType("thinking");
      }

      if (!engineReady) {
        pendingFenRef.current = fen;
        return;
      }

      setTimeout(() => {
        workerRef.current?.postMessage(`position fen ${fen}`);
        // If it's player's turn, we just want a quick evaluation
        const depth = game.turn() === "w" ? 10 : DEPTH_MAP[difficulty];
        workerRef.current?.postMessage(`go depth ${depth}`);
      }, 200);
    },
    [difficulty, engineReady, game],
  );

  useEffect(() => {
    // If teacher mode is toggled on during player's turn, request evaluation
    if (teacherMode && game.turn() === "w" && !isThinking) {
      requestAIMove(game.fen());
    }
  }, [teacherMode, game, isThinking, requestAIMove]);

  function handlePieceDrop({
    sourceSquare,
    targetSquare,
  }: {
    piece: { isSparePiece: boolean; position: string; pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    if (isThinking && game.turn() === "b" || game.isGameOver() || !targetSquare) return false;

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

      // Always request AI move/eval after player move
      requestAIMove(gameCopy.fen());
      
      if (gameCopy.isGameOver()) {
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
    setEvaluation("0.0");
    setBestMove(null);
    setShowHint(false);
    workerRef.current?.postMessage("ucinewgame");
    workerRef.current?.postMessage("isready");
  }

  // Custom styles for best move highlighting
  const customBoardSquareStyles: Record<string, React.CSSProperties> = {};
  if (showHint && bestMove) {
    const from = bestMove.substring(0, 2);
    const to = bestMove.substring(2, 4);
    customBoardSquareStyles[from] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
    customBoardSquareStyles[to] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
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
              allowDragging: (game.turn() === "w" || !isThinking) && !game.isGameOver(),
              boardStyle: {
                borderRadius: "12px",
                boxShadow: "0 8px 40px rgba(0, 0, 0, 0.5)",
              },
              darkSquareStyle: { backgroundColor: "#4a4a6a" },
              lightSquareStyle: { backgroundColor: "#8888a8" },
              squareStyles: customBoardSquareStyles,
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
          {/* Teacher Mode Panel */}
          <div className="glass-card panel-section" style={{ borderColor: teacherMode ? "var(--accent-primary)" : "var(--border-glass)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>👨‍🏫 선생님 모드</h3>
              <div 
                className={`btn ${teacherMode ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "4px 12px", fontSize: 11, minHeight: "auto" }}
                onClick={() => setTeacherMode(!teacherMode)}
              >
                {teacherMode ? "ON" : "OFF"}
              </div>
            </div>

            {teacherMode && (
              <div className="fade-in">
                <div style={{ 
                  background: "rgba(0,0,0,0.2)", 
                  borderRadius: 8, 
                  padding: "8px 12px", 
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>형세 분석</span>
                  <span style={{ 
                    fontSize: 16, 
                    fontWeight: 700, 
                    color: evaluation.startsWith("-") ? "var(--danger)" : "var(--success)" 
                  }}>
                    {evaluation.startsWith("M") ? evaluation : (parseFloat(evaluation) > 0 ? `+${evaluation}` : evaluation)}
                  </span>
                </div>

                <div className="controls-row">
                  <button 
                    className="btn" 
                    style={{ 
                      width: "100%", 
                      backgroundColor: showHint ? "var(--warning)" : "rgba(255,255,255,0.05)",
                      fontSize: 13,
                      border: "1px solid rgba(255,255,255,0.1)"
                    }}
                    onClick={() => setShowHint(!showHint)}
                    disabled={!bestMove}
                  >
                    💡 {showHint ? "힌트 숨기기" : "최선의 수 보기"}
                  </button>
                </div>
                {showHint && bestMove && (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
                    추천 수: {bestMove}
                  </p>
                )}
              </div>
            )}
          </div>

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
