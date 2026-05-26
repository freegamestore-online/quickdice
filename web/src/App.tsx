import {
  GameShell,
  GameTopbar,
  GameAuth,
  GameButton,
  useGameSounds,
  useLeaderboard,
} from "@freegamestore/games";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHighScore } from "./hooks/useHighScore";
import type { GamePhase } from "./types";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const GAME_DURATION = 60; // seconds
const ROLL_DURATION = 600; // ms — dice tumble time
const ROLL_FRAMES = 8; // number of intermediate faces shown
const FEEDBACK_DURATION = 700; // ms — hit/miss flash

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Random die face 1-6 */
function rollFace(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Generate a target sum (2-12) weighted toward the middle for fairness */
function nextTarget(): number {
  // Roll two virtual dice for natural bell-curve distribution
  return rollFace() + rollFace();
}

/* ------------------------------------------------------------------ */
/*  Dice face SVG patterns (pip positions)                             */
/* ------------------------------------------------------------------ */

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 25],
    [75, 25],
    [25, 50],
    [75, 50],
    [25, 75],
    [75, 75],
  ],
};

function DieFace({
  value,
  rolling,
  size = 100,
  highlight,
}: {
  value: number;
  rolling: boolean;
  size?: number;
  highlight?: "hit" | "miss" | null;
}) {
  const pips = PIP_POSITIONS[value] ?? PIP_POSITIONS[1]!;
  const borderColor =
    highlight === "hit"
      ? "var(--success)"
      : highlight === "miss"
        ? "var(--error)"
        : "var(--line-strong)";
  const shadowColor =
    highlight === "hit"
      ? "rgba(22, 163, 74, 0.5)"
      : highlight === "miss"
        ? "rgba(220, 38, 38, 0.4)"
        : "rgba(139, 92, 246, 0.3)";

  return (
    <div
      className="relative inline-block"
      style={{
        width: size,
        height: size,
        transition: "transform 0.1s ease",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={rolling ? "animate-dice-tumble" : ""}
        style={{
          filter: `drop-shadow(0 4px 12px ${shadowColor})`,
          transition: "filter 0.3s ease",
        }}
      >
        <rect
          x="2"
          y="2"
          width="96"
          height="96"
          rx="16"
          ry="16"
          fill="var(--panel)"
          stroke={borderColor}
          strokeWidth="3"
          style={{ transition: "stroke 0.2s ease" }}
        />
        {pips.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="9"
            fill="var(--ink)"
            style={{
              opacity: rolling ? 0.4 : 1,
              transition: "opacity 0.15s ease",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main App                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [die1, setDie1] = useState(1);
  const [die2, setDie2] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [target, setTarget] = useState(() => nextTarget());
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [feedback, setFeedback] = useState<"hit" | "miss" | null>(null);
  const [highScore, updateHighScore] = useHighScore("quickdice-high");

  const sounds = useGameSounds();
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;

  const { submitScore } = useLeaderboard("quickdice");
  const submittedRef = useRef(false);

  const scoreRef = useRef(score);
  scoreRef.current = score;

  const streakRef = useRef(streak);
  streakRef.current = streak;

  const bestStreakRef = useRef(bestStreak);
  bestStreakRef.current = bestStreak;

  const targetRef = useRef(target);
  targetRef.current = target;

  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  /* ---- Timer countdown ---- */
  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      setPhase("over");
      soundsRef.current.playGameOver();
      return;
    }
    const id = setInterval(() => {
      setTimeLeft((t) => {
        const next = t - 1;
        if (next <= 5 && next > 0) soundsRef.current.playTick();
        if (next <= 0) {
          setPhase("over");
          soundsRef.current.playGameOver();
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, timeLeft]);

  /* ---- Submit score on game over ---- */
  useEffect(() => {
    if (phase === "over" && !submittedRef.current) {
      submittedRef.current = true;
      updateHighScore(scoreRef.current);
      submitScore(scoreRef.current);
    }
    if (phase !== "over") {
      submittedRef.current = false;
    }
  }, [phase, submitScore, updateHighScore]);

  /* ---- Cleanup timers on unmount ---- */
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
    };
  }, []);

  /* ---- Start game ---- */
  const startGame = useCallback(() => {
    setPhase("playing");
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setTimeLeft(GAME_DURATION);
    setTarget(nextTarget());
    setDie1(1);
    setDie2(1);
    setRolling(false);
    setFeedback(null);
    soundsRef.current.playLevelUp();
  }, []);

  /* ---- Roll dice ---- */
  const rollDice = useCallback(() => {
    if (rolling) return;
    if (phase !== "playing") return;

    setRolling(true);
    setFeedback(null);
    soundsRef.current.playMove();

    // Animate intermediate faces
    let frameCount = 0;
    rollIntervalRef.current = setInterval(() => {
      setDie1(rollFace());
      setDie2(rollFace());
      frameCount++;
      if (frameCount >= ROLL_FRAMES) {
        if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      }
    }, ROLL_DURATION / ROLL_FRAMES);

    // Capture target at roll time (before it changes)
    const currentTarget = targetRef.current;

    // Resolve after animation
    rollTimerRef.current = setTimeout(() => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);

      const final1 = rollFace();
      const final2 = rollFace();
      setDie1(final1);
      setDie2(final2);
      setRolling(false);

      const sum = final1 + final2;
      const isHit = sum === currentTarget;

      if (isHit) {
        const currentStreak = streakRef.current + 1;
        // Streak bonus: 1x for first, 2x for second consecutive, etc.
        const points = currentStreak;
        setScore((s) => s + points);
        setStreak(currentStreak);
        if (currentStreak > bestStreakRef.current) {
          setBestStreak(currentStreak);
        }
        setFeedback("hit");
        if (currentStreak >= 3) {
          soundsRef.current.playClear();
        } else {
          soundsRef.current.playScore();
        }
      } else {
        setStreak(0);
        setFeedback("miss");
        soundsRef.current.playError();
      }

      // Set new target
      setTarget(nextTarget());

      // Clear feedback after delay
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
      }, FEEDBACK_DURATION);
    }, ROLL_DURATION);
  }, [rolling, phase]);

  /* ---- Keyboard: space/enter to roll or start ---- */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (phase === "idle") {
          startGame();
        } else if (phase === "playing") {
          rollDice();
        } else if (phase === "over") {
          startGame();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, rollDice, startGame]);

  /* ---- Format time MM:SS ---- */
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  /* ---- Topbar stats ---- */
  const topbarStats =
    phase === "playing" || phase === "over"
      ? [
          { label: "Score", value: score, accent: true },
          { label: "Streak", value: streak },
          { label: "Time", value: formatTime(timeLeft) },
        ]
      : undefined;

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Quick Dice"
          stats={topbarStats}
          score={phase === "idle" ? 0 : undefined}
          rules={
            <div>
              <h3
                style={{
                  marginBottom: "0.5rem",
                  fontWeight: 700,
                  fontFamily: "Fraunces, serif",
                }}
              >
                Quick Dice
              </h3>
              <p>Roll two dice and try to hit the target sum!</p>
              <h4 style={{ marginTop: "0.75rem", fontWeight: 600 }}>
                How to play
              </h4>
              <ul style={{ paddingLeft: "1.2rem", marginTop: "0.25rem" }}>
                <li>Each round shows a target number (2-12)</li>
                <li>Tap the dice or press Space to roll</li>
                <li>If your dice sum matches the target, you score!</li>
                <li>Consecutive hits build a streak for bonus points</li>
              </ul>
              <h4 style={{ marginTop: "0.75rem", fontWeight: 600 }}>
                Scoring
              </h4>
              <ul style={{ paddingLeft: "1.2rem", marginTop: "0.25rem" }}>
                <li>1st hit in a row: 1 point</li>
                <li>2nd consecutive hit: 2 points</li>
                <li>3rd consecutive hit: 3 points</li>
                <li>...and so on! Misses reset the streak.</li>
              </ul>
              <h4 style={{ marginTop: "0.75rem", fontWeight: 600 }}>
                Timer
              </h4>
              <p style={{ marginTop: "0.25rem" }}>
                You have 60 seconds. Roll as many targets as you can!
              </p>
            </div>
          }
          onRestart={phase !== "idle" ? startGame : undefined}
          actions={<GameAuth />}
        />
      }
    >
      {/* ---- Idle screen ---- */}
      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center h-full gap-6 px-4">
          <h1
            className="text-4xl font-bold"
            style={{ fontFamily: "Fraunces, serif", color: "var(--accent)" }}
          >
            Quick Dice
          </h1>
          <p
            className="text-center max-w-xs"
            style={{ color: "var(--muted)" }}
          >
            Roll the dice to hit target numbers. Build streaks for bonus points.
            60 seconds on the clock!
          </p>

          {/* Decorative dice */}
          <div className="flex gap-4 my-2">
            <DieFace value={5} rolling={false} size={80} />
            <DieFace value={6} rolling={false} size={80} />
          </div>

          <GameButton variant="primary" size="lg" onClick={startGame}>
            Start Game
          </GameButton>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            or press Space
          </p>
        </div>
      )}

      {/* ---- Playing screen ---- */}
      {phase === "playing" && (
        <div className="flex flex-col items-center justify-center h-full gap-5 px-4">
          {/* Target display */}
          <div className="text-center">
            <p
              className="text-sm font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--muted)" }}
            >
              Target
            </p>
            <div
              className="text-6xl font-bold"
              style={{
                fontFamily: "Fraunces, serif",
                color: "var(--accent)",
                textShadow: "0 0 24px rgba(139, 92, 246, 0.4)",
              }}
            >
              {target}
            </div>
          </div>

          {/* Feedback flash */}
          <div className="h-8 flex items-center justify-center">
            {feedback === "hit" && (
              <div
                className="animate-feedback-in text-lg font-bold"
                style={{ color: "var(--success)" }}
              >
                {streak >= 3
                  ? `${streak}x Streak! +${streak}`
                  : streak === 2
                    ? `Double! +${streak}`
                    : "+1"}
              </div>
            )}
            {feedback === "miss" && (
              <div
                className="animate-feedback-in text-lg font-bold"
                style={{ color: "var(--error)" }}
              >
                Miss!
              </div>
            )}
          </div>

          {/* Dice */}
          <button
            onClick={rollDice}
            disabled={rolling}
            className="flex gap-5 items-center justify-center cursor-pointer disabled:cursor-not-allowed p-4 rounded-2xl transition-colors"
            style={{
              background: rolling ? "transparent" : "var(--accent-soft)",
              border: "none",
              outline: "none",
              WebkitTapHighlightColor: "transparent",
            }}
            aria-label="Roll dice"
          >
            <DieFace
              value={die1}
              rolling={rolling}
              size={90}
              highlight={feedback}
            />
            <DieFace
              value={die2}
              rolling={rolling}
              size={90}
              highlight={feedback}
            />
          </button>

          {/* Sum display */}
          {!rolling && (
            <p
              className="text-sm font-medium"
              style={{ color: "var(--muted)" }}
            >
              Sum: {die1 + die2}
            </p>
          )}

          {/* Roll prompt */}
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {rolling ? "Rolling..." : "Tap dice or press Space to roll"}
          </p>

          {/* Timer bar */}
          <div
            className="w-full max-w-xs rounded-full overflow-hidden"
            style={{
              height: 6,
              background: "var(--line)",
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${(timeLeft / GAME_DURATION) * 100}%`,
                background:
                  timeLeft <= 10
                    ? "var(--error)"
                    : timeLeft <= 20
                      ? "var(--warning)"
                      : "var(--accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* ---- Game over screen ---- */}
      {phase === "over" && (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
          <h2
            className="text-3xl font-bold"
            style={{ fontFamily: "Fraunces, serif", color: "var(--accent)" }}
          >
            Game Over!
          </h2>

          <div
            className="text-6xl font-bold"
            style={{ fontFamily: "Fraunces, serif", color: "var(--ink)" }}
          >
            {score}
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            points
          </p>

          {score > 0 && score >= highScore && (
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--success)" }}
            >
              New high score!
            </p>
          )}
          {score < highScore && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              High score: {highScore}
            </p>
          )}

          <p style={{ color: "var(--muted)" }}>
            Best streak:{" "}
            <span className="font-bold" style={{ color: "var(--accent)" }}>
              {bestStreak}x
            </span>
          </p>

          <GameButton variant="primary" size="lg" onClick={startGame}>
            Play Again
          </GameButton>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            or press Space
          </p>
        </div>
      )}

      {/* ---- CSS Animations (injected via style tag) ---- */}
      <style>{`
        @keyframes dice-tumble {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(90deg) scale(1.1); }
          50% { transform: rotate(180deg) scale(1); }
          75% { transform: rotate(270deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .animate-dice-tumble {
          animation: dice-tumble 600ms ease-in-out;
        }
        @keyframes feedback-in {
          0% { opacity: 0; transform: translateY(8px) scale(0.9); }
          50% { opacity: 1; transform: translateY(-2px) scale(1.05); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-feedback-in {
          animation: feedback-in 0.3s ease-out;
        }
      `}</style>
    </GameShell>
  );
}
