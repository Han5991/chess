"use client";

import { useState, useCallback } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import Link from "next/link";
import { PUZZLES } from "@/lib/puzzles";

export default function PuzzleGame() {
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const puzzle = PUZZLES[currentPuzzleIndex];

  const [game, setGame] = useState(new Chess(puzzle.fen));
  const [moveIndex, setMoveIndex] = useState(0); // tracks progress in solution array
  const [gameStatus, setGameStatus] = useState<string>("퍼즐을 풀어보세요!");
  const [statusType, setStatusType] = useState<string>("your-turn");
  const [isSolved, setIsSolved] = useState(false);

  const boardOrientation = puzzle.playerColor === "w" ? "white" : "black";

  const updateGameStatus = useCallback(
    (g: Chess, solved: boolean, wrong: boolean = false) => {
      if (solved) {
        setGameStatus("정답입니다! 🎉");
        setStatusType("game-over");
        setIsSolved(true);
      } else if (wrong) {
        setGameStatus("오답입니다. 다시 시도해 보세요.");
        setStatusType("thinking");
      } else if (g.isCheck()) {
        setGameStatus("체크!");
        setStatusType("your-turn");
      } else {
        setGameStatus("당신의 차례입니다");
        setStatusType("your-turn");
      }
    },
    [],
  );

  function handlePieceDrop({
    sourceSquare,
    targetSquare,
  }: {
    piece: { isSparePiece: boolean; position: string; pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    if (isSolved || !targetSquare) return false;

    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: "q",
      });
      if (!move) return false;

      // Check if move matches solution
      const expectedMoveSan = puzzle.solution[moveIndex];
      // Move object contains exactly what we need, but string comparison might fail
      // if one has '+' and another doesn't, though chess.js generates standard SAN.
      if (move.san === expectedMoveSan) {
        setGame(gameCopy);
        setMoveIndex(moveIndex + 1);

        // Check if puzzle solved completely
        if (moveIndex + 1 === puzzle.solution.length) {
          updateGameStatus(gameCopy, true);
        } else {
          // It's AI's turn (next move in solution)
          setGameStatus("상대의 수 대응 중...");
          setStatusType("thinking");

          setTimeout(() => {
            const aiMoveSan = puzzle.solution[moveIndex + 1];
            const aiGameCopy = new Chess(gameCopy.fen());
            aiGameCopy.move(aiMoveSan);
            setGame(aiGameCopy);
            setMoveIndex(moveIndex + 2);

            if (moveIndex + 2 === puzzle.solution.length) {
              updateGameStatus(aiGameCopy, true);
            } else {
              updateGameStatus(aiGameCopy, false);
            }
          }, 500); // Small delay for realism
        }
        return true;
      } else {
        // Wrong move
        updateGameStatus(game, false, true);
        // We return false to snap the piece back
        return false;
      }
    } catch {
      return false;
    }
  }

  function handleHint() {
    if (isSolved) return;
    const expectedMoveSan = puzzle.solution[moveIndex];
    setGameStatus(`힌트: 다음 추천 수는 ${expectedMoveSan} 입니다.`);
  }

  function handleRetry() {
    setGame(new Chess(puzzle.fen));
    setMoveIndex(0);
    setIsSolved(false);
    updateGameStatus(new Chess(puzzle.fen), false);
  }

  function nextPuzzle() {
    if (currentPuzzleIndex < PUZZLES.length - 1) {
      const nextIdx = currentPuzzleIndex + 1;
      setCurrentPuzzleIndex(nextIdx);
      const nextPuzzle = PUZZLES[nextIdx];
      setGame(new Chess(nextPuzzle.fen));
      setMoveIndex(0);
      setIsSolved(false);
      setGameStatus("퍼즐을 풀어보세요!");
      setStatusType("your-turn");
    } else {
      setGameStatus("모든 퍼즐을 완료했습니다! 🏆");
      setStatusType("game-over");
    }
  }

  return (
    <div className="app-container fade-in">
      {/* Header */}
      <div className="game-header">
        <h1>🧩 AI Chess - 퍼즐 모드</h1>
        <p>주어진 상황에서 최선의 수를 찾아 메이트를 만드세요.</p>
      </div>

      {/* Status Bar */}
      <div className={`status-bar status-${statusType}`}>
        <span>{gameStatus}</span>
      </div>

      {/* Game Layout */}
      <div className="game-layout">
        {/* Board */}
        <div className="board-wrapper">
          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: handlePieceDrop,
              boardOrientation: boardOrientation,
              animationDurationInMs: 250,
              allowDragging: !isSolved,
              boardStyle: {
                borderRadius: "12px",
                boxShadow: "0 8px 40px rgba(0, 0, 0, 0.5)",
              },
              darkSquareStyle: { backgroundColor: "#4a4a6a" },
              lightSquareStyle: { backgroundColor: "#8888a8" },
            }}
          />
        </div>

        {/* Side Panel */}
        <div className="side-panel">
          <div className="glass-card panel-section">
            <h3>방향키 / 설정</h3>

            <div style={{ marginBottom: 16 }}>
              <strong>현재 퍼즐:</strong> {puzzle.title} <br />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                난이도: {puzzle.difficulty}
              </span>
            </div>

            <div className="controls-row">
              <button
                className="btn"
                style={{ backgroundColor: "#3a3a5a" }}
                onClick={handleHint}
              >
                💡 힌트
              </button>
              <button
                className="btn"
                style={{ backgroundColor: "#e67e22" }}
                onClick={handleRetry}
              >
                ↩️ 재시도
              </button>
            </div>

            {isSolved && currentPuzzleIndex < PUZZLES.length - 1 && (
              <div style={{ marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  onClick={nextPuzzle}
                  style={{ width: "100%" }}
                >
                  다음 퍼즐 ➡️
                </button>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <Link href="/">
                <button
                  className="btn"
                  style={{
                    width: "100%",
                    backgroundColor: "transparent",
                    border: "1px solid #5a5a7a",
                  }}
                >
                  🏠 메인 게임으로 돌아가기
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
