// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward from a
// fresh world for a fixed number of steps, steered by a simple autopilot (an aim policy that
// sweeps the halo toward the nearest, most valuable gloom it can reach in time), so the frame is
// what a short game really looks like and the same seed always gives the same frame.
import { BEAM, CORE, STEP } from './config.js';
import { angleDiff } from './random.js';
import { EVENT_OVER, KIND_GILDED, KIND_HUSK } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const LATE_SECONDS = 70;
const END_LIMIT_SECONDS = 900;
/**
 * How far ahead, in seconds, the autopilot gives a wisp to reach the core: the play scene's pilot
 * looks well ahead and keeps all its embers; the end scene's looks only a moment ahead, so it is
 * caught out once the gloom speeds up, as a hurried player is.
 */
const HORIZON_PLAY = 2.6;
const HORIZON_END = 0.9;

const WISDOM = { [KIND_GILDED]: 3, [KIND_HUSK]: 2 };

/**
 * The autopilot's aim: weigh every wisp by its value and its urgency (how soon it reaches the
 * core) and pick the best one the beam can reach in time; otherwise hold the beam on the most
 * urgent wisp anywhere.
 */
function autopilot(state, horizon) {
  const wisps = state.wisps;
  let best = null;
  let bestScore = -Infinity;
  for (let index = 0; index < wisps.length; index += 1) {
    const wisp = wisps[index];
    if (!wisp.active) continue;
    const dx = wisp.x - CORE.x;
    const dy = wisp.y - CORE.y;
    const angle = Math.atan2(dy, dx);
    const turn = Math.abs(angleDiff(angle, state.beamAngle)) / BEAM.turnSpeed;
    const approach = (Math.hypot(dx, dy) - CORE.radius - wisp.radius) / Math.max(wisp.speed, 1);
    if (turn > approach) continue; // it cannot be reached before it lands
    const urgency = Math.max(0, horizon - approach);
    const value = wisp.kind === KIND_GILDED ? WISDOM[KIND_GILDED] : wisp.kind === KIND_HUSK ? WISDOM[KIND_HUSK] : 1;
    const score = urgency * 3 + value;
    if (score > bestScore) {
      bestScore = score;
      best = angle;
    }
  }
  if (best !== null) return best;
  let nearest = null;
  let nearestDist = Infinity;
  for (let index = 0; index < wisps.length; index += 1) {
    const wisp = wisps[index];
    if (!wisp.active) continue;
    const dist = Math.hypot(wisp.x - CORE.x, wisp.y - CORE.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = Math.atan2(wisp.y - CORE.y, wisp.x - CORE.x);
    }
  }
  return nearest ?? state.beamAngle;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end' && name !== 'late') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, 0, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'late' ? LATE_SECONDS : PLAY_SECONDS;
  const horizon = name === 'end' ? HORIZON_END : HORIZON_PLAY;
  for (let index = 0; index < limit / STEP; index += 1) {
    if (world.step(STEP, 0, autopilot(world.state, horizon), false) & EVENT_OVER) break;
  }
  const over = world.state.health === 0;
  if (over) { world.state.flash = 0; world.state.shake = 0; }
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
