// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. The look
// is a neon lantern-garden: a layered parallax starfield and drifting haze behind, glowing wisps
// and a luminous halo beam in front, with afterimage trails drawn onto a fading overlay canvas.
// Text that holds a number is rebuilt only when the number changes, so a frame allocates nothing.
import { BEAM, CORE, FIELD, FONT, LIVES, PALETTE } from './config.js';
import { KIND_BASE, KIND_GILDED, KIND_HUSK } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 36, bottom: 70 };

/** Parallax layers: rings of far stars that turn slowly around the core. */
const LAYERS = [
  { count: 60, radiusMin: 240, radiusMax: 720, size: 1.6, speed: 0.012, color: 'rgba(120,140,200,0.5)' },
  { count: 40, radiusMin: 160, radiusMax: 620, size: 2.4, speed: 0.03, color: 'rgba(160,180,240,0.7)' },
  { count: 22, radiusMin: 120, radiusMax: 520, size: 3.4, speed: 0.06, color: 'rgba(200,220,255,0.9)' },
];

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const trail = document.createElement('canvas');
  trail.width = FIELD.width;
  trail.height = FIELD.height;
  const trailContext = trail.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const surgeLabel = cachedLabel('Surge ');
  const comboLabel = cachedLabel('Combo x');
  const bestLabel = cachedLabel('Best ');

  const stars = [];
  let starSeed = 7;
  function starRandom() {
    starSeed = (starSeed * 1103515245 + 12345) & 0x7fffffff;
    return starSeed / 0x7fffffff;
  }
  for (const layer of LAYERS) {
    for (let index = 0; index < layer.count; index += 1) {
      const angle = starRandom() * Math.PI * 2;
      const radius = layer.radiusMin + starRandom() * (layer.radiusMax - layer.radiusMin);
      stars.push({ layer, angle, radius, x: 0, y: 0, twinkle: starRandom() * Math.PI * 2 });
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, glow) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.textAlign = align;
    if (glow !== undefined) {
      context.shadowColor = glow;
      context.shadowBlur = size * 0.6;
    } else {
      context.shadowBlur = 0;
    }
    context.fillStyle = color;
    context.fillText(value, x, y);
    context.shadowBlur = 0;
  }

  function drawBackdrop(state) {
    // Deep space gradient around the core, darkest at the edges.
    const gradient = context.createRadialGradient(CORE.x, CORE.y, 40, CORE.x, CORE.y, 760);
    gradient.addColorStop(0, PALETTE.haze);
    gradient.addColorStop(0.45, PALETTE.deep);
    gradient.addColorStop(1, PALETTE.void);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // Three parallax star rings turning slowly around the core.
    for (const star of stars) {
      const angle = star.angle + state.elapsed * star.layer.speed;
      const x = CORE.x + Math.cos(angle) * star.radius;
      const y = CORE.y + Math.sin(angle) * star.radius * 0.82;
      if (x < -8 || x > FIELD.width + 8 || y < -8 || y > FIELD.height + 8) continue;
      const twinkle = 0.55 + 0.45 * Math.sin(state.elapsed * 2 + star.twinkle);
      context.globalAlpha = twinkle;
      context.fillStyle = star.layer.color;
      context.fillRect(x, y, star.layer.size, star.layer.size);
    }
    context.globalAlpha = 1;

    // A soft halo of light under the core.
    const halo = context.createRadialGradient(CORE.x, CORE.y, 8, CORE.x, CORE.y, 190);
    halo.addColorStop(0, 'rgba(255, 210, 125, 0.20)');
    halo.addColorStop(1, 'rgba(255, 210, 125, 0)');
    context.fillStyle = halo;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawBeam(state) {
    const heat = state.beamHeat;
    context.save();
    context.translate(CORE.x, CORE.y);
    context.rotate(state.beamAngle);
    context.globalCompositeOperation = 'lighter';
    // The beam: a luminous wedge, hotter and brighter when it just banished something.
    const gradient = context.createLinearGradient(BEAM.inner, 0, BEAM.length, 0);
    gradient.addColorStop(0, heat > 0.4 ? PALETTE.beamHot : 'rgba(109,242,255,0.55)');
    gradient.addColorStop(1, 'rgba(109,242,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(BEAM.inner, 0);
    context.arc(0, 0, BEAM.length, -BEAM.halfArc, BEAM.halfArc);
    context.closePath();
    context.fill();
    // Crisp edge lines.
    context.strokeStyle = heat > 0.4 ? PALETTE.beamHot : 'rgba(109,242,255,0.8)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(BEAM.inner, -Math.tan(BEAM.halfArc) * BEAM.inner);
    context.lineTo(Math.cos(BEAM.halfArc) * BEAM.length, Math.sin(BEAM.halfArc) * BEAM.length);
    context.moveTo(BEAM.inner, Math.tan(BEAM.halfArc) * BEAM.inner);
    context.lineTo(Math.cos(BEAM.halfArc) * BEAM.length, -Math.sin(BEAM.halfArc) * BEAM.length);
    context.stroke();
    context.restore();
    context.globalCompositeOperation = 'source-over';
  }

  function drawCore(state) {
    const hurt = state.elapsed - state.coreHitAt < 0.6;
    const pulse = 1 + 0.08 * Math.sin(state.elapsed * 4);
    const color = hurt ? PALETTE.coreHurt : PALETTE.core;
    // Ember ring: one ring per remaining ember of health.
    for (let ember = 0; ember < LIVES; ember += 1) {
      const angle = state.elapsed * 0.8 + (ember / LIVES) * Math.PI * 2;
      const radius = CORE.radius + 16;
      const lit = ember < state.health;
      context.beginPath();
      context.arc(CORE.x + Math.cos(angle) * radius, CORE.y + Math.sin(angle) * radius, lit ? 5 : 3, 0, Math.PI * 2);
      context.fillStyle = lit ? color : 'rgba(127,138,176,0.35)';
      if (lit) {
        context.shadowColor = color;
        context.shadowBlur = 10;
      } else {
        context.shadowBlur = 0;
      }
      context.fill();
      context.shadowBlur = 0;
    }
    context.beginPath();
    context.arc(CORE.x, CORE.y, CORE.radius * pulse, 0, Math.PI * 2);
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 26;
    context.fill();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(CORE.x, CORE.y, CORE.radius * 0.45, 0, Math.PI * 2);
    context.fillStyle = hurt ? '#fff1f1' : '#fff6e2';
    context.fill();
  }

  function drawWisps(state) {
    for (const wisp of state.wisps) {
      if (!wisp.active) continue;
      const color = wisp.kind === KIND_GILDED ? PALETTE.gilded : wisp.kind === KIND_HUSK ? PALETTE.husk : PALETTE.wisp;
      const dim = wisp.kind === KIND_HUSK && wisp.hp > 1 ? PALETTE.wispDim : color;
      context.beginPath();
      context.arc(wisp.x, wisp.y, wisp.radius, 0, Math.PI * 2);
      context.fillStyle = dim;
      context.shadowColor = color;
      context.shadowBlur = 16;
      context.fill();
      context.shadowBlur = 0;
      // A bright inner eye and a thin trailing tail toward where it came from.
      context.beginPath();
      context.arc(wisp.x - wisp.radius * 0.2, wisp.y - wisp.radius * 0.2, wisp.radius * 0.4, 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      const angle = Math.atan2(CORE.y - wisp.y, CORE.x - wisp.x) + Math.PI;
      context.strokeStyle = color;
      context.globalAlpha = 0.45;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(wisp.x, wisp.y);
      context.lineTo(wisp.x + Math.cos(angle) * wisp.radius * 2.2, wisp.y + Math.sin(angle) * wisp.radius * 2.2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawParticles(state) {
    context.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      if (!particle.active) continue;
      const alpha = particle.life / particle.maxLife;
      context.globalAlpha = alpha;
      context.fillStyle = particle.color;
      if (particle.glow) {
        context.shadowColor = particle.color;
        context.shadowBlur = 8;
      }
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      context.shadowBlur = 0;
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 28, 20, 30, PALETTE.text, 'left', 'rgba(109,242,255,0.7)');
    text(surgeLabel(state.level), FIELD.width / 2, 20, 26, PALETTE.accent, 'center');
    const comboSize = 20 + Math.min(state.combo, 8) * 2;
    if (state.combo > 1) text(comboLabel(state.combo), FIELD.width - 28, 20, comboSize, PALETTE.gilded, 'right', PALETTE.gilded);
    // The combo timer as a thin arc under the score.
    if (state.comboTimer > 0 && state.combo > 0) {
      const fraction = Math.min(1, state.comboTimer / 2.4);
      context.strokeStyle = PALETTE.gilded;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(46, 92, 26, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
      context.stroke();
    }
  }

  function drawComboText(state) {
    if (state.comboText.life <= 0) return;
    const alpha = Math.min(1, state.comboText.life / 0.3);
    context.globalAlpha = alpha;
    const size = 34 + state.comboText.value * 3;
    text(state.comboText.text, CORE.x, CORE.y - 96, size, PALETTE.gilded, 'center', PALETTE.gilded);
    context.globalAlpha = 1;
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.beginPath();
    context.roundRect(x, y, PANEL.width, height, 18);
    context.fill();
    context.strokeStyle = 'rgba(109,242,255,0.45)';
    context.lineWidth = 2;
    context.shadowColor = 'rgba(109,242,255,0.6)';
    context.shadowBlur = 14;
    context.stroke();
    context.shadowBlur = 0;
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 86, 52, PALETTE.beamHot, 'center', PALETTE.beam);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.gilded, 'center', 'rgba(255,217,74,0.5)');
  }

  const TITLE_LINES = [
    'Sweep the halo of light to banish the gloom.',
    'Aim with the mouse, or turn with ← → / A D.',
    'Gold wisps score big. Husks take two hits.',
    'Guard the lantern: three embers of health.',
    '',
  ];
  const PAUSED_LINES = ['The gloom will wait for you.'];
  const OVER_LINES = ['', '', ''];

  /**
   * Stamp the bright, fast things onto the trail layer: the beam wedge, each wisp and the core.
   * That layer fades a little every frame, so the frame keeps their afterimages glowing behind.
   */
  function stampTrail(state) {
    trailContext.globalCompositeOperation = 'source-over';
    trailContext.save();
    trailContext.translate(CORE.x, CORE.y);
    trailContext.rotate(state.beamAngle);
    const gradient = trailContext.createLinearGradient(BEAM.inner, 0, BEAM.length, 0);
    gradient.addColorStop(0, 'rgba(109,242,255,0.85)');
    gradient.addColorStop(1, 'rgba(109,242,255,0)');
    trailContext.fillStyle = gradient;
    trailContext.beginPath();
    trailContext.moveTo(BEAM.inner, 0);
    trailContext.arc(0, 0, BEAM.length, -BEAM.halfArc, BEAM.halfArc);
    trailContext.closePath();
    trailContext.fill();
    trailContext.restore();
    for (const wisp of state.wisps) {
      if (!wisp.active) continue;
      const color = wisp.kind === KIND_GILDED ? PALETTE.gilded : wisp.kind === KIND_HUSK ? PALETTE.husk : PALETTE.wisp;
      trailContext.beginPath();
      trailContext.arc(wisp.x, wisp.y, wisp.radius * 0.85, 0, Math.PI * 2);
      trailContext.fillStyle = color;
      trailContext.fill();
    }
    trailContext.beginPath();
    trailContext.arc(CORE.x, CORE.y, CORE.radius * 0.9, 0, Math.PI * 2);
    trailContext.fillStyle = PALETTE.core;
    trailContext.fill();
  }

  /** Paint one frame: the fading afterimage trail, the field, then the HUD or a panel. */
  function draw(state, screen, best) {
    // Shake: a few pixels of jitter around the whole field while it decays.
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.void;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);

    // The afterimage layer fades toward transparency, so bright ghosts of everything linger.
    trailContext.globalCompositeOperation = 'destination-out';
    trailContext.fillStyle = 'rgba(0,0,0,0.16)';
    trailContext.fillRect(0, 0, FIELD.width, FIELD.height);
    trailContext.globalCompositeOperation = 'source-over';

    drawBackdrop(state);
    stampTrail(state);
    drawWisps(state);
    drawBeam(state);
    drawParticles(state);
    drawCore(state);
    context.drawImage(trail, 0, 0);

    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = bestLabel(best);
      drawPanel('EMBERHALO', TITLE_LINES, 'Press Space or click to begin the vigil');
      return;
    }
    drawHud(state);
    drawComboText(state);
    // A red flash when the core is struck.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 90, 90, ${state.flash * 0.25})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = `Score ${state.score}`;
      OVER_LINES[1] = bestLabel(best);
      OVER_LINES[2] = `Wisps banished ${state.banished}  ·  Reached surge ${state.level}`;
      drawPanel('The lantern went dark', OVER_LINES, 'Press Space or click to relight it');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
