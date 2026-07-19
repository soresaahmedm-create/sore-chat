import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  collection, query, where, orderBy, limitToLast, endBefore, onSnapshot, getDocs,
  addDoc, updateDoc, doc, getDoc, setDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same Firebase project as the desktop app.
const firebaseConfig = {
  apiKey: 'AIzaSyBCxLiGQyJxtEFqTro0Q_tqSK0_jYVrAGo',
  authDomain: 'sore-chat.firebaseapp.com',
  projectId: 'sore-chat',
  storageBucket: 'sore-chat.firebasestorage.app',
  messagingSenderId: '1079981030813',
  appId: '1:1079981030813:web:d564d8dca207f1482ac374',
};

export const app = initializeApp(firebaseConfig);

// Auth state survives app restarts via AsyncStorage (without this, users
// would be logged out every time the app is closed).
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// The JS Firestore SDK doesn't have a durable on-disk cache for React
// Native the way it does for web (no IndexedDB). It still queues writes
// made while offline and sends them the moment connectivity returns, and
// this app additionally mirrors every chats/messages snapshot into
// AsyncStorage (see cache.js) so the UI can paint instantly from the
// last-known state even after a cold start with no network.
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
export const storage = getStorage(app);

// ---------- Local cache (AsyncStorage) for instant/offline paint ----------
// Implementation lives in ./cache.js (kept separate so it has no circular
// dependency on this file); re-exported here so existing imports keep working.
export { cacheGet, cacheSet } from './cache';

// ---------- Auth ----------

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signUp(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    email: email.toLowerCase(),
    displayName: displayName || email.split('@')[0],
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() {
  return signOut(auth);
}

export async function ensureUserDoc(user) {
  const ref2 = doc(db, 'users', user.uid);
  const snap = await getDoc(ref2);
  if (!snap.exists()) {
    await setDoc(ref2, {
      email: (user.email || '').toLowerCase(),
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      createdAt: serverTimestamp(),
    });
  }
}

// ---------- Chats ----------

export function chatDisplayName(chatData, myUid) {
  if (chatData.isGroup) return chatData.groupName || 'Group chat';
  const otherId = Object.keys(chatData.participantNames || {}).find((id) => id !== myUid);
  return chatData.participantNames?.[otherId] || 'Unknown';
}

export function listenToChats(userId, callback) {
  const q = query(collection(db, 'chats'), where('participantIds', 'array-contains', userId));
  return onSnapshot(
    q,
    (snap) => {
      const chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      chats.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
      callback(chats);
      cacheSet(`chats:${userId}`, chats.map(serializeForCache));
    },
    (err) => console.error('listenToChats error:', err)
  );
}

export async function findOrCreateChatWithEmail(currentUser, contactEmail) {
  const normalizedEmail = contactEmail.trim().toLowerCase();
  const usersRef = collection(db, 'users');
  const userSnap = await getDocs(query(usersRef, where('email', '==', normalizedEmail)));
  if (userSnap.empty) throw new Error('No Sore Chat user found with that email. Ask them to sign up first.');
  const contactDoc = userSnap.docs[0];
  const contactId = contactDoc.id;
  const contactName = contactDoc.data().displayName || normalizedEmail;
  if (contactId === currentUser.uid) throw new Error("That's your own email — add someone else's.");

  const chatsRef = collection(db, 'chats');
  const existingSnap = await getDocs(query(chatsRef, where('participantIds', 'array-contains', currentUser.uid)));
  const existing = existingSnap.docs.find((d) => d.data().participantIds.includes(contactId));
  if (existing) return existing.id;

  const newChat = await addDoc(chatsRef, {
    participantIds: [currentUser.uid, contactId],
    participantNames: {
      [currentUser.uid]: currentUser.displayName || currentUser.email,
      [contactId]: contactName,
    },
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return newChat.id;
}

export async function markChatRead(chatId, userId) {
  await updateDoc(doc(db, 'chats', chatId), { [`readBy.${userId}`]: serverTimestamp() }).catch((err) =>
    console.error('markChatRead error:', err)
  );
}

// ---------- Messages ----------

export function listenToMessages(chatId, callback) {
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limitToLast(50));
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(msgs);
      cacheSet(`messages:${chatId}`, msgs.map(serializeForCache));
    },
    (err) => console.error('listenToMessages error:', err)
  );
}

export async function loadOlderMessages(chatId, beforeCreatedAt, count = 30) {
  if (!beforeCreatedAt) return [];
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
    endBefore(beforeCreatedAt),
    limitToLast(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function sendMessage({ chatId, senderId, text, mediaUri, mediaType, replyToId, replyToText, replyToSender, forwardedMediaUrl, forwardedFrom }) {
  let mediaUrl = forwardedMediaUrl || null;
  if (mediaUri) {
    const response = await fetch(mediaUri);
    const blob = await response.blob();
    const path = `chats/${chatId}/${Date.now()}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    mediaUrl = await getDownloadURL(storageRef);
  }

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  await addDoc(messagesRef, {
    senderId,
    text: text || null,
    mediaUrl,
    mediaType: mediaType || null,
    replyToId: replyToId || null,
    replyToText: replyToText || null,
    replyToSender: replyToSender || null,
    forwardedFrom: forwardedFrom || null,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: (forwardedFrom ? '↪ ' : '') + (text || (mediaType === 'video' ? '📹 Video' : mediaType === 'audio' ? '🎤 Voice message' : '📷 Photo')),
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
  });
}

export async function toggleReaction(chatId, messageId, userId, emoji) {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  const snap = await getDoc(msgRef);
  const current = snap.data()?.reactions?.[emoji] || [];
  await updateDoc(msgRef, {
    [`reactions.${emoji}`]: current.includes(userId) ? arrayRemove(userId) : arrayUnion(userId),
  });
}

export async function deleteMessage(chatId, messageId) {
  await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
}

export async function editMessage(chatId, messageId, newText) {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { text: newText, edited: true });
}

// ---------- Presence (online / last seen) ----------

export async function setPresence(userId, online) {
  await updateDoc(doc(db, 'users', userId), { online, lastSeen: serverTimestamp() }).catch(() => {});
}

export function listenToPresence(userId, callback) {
  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => console.error('listenToPresence error:', err)
  );
}

// ---------- Pin / Star / Delete-for-me / Delete-for-everyone / Forward ----------

export async function pinMessage(chatId, messageId, pinned) {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { pinned });
}

export async function toggleStar(chatId, messageId, userId) {
  const ref2 = doc(db, 'chats', chatId, 'messages', messageId);
  const snap = await getDoc(ref2);
  const starredBy = snap.data()?.starredBy || [];
  await updateDoc(ref2, {
    starredBy: starredBy.includes(userId) ? arrayRemove(userId) : arrayUnion(userId),
  });
}

export async function deleteForMe(chatId, messageId, userId) {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { deletedFor: arrayUnion(userId) });
}

const DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000;

export async function deleteForEveryone(chatId, messageId, createdAt) {
  const sentMs = createdAt?.toMillis?.() || 0;
  if (sentMs && Date.now() - sentMs > DELETE_FOR_EVERYONE_WINDOW_MS) {
    throw new Error('This message is too old to delete for everyone (older than 1 hour).');
  }
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: null,
    mediaUrl: null,
    reactions: {},
    deletedForEveryone: true,
  });
}

export async function forwardMessage({ toChatId, senderId, message }) {
  await sendMessage({
    chatId: toChatId,
    senderId,
    text: message.text || null,
    mediaType: message.mediaType || null,
    forwardedMediaUrl: message.mediaUrl || null,
    forwardedFrom: message.forwardedFrom || 'forwarded message',
  });
}

// ---------- Typing indicators ----------

// ---------- Push tokens (for background/killed-state notifications and calls) ----------
// fcmToken: standard Firebase Cloud Messaging token — used for regular
// message notifications (Android + iOS foreground) and for waking the app
// on Android to ring a call.
// voipToken: iOS PushKit token — the ONLY thing that can wake a
// backgrounded/killed iOS app to show a real CallKit ringing screen; a
// normal FCM/APNs push cannot do this on iOS.
export async function registerPushToken(userId, { fcmToken, voipToken } = {}) {
  const updates = {};
  if (fcmToken) updates.fcmToken = fcmToken;
  if (voipToken) updates.voipToken = voipToken;
  if (Object.keys(updates).length === 0) return;
  await updateDoc(doc(db, 'users', userId), updates).catch(() => {});
}

export async function setTypingStatus(chatId, userId, name) {
  await setDoc(doc(db, 'chats', chatId, 'typing', userId), { name, updatedAt: serverTimestamp() });
}

export async function clearTypingStatus(chatId, userId) {
  await deleteDoc(doc(db, 'chats', chatId, 'typing', userId)).catch(() => {});
}

export function listenToTyping(chatId, callback) {
  return onSnapshot(
    collection(db, 'chats', chatId, 'typing'),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('listenToTyping error:', err)
  );
}

// ---------- Audio/video calls (WebRTC, signaled through Firestore) ----------
// Same signaling contract as desktop/src/firebase.js — a call is one doc in
// `calls/{callId}` holding the offer/answer SDP, plus two subcollections
// for trickled ICE candidates. Keeping the shape identical means a desktop
// user and a mobile user can call each other.

// CallKit (iOS) requires the call identifier it displays to be a real
// UUID, and this same ID travels through the push notification to become
// the CallKeep callUUID — so we generate it client-side rather than using
// Firestore's non-UUID auto-IDs.
function generateCallId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function createCallDoc({ callerId, callerName, calleeId, type }) {
  const callId = generateCallId();
  await setDoc(doc(db, 'calls', callId), {
    callerId,
    callerName,
    calleeId,
    type, // 'audio' | 'video'
    status: 'ringing', // ringing | accepted | declined | ended
    offer: null,
    answer: null,
    createdAt: serverTimestamp(),
  });
  return callId;
}

export function listenForIncomingCalls(userId, callback) {
  const q = query(collection(db, 'calls'), where('calleeId', '==', userId), where('status', '==', 'ringing'));
  return onSnapshot(
    q,
    (snap) => {
      const call = snap.docs[0];
      callback(call ? { id: call.id, ...call.data() } : null);
    },
    (err) => console.error('listenForIncomingCalls error:', err)
  );
}

export async function updateCallStatus(callId, status) {
  await updateDoc(doc(db, 'calls', callId), { status });
}

export async function setCallOffer(callId, offer) {
  await updateDoc(doc(db, 'calls', callId), { offer, status: 'ringing' });
}

export async function setCallAnswer(callId, answer) {
  await updateDoc(doc(db, 'calls', callId), { answer, status: 'accepted' });
}

export async function getCallOnce(callId) {
  const snap = await getDoc(doc(db, 'calls', callId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function listenToCallDoc(callId, callback) {
  return onSnapshot(
    doc(db, 'calls', callId),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => console.error('listenToCallDoc error:', err)
  );
}

export async function addIceCandidate(callId, role, candidate) {
  await addDoc(collection(db, 'calls', callId, `${role}Candidates`), candidate.toJSON());
}

export function listenToIceCandidates(callId, role, callback) {
  return onSnapshot(
    collection(db, 'calls', callId, `${role}Candidates`),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') callback(change.doc.data());
      });
    },
    (err) => console.error('listenToIceCandidates error:', err)
  );
}

// Timestamps (Firestore Timestamp objects) aren't JSON-serializable as-is;
// store them as millis so the AsyncStorage cache round-trips cleanly.
function serializeForCache(obj) {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k]?.toMillis) out[k] = { __ts: out[k].toMillis() };
  }
  return out;
}

export function deserializeFromCache(obj) {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k]?.__ts) out[k] = { toMillis: () => out[k].__ts, toDate: () => new Date(out[k].__ts) };
  }
  return out;
}
