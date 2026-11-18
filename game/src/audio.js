// Procedural audio, synthesized with WebAudio: no asset files, and nothing plays until the first
// user gesture creates the context. Short blips for banishes (rising with the combo), a low thud
// and a noise burst when a wisp reaches the core, a rising arpeggio when a combo peaks, and a
// soft chord when a surge level begins.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context !== null) return;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor === undefined) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
  }

  function blip(frequency, duration, type, volume, slideTo) {
    if (context === null) return;
    const time = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (slideTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(slideTo, time + duration);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  function noiseBurst(duration, volume) {
    if (context === null) return;
    const time = context.currentTime;
    const frames = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / frames) ** 2;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = volume;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    source.connect(filter).connect(gain).connect(master);
    source.start(time);
  }

  return {
    /** Called on the first user gesture: the audio may only start after that. */
    unlock() {
      ensure();
      if (context !== null && context.state === 'suspended') context.resume();
    },
    banish(combo) {
      const scale = [440, 494, 554, 622, 698, 784, 880, 988];
      const note = scale[Math.min(scale.length - 1, combo - 1)] ?? 440;
      blip(note, 0.14, 'triangle', 0.28, note * 1.35);
    },
    comboPeak(value) {
      if (value < 4) return;
      const root = 523;
      for (let index = 0; index < Math.min(4, value - 3); index += 1) {
        setTimeout(() => blip(root * 2 ** (index / 4), 0.1, 'square', 0.14), index * 55);
      }
    },
    hit() {
      blip(110, 0.4, 'sine', 0.5, 46);
      noiseBurst(0.3, 0.4);
    },
    surge() {
      blip(330, 0.18, 'triangle', 0.2);
      setTimeout(() => blip(440, 0.18, 'triangle', 0.2), 90);
      setTimeout(() => blip(660, 0.22, 'triangle', 0.2), 180);
    },
    start() {
      blip(392, 0.12, 'triangle', 0.22);
      setTimeout(() => blip(523, 0.12, 'triangle', 0.22), 80);
      setTimeout(() => blip(784, 0.16, 'triangle', 0.22), 160);
    },
    over() {
      blip(220, 0.5, 'sawtooth', 0.3, 65);
      setTimeout(() => noiseBurst(0.5, 0.25), 120);
    },
  };
}
