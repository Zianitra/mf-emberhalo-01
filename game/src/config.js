// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The lantern core the player guards, near the middle of the field. */
export const CORE = { x: 640, y: 372, radius: 26, hp: 3, invulnerable: 2 };

/** The halo beam: a wedge of light swept around the core that banishes gloom it touches. */
export const BEAM = {
  inner: 50,
  length: 196,
  halfArc: 0.36,
  turnSpeed: 8.2,    // radians a second under the arrow keys
  trackSpeed: 15,    // radians a second when chasing the pointer
};

/** How many gloom wisps can exist at once; the pool is allocated once, at boot. */
export const POOL_SIZE = 96;

/** Seconds of play per surge level, and the last level: speeds and spawn rates stop growing there. */
export const LEVEL = { seconds: 14, max: 12 };

export const LIVES = CORE.hp;

/** A combo grows when banishes land within `window` seconds of each other. */
export const COMBO = { window: 2.4, max: 8 };

export const WISP = {
  // The three kinds of gloom that drift toward the core.
  base:   { speed: 62, radius: 13, hp: 1, points: 5 },
  gilded: { speed: 100, radius: 11, hp: 1, points: 25 },
  husk:   { speed: 42, radius: 22, hp: 2, points: 40 },
  speedPerLevel: 8,
  spawnInterval: 1.15,
  spawnScale: 0.9,
  minInterval: 0.3,
  spawnRadius: 660,
};

export const PALETTE = {
  void: '#070a14',
  deep: '#0d1226',
  haze: '#141a35',
  beam: '#6df2ff',
  beamHot: '#eaffff',
  core: '#ffd27d',
  coreHurt: '#ff6d6d',
  wisp: '#ff5fd0',
  wispDim: '#8f2f78',
  gilded: '#ffd94a',
  husk: '#7f6bff',
  text: '#eaf2ff',
  muted: '#7f8ab0',
  panel: 'rgba(9, 13, 28, 0.86)',
  accent: '#6df2ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberhalo.best';
