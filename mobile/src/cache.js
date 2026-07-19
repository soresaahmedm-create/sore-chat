import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'sorechat:';

export async function cacheGet(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable - non-fatal, app just loses the cold-start cache.
  }
}

export async function cacheRemove(key) {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
