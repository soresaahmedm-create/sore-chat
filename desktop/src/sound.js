// Lightweight, pleasant sound effects synthesized with the Web Audio API.
// No external audio files needed, which keeps the app small and fast to load.
let ctx;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, duration, gainPeak = 0.13) {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function soundsEnabled() {
  return localStorage.getItem('sorechat-sounds') !== 'off';
}

export function playSend() {
  if (!soundsEnabled()) return;
  tone(720, 0, 0.09);
  tone(980, 0.05, 0.1);
}

export function playReceive() {
  if (!soundsEnabled()) return;
  tone(600, 0, 0.1);
  tone(480, 0.07, 0.12);
}

let ringInterval = null;
export function startRing() {
  if (!soundsEnabled()) return;
  stopRing();
  const ringOnce = () => {
    tone(660, 0, 0.18);
    tone(880, 0.06, 0.22);
  };
  ringOnce();
  ringInterval = setInterval(ringOnce, 1500);
}
export function stopRing() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
}

export function playCallConnect() {
  if (!soundsEnabled()) return;
  tone(523.25, 0, 0.12);
  tone(659.25, 0.08, 0.14);
  tone(783.99, 0.16, 0.2);
}

export function playCallEnd() {
  if (!soundsEnabled()) return;
  tone(500, 0, 0.12);
  tone(350, 0.08, 0.18);
}
