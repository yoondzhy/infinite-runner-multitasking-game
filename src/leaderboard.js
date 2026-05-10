// @ts-nocheck
import { writable, get } from "svelte/store";

const STORAGE_KEY = "neuro_leaderboard";

export const leaderboard = writable([]);
export const playerName = writable("");
export const hasSubmitted = writable(false);

// Load leaderboard
export function loadLeaderboard() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    leaderboard.set(stored);
  } catch {
    leaderboard.set([]);
  }
}

// Save leaderboard to storage
export function commitLeaderboard() {
  const board = get(leaderboard);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
}

// Save score
export function saveScore(score) {
  if (get(hasSubmitted)) return;

  let name = get(playerName).trim() || "Anonymous";
  const board = [...get(leaderboard)];

  const index = board.findIndex(
    entry => entry.name.toLowerCase() === name.toLowerCase()
  );

  if (index !== -1) {
    if (score > board[index].score) {
      board[index].score = score;
    }
  } else {
    board.push({ name, score });
  }

  board.sort((a, b) => b.score - a.score);

  leaderboard.set(board);
  commitLeaderboard();
  hasSubmitted.set(true);
}