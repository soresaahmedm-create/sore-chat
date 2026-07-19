import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendMessage } from './firebase';

const KEY = 'sorechat:outbox';

async function readOutbox() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

// Queues a text message (media sends require a live connection to upload,
// so those are not queued - the caller should surface that to the user).
export async function enqueueMessage(payload) {
  const items = await readOutbox();
  const item = { ...payload, localId: `outbox-${Date.now()}-${Math.random().toString(36).slice(2)}`, queuedAt: Date.now() };
  items.push(item);
  await writeOutbox(items);
  return item;
}

export async function getOutbox() {
  return readOutbox();
}

// Attempts to send every queued message in order. Stops and keeps the rest
// queued the moment one fails (e.g. connection dropped mid-flush), so
// nothing is sent out of order or silently dropped.
export async function flushOutbox(onSent) {
  const items = await readOutbox();
  if (items.length === 0) return;
  const remaining = [...items];
  while (remaining.length > 0) {
    const item = remaining[0];
    try {
      await sendMessage(item);
      remaining.shift();
      await writeOutbox(remaining);
      onSent?.(item);
    } catch (err) {
      console.warn('Outbox flush stopped, will retry later:', err.message);
      break;
    }
  }
}
