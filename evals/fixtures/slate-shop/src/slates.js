// src/slates.js
// Reads the day's game slate from a JSON file and lists its games.

import { readFileSync } from 'node:fs'

/** The games of one slate file, oldest tip-off first. */
export function listGames(path) {
  const slate = JSON.parse(readFileSync(path, 'utf8'))
  return [...slate.games].sort((a, b) => a.tipoff.localeCompare(b.tipoff))
}

/** One line per game: "AWAY at HOME, 7:00 PM". */
export function formatGame(game) {
  return `${game.away} at ${game.home}, ${game.tipof}`
}
