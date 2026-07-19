// Deterministic gradient per person so every contact/group gets a
// distinct, stable avatar color instead of everyone looking the same.
const GRADIENTS = [
  ['#5eead4', '#8b9cff'],
  ['#ff6b9d', '#ffb37b'],
  ['#7f77dd', '#5eead4'],
  ['#f0637a', '#ff9b6b'],
  ['#4fd1c5', '#4299e1'],
  ['#f6ad55', '#ed64a6'],
];

export function avatarGradient(seed) {
  let hash = 0;
  const str = seed || '?';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const [a, b] = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
