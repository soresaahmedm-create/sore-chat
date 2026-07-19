const KEY_SOUNDS = 'sorechat-sounds';
const KEY_THEME = 'sorechat-theme';
const KEY_NOTIFICATIONS = 'sorechat-notifications';
const KEY_ENTER_TO_SEND = 'sorechat-enter-to-send';
const KEY_ACCENT = 'sorechat-accent';

export function getSoundsEnabled() {
  return localStorage.getItem(KEY_SOUNDS) !== 'off';
}
export function setSoundsEnabled(on) {
  localStorage.setItem(KEY_SOUNDS, on ? 'on' : 'off');
}

export function getTheme() {
  return localStorage.getItem(KEY_THEME) || 'dark';
}
export function applyTheme(theme) {
  localStorage.setItem(KEY_THEME, theme);
  document.documentElement.setAttribute('data-theme', theme);
}

export function getNotificationsEnabled() {
  return localStorage.getItem(KEY_NOTIFICATIONS) !== 'off';
}
export function setNotificationsEnabled(on) {
  localStorage.setItem(KEY_NOTIFICATIONS, on ? 'on' : 'off');
}

export function getEnterToSend() {
  return localStorage.getItem(KEY_ENTER_TO_SEND) !== 'off';
}
export function setEnterToSend(on) {
  localStorage.setItem(KEY_ENTER_TO_SEND, on ? 'on' : 'off');
}

const KEY_PROXY = 'sorechat-proxy';

export function getProxyUrl() {
  return localStorage.getItem(KEY_PROXY) || '';
}
export function setProxyUrl(url) {
  localStorage.setItem(KEY_PROXY, url || '');
}

export function getAccent() {
  return localStorage.getItem(KEY_ACCENT) || 'signal';
}
export function applyAccent(accent) {
  localStorage.setItem(KEY_ACCENT, accent);
  document.documentElement.setAttribute('data-accent', accent);
}
