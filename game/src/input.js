// Keyboard and pointer input. Held keys turn the halo beam left or right; the pointer's position
// sets an angle the beam chases. One-shot presses (start or restart, pause) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost and never
// counted twice.
import { CORE } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(toField) {
  let left = false;
  let right = false;
  let actions = 0;
  let pointerAngle = null; // radians from the core toward the pointer, in field space
  let pointerFresh = 0;    // seconds since the pointer last moved; a stale pointer hands control back to the keys

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
  });

  function readPointer(event) {
    const point = toField(event.clientX, event.clientY);
    if (point === null) return;
    const dx = point.x - CORE.x;
    const dy = point.y - CORE.y;
    if (Math.hypot(dx, dy) < 6) return;
    pointerAngle = Math.atan2(dy, dx);
    pointerFresh = 1.5;
  }

  window.addEventListener('pointermove', readPointer, { passive: true });
  window.addEventListener('pointerdown', (event) => {
    readPointer(event);
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    direction() {
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** The angle the pointer asks for, or null while the pointer is stale. */
    pointerTarget(dt) {
      if (pointerAngle === null) return null;
      pointerFresh -= dt;
      return pointerFresh > 0 ? pointerAngle : null;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
