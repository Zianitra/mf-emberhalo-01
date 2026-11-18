// The game's rules and state, with no drawing and no browser in it: the lantern core, the
// sweeping halo beam, the pool of gloom wisps, particles, spawning, collisions, combo, score,
// health and surge level. step() advances one fixed step and returns what happened as bit flags,
// so the caller can react without the world knowing about screens or sound. Nothing here
// allocates after createWorld returns.
import { BEAM, COMBO, CORE, LEVEL, POOL_SIZE, WISP } from './config.js';
import { angleDiff } from './random.js';

export const KIND_BASE = 0;
export const KIND_GILDED = 1;
export const KIND_HUSK = 2;

export const EVENT_BANISH = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_SURGE = 8;

export const MAX_PARTICLES = 320;

/** Is a wisp inside the beam's wedge: within its ring band and its arc? */
function overlapsBeam(wisp, beamAngle, beamLength) {
  const dx = wisp.x - CORE.x;
  const dy = wisp.y - CORE.y;
  const dist = Math.hypot(dx, dy);
  if (dist + wisp.radius < BEAM.inner || dist - wisp.radius > beamLength) return false;
  return Math.abs(angleDiff(Math.atan2(dy, dx), beamAngle)) < BEAM.halfArc + Math.atan2(wisp.radius, Math.max(dist, 1));
}

export function createWorld(random) {
  const wisps = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    wisps.push({ active: false, kind: KIND_BASE, x: 0, y: 0, radius: 0, hp: 0, speed: 0, angle: 0, seed: 0 });
  }
  const particles = [];
  for (let index = 0; index < MAX_PARTICLES; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#fff', size: 2, glow: false });
  }
  const state = {
    wisps, particles, beamAngle: -Math.PI / 2, score: 0, health: CORE.hp,
    combo: 0, comboTimer: 0, level: 1, elapsed: 0, spawnTimer: 1.0,
    shake: 0, flash: 0, coreHitAt: -9, banished: 0, comboText: { text: '', life: 0, value: 0 },
    beamHeat: 0,
  };

  function burst(x, y, color, count, speed, glow) {
    for (let index = 0; index < count; index += 1) {
      let particle = null;
      for (let scan = 0; scan < particles.length; scan += 1) {
        if (!particles[scan].active) { particle = particles[scan]; break; }
      }
      if (particle === null) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * v;
      particle.vy = Math.sin(angle) * v;
      particle.life = particle.maxLife = 0.35 + random() * 0.5;
      particle.color = color;
      particle.size = 2 + random() * 3;
      particle.glow = glow;
    }
  }

  function freeWisp() {
    for (let index = 0; index < wisps.length; index += 1) if (!wisps[index].active) return wisps[index];
    return null;
  }

  function pickKind(level) {
    const roll = random();
    if (level >= 4 && roll < 0.12 + level * 0.01) return KIND_HUSK;
    if (level >= 2 && roll < 0.35) return KIND_GILDED;
    return KIND_BASE;
  }

  function spawnWisp(level) {
    const wisp = freeWisp();
    if (wisp === null) return;
    const kind = pickKind(level);
    const spec = kind === KIND_GILDED ? WISP.gilded : kind === KIND_HUSK ? WISP.husk : WISP.base;
    wisp.active = true;
    wisp.kind = kind;
    wisp.radius = spec.radius;
    wisp.hp = spec.hp;
    wisp.speed = spec.speed + WISP.speedPerLevel * (level - 1) * (kind === KIND_HUSK ? 0.6 : 1);
    wisp.seed = random() * Math.PI * 2;
    const angle = random() * Math.PI * 2;
    wisp.angle = angle;
    const distance = WISP.spawnRadius + random() * 160;
    wisp.x = CORE.x + Math.cos(angle) * distance;
    wisp.y = CORE.y + Math.sin(angle) * distance;
  }

  function comboString(value) {
    return value >= COMBO.max ? 'MAX COMBO x' + value : 'COMBO x' + value;
  }

  function reset() {
    for (const wisp of wisps) wisp.active = false;
    for (const particle of particles) particle.active = false;
    state.beamAngle = -Math.PI / 2;
    state.score = 0;
    state.health = CORE.hp;
    state.combo = 0;
    state.comboTimer = 0;
    state.level = 1;
    state.elapsed = 0;
    state.spawnTimer = 1.0;
    state.shake = 0;
    state.flash = 0;
    state.coreHitAt = -9;
    state.banished = 0;
    state.comboText.life = 0;
    state.beamHeat = 0;
  }

  /**
   * One fixed step. `steer` is -1, 0 or 1 (left, still, right) from the keys; `target` is the
   * beam angle the pointer asks for, or null when the pointer has not moved. With `harmless` set
   * (the title screen's backdrop) wisps drift but nothing is banished and nothing scores.
   */
  function step(dt, steer, target, harmless) {
    let events = 0;
    state.elapsed += dt;
    const level = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));
    if (level !== state.level) {
      state.level = level;
      events |= EVENT_SURGE;
    }

    // Steer the halo beam. The keys turn it; the pointer, when it has moved lately, is chased.
    if (target !== null) {
      const diff = angleDiff(target, state.beamAngle);
      const maxTurn = BEAM.trackSpeed * dt;
      state.beamAngle += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
    } else if (steer !== 0) {
      state.beamAngle += steer * BEAM.turnSpeed * dt;
    }

    state.beamHeat = Math.max(0, state.beamHeat - dt * 2.5);
    state.shake = Math.max(0, state.shake - dt * 14);
    state.flash = Math.max(0, state.flash - dt * 3);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (state.comboText.life > 0) state.comboText.life -= dt;

    // Spawn gloom faster each surge.
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnWisp(state.level);
      const interval = Math.max(WISP.minInterval, WISP.spawnInterval * WISP.spawnScale ** (state.level - 1));
      state.spawnTimer += interval * (0.75 + random() * 0.5);
    }

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) { particle.active = false; continue; }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - 2.4 * dt;
      particle.vy *= 1 - 2.4 * dt;
    }

    for (let index = 0; index < wisps.length; index += 1) {
      const wisp = wisps[index];
      if (!wisp.active) continue;
      // Drift toward the core with a gentle per-wisp sway.
      const sway = Math.sin(state.elapsed * 2.1 + wisp.seed) * 0.35;
      const dx = CORE.x - wisp.x;
      const dy = CORE.y - wisp.y;
      const dist = Math.hypot(dx, dy) || 1;
      wisp.x += (dx / dist * wisp.speed + Math.cos(wisp.angle + Math.PI / 2) * wisp.speed * sway * 0.4) * dt;
      wisp.y += (dy / dist * wisp.speed + Math.sin(wisp.angle + Math.PI / 2) * wisp.speed * sway * 0.4) * dt;

      if (dist < CORE.radius + wisp.radius) {
        // A wisp that reaches the core snuffs one of its embers.
        wisp.active = false;
        burst(wisp.x, wisp.y, wisp.kind === KIND_GILDED ? '#ffd94a' : '#ff5fd0', 22, 160, true);
        if (harmless) continue;
        state.health -= 1;
        state.combo = 0;
        state.shake = 16;
        state.flash = 1;
        state.coreHitAt = state.elapsed;
        events |= EVENT_HIT;
        if (state.health <= 0) {
          events |= EVENT_OVER;
          break;
        }
        continue;
      }

      if (harmless) continue;
      if (overlapsBeam(wisp, state.beamAngle, BEAM.length)) {
        wisp.hp -= 1;
        if (wisp.hp > 0) {
          burst(wisp.x, wisp.y, '#7f6bff', 5, 90, false);
          continue;
        }
        wisp.active = false;
        state.banished += 1;
        state.combo = Math.min(COMBO.max, state.combo + 1);
        state.comboTimer = COMBO.window;
        const bonus = 1 + (state.combo - 1) * 0.5;
        const spec = wisp.kind === KIND_GILDED ? WISP.gilded : wisp.kind === KIND_HUSK ? WISP.husk : WISP.base;
        state.score += Math.round(spec.points * bonus);
        state.beamHeat = 1;
        burst(wisp.x, wisp.y, wisp.kind === KIND_GILDED ? '#ffd94a' : '#ff5fd0', 18, 150, true);
        state.shake = Math.min(10, 3 + state.combo);
        state.comboText.text = comboString(state.combo);
        state.comboText.value = state.combo;
        state.comboText.life = 0.9;
        events |= EVENT_BANISH;
      }
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
