// Your real Sore Chat Firebase project.
const firebaseConfig = {
  apiKey: 'AIzaSyBCxLiGQyJxtEFqTro0Q_tqSK0_jYVrAGo',
  authDomain: 'sore-chat.firebaseapp.com',
  projectId: 'sore-chat',
  storageBucket: 'sore-chat.firebasestorage.app',
  messagingSenderId: '1079981030813',
  appId: '1:1079981030813:web:d564d8dca207f1482ac374',
};

let app, auth, db, storage;
let firebaseReady = false;

export async function initFirebase() {
  const { initializeApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    memoryLocalCache,
  } = await import('firebase/firestore');
  const { getStorage } = await import('firebase/storage');

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  storage = getStorage(app);

  // Offline-first: cache reads/writes locally (IndexedDB) so the app opens
  // instantly from cache and queues writes automatically while offline,
  // then syncs once the connection returns. Falls back to in-memory cache
  // if IndexedDB isn't available (e.g. private browsing) so init never hard-fails.
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('Persistent Firestore cache unavailable, falling back to memory cache:', err);
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }

  firebaseReady = true;
  return true;
}

// ---------- Connectivity ----------

export async function goOffline() {
  const { disableNetwork } = await import('firebase/firestore');
  return disableNetwork(db).catch(() => {});
}

export async function goOnline() {
  const { enableNetwork } = await import('firebase/firestore');
  return enableNetwork(db).catch(() => {});
}

export function isFirebaseReady() {
  return firebaseReady;
}

// ---------- Auth ----------

export async function watchAuthState(callback) {
  const { onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(auth, callback);
}

export async function signUp(email, password, displayName) {
  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    email: email.toLowerCase(),
    displayName: displayName || email.split('@')[0],
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function signIn(email, password) {
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() {
  const { signOut } = await import('firebase/auth');
  return signOut(auth);
}

// Repairs accounts where the Auth login exists but the matching Firestore
// profile doc was never created (e.g. an early sign-up attempt that failed
// partway through, before rules were live).
export async function ensureUserDoc(user) {
  const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: (user.email || '').toLowerCase(),
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      createdAt: serverTimestamp(),
    });
  }
}

// ---------- Contacts / chats ----------

// Finds an existing chat with this email, or creates a new one.
export async function findOrCreateChatWithEmail(currentUser, contactEmail) {
  const { collection, query, where, getDocs, addDoc, serverTimestamp } = await import('firebase/firestore');

  const normalizedEmail = contactEmail.trim().toLowerCase();
  const usersRef = collection(db, 'users');
  const userQuery = query(usersRef, where('email', '==', normalizedEmail));
  const userSnap = await getDocs(userQuery);

  if (userSnap.empty) {
    throw new Error('No Sore Chat user found with that email. Ask them to sign up first.');
  }
  const contactDoc = userSnap.docs[0];
  const contactId = contactDoc.id;
  const contactName = contactDoc.data().displayName || normalizedEmail;

  if (contactId === currentUser.uid) {
    throw new Error("That's your own email — add someone else's.");
  }

  const chatsRef = collection(db, 'chats');
  const existingQuery = query(chatsRef, where('participantIds', 'array-contains', currentUser.uid));
  const existingSnap = await getDocs(existingQuery);
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

// ---------- Presence (online / last seen) ----------
// Approximate, client-driven presence: we mark the user online while the
// app is focused/open and flip to offline+lastSeen on blur/close. This is
// the same approach most non-native-socket chat apps use without a
// dedicated presence server (Cloud Functions + Realtime DB `onDisconnect`
// would be the more robust upgrade later, since a killed process can't run
// its own cleanup code).

export async function setPresence(userId, online) {
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', userId), {
    online,
    lastSeen: serverTimestamp(),
  }).catch(() => {});
}

export async function listenToPresence(userId, callback) {
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => console.error('listenToPresence error:', err)
  );
}

export async function markChatRead(chatId, userId) {
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await updateDoc(doc(db, 'chats', chatId), { [`readBy.${userId}`]: serverTimestamp() }).catch((err) =>
    console.error('markChatRead error:', err)
  );
}

export async function listenToChats(userId, callback) {
  const { collection, query, where, onSnapshot } = await import('firebase/firestore');
  // Deliberately no orderBy() here — combining array-contains with orderBy
  // on a different field requires a manually-created composite index in
  // Firestore. Sorting client-side avoids that setup step entirely.
  const q = query(collection(db, 'chats'), where('participantIds', 'array-contains', userId));
  return onSnapshot(
    q,
    (snap) => {
      const chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      chats.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
      callback(chats);
    },
    (err) => console.error('listenToChats error:', err)
  );
}

// Creates a group chat with 2+ other people, looked up by email.
export async function createGroupChat(currentUser, emails, groupName) {
  const { collection, query, where, getDocs, addDoc, serverTimestamp } = await import('firebase/firestore');

  const usersRef = collection(db, 'users');
  const participantIds = [currentUser.uid];
  const participantNames = { [currentUser.uid]: currentUser.displayName || currentUser.email };

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    const snap = await getDocs(query(usersRef, where('email', '==', email)));
    if (snap.empty) throw new Error(`No Sore Chat user found for ${email}`);
    const found = snap.docs[0];
    if (found.id === currentUser.uid || participantIds.includes(found.id)) continue;
    participantIds.push(found.id);
    participantNames[found.id] = found.data().displayName || email;
  }

  if (participantIds.length < 3) {
    throw new Error('Add at least 2 other people to make a group.');
  }

  const newChat = await addDoc(collection(db, 'chats'), {
    isGroup: true,
    groupName: groupName?.trim() || 'Group chat',
    participantIds,
    participantNames,
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return newChat.id;
}

// ---------- Audio/video calls (WebRTC, signaled through Firestore) ----------

// CallKit (iOS) requires the call identifier it displays to be a real
// UUID. Firestore's auto-generated doc IDs aren't UUID-formatted, and this
// same ID now has to travel through a push notification and become the
// CallKeep callUUID on mobile, so we generate the ID ourselves and use
// setDoc instead of addDoc's auto-ID.
function generateCallId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function createCallDoc({ callerId, callerName, calleeId, type }) {
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
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

export async function listenForIncomingCalls(userId, callback) {
  const { collection, query, where, onSnapshot } = await import('firebase/firestore');
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
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'calls', callId), { status });
}

export async function setCallOffer(callId, offer) {
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'calls', callId), { offer, status: 'ringing' });
}

export async function setCallAnswer(callId, answer) {
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'calls', callId), { answer, status: 'accepted' });
}

export async function listenToCallDoc(callId, callback) {
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    doc(db, 'calls', callId),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => console.error('listenToCallDoc error:', err)
  );
}

export async function addIceCandidate(callId, role, candidate) {
  const { collection, addDoc } = await import('firebase/firestore');
  await addDoc(collection(db, 'calls', callId, `${role}Candidates`), candidate.toJSON());
}

export async function listenToIceCandidates(callId, role, callback) {
  const { collection, onSnapshot } = await import('firebase/firestore');
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

// ---------- Messages ----------

export async function sendMessage({ chatId, senderId, text, mediaFile, mediaType, replyToId, replyToText, replyToSender, forwardedMediaUrl, forwardedFrom }) {
  const { collection, addDoc, serverTimestamp, doc, updateDoc } = await import('firebase/firestore');

  let mediaUrl = forwardedMediaUrl || null;
  if (mediaFile) {
    const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const path = `chats/${chatId}/${Date.now()}_${mediaFile.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, mediaFile);
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

export async function listenToMessages(chatId, callback) {
  const { collection, query, orderBy, limitToLast, onSnapshot } = await import('firebase/firestore');
  // Only the most recent 50 messages are loaded live. For older history,
  // add a "load more" that re-queries with an endBefore() cursor.
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limitToLast(50));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('listenToMessages error:', err)
  );
}

// One-time fetch of the batch of messages older than the oldest one
// currently loaded. Used for the "load earlier messages" button.
export async function loadOlderMessages(chatId, beforeCreatedAt, count = 30) {
  const { collection, query, orderBy, endBefore, limitToLast, getDocs } = await import('firebase/firestore');
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

export async function toggleReaction(chatId, messageId, userId, emoji) {
  const { doc, getDoc, updateDoc, arrayUnion, arrayRemove } = await import('firebase/firestore');
  const ref = doc(db, 'chats', chatId, 'messages', messageId);
  const snap = await getDoc(ref);
  const current = snap.data()?.reactions?.[emoji] || [];
  await updateDoc(ref, {
    [`reactions.${emoji}`]: current.includes(userId) ? arrayRemove(userId) : arrayUnion(userId),
  });
}

export async function editMessage(chatId, messageId, newText) {
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { text: newText, edited: true });
}

export async function deleteMessage(chatId, messageId) {
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
}

// "Delete for me" hides the message only on this account (everyone else
// still sees it normally) — we never touch the shared document's content,
// just record who's opted out of seeing it.
export async function deleteForMe(chatId, messageId, userId) {
  const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    deletedFor: arrayUnion(userId),
  });
}

// "Delete for everyone" — only allowed on your own messages, and only
// within a short window after sending (matches the security rules in
// firestore.rules, which are the real enforcement — this check just gives
// immediate, friendly feedback instead of a failed write round-trip).
const DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000; // 1 hour, same as WhatsApp

export async function deleteForEveryone(chatId, messageId, createdAt) {
  const sentMs = createdAt?.toMillis?.() || 0;
  if (sentMs && Date.now() - sentMs > DELETE_FOR_EVERYONE_WINDOW_MS) {
    throw new Error("This message is too old to delete for everyone (older than 1 hour).");
  }
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: null,
    mediaUrl: null,
    reactions: {},
    deletedForEveryone: true,
  });
}

export async function pinMessage(chatId, messageId, pinned) {
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { pinned });
}

export async function toggleStar(chatId, messageId, userId) {
  const { doc, getDoc, updateDoc, arrayUnion, arrayRemove } = await import('firebase/firestore');
  const ref = doc(db, 'chats', chatId, 'messages', messageId);
  const snap = await getDoc(ref);
  const starredBy = snap.data()?.starredBy || [];
  await updateDoc(ref, {
    starredBy: starredBy.includes(userId) ? arrayRemove(userId) : arrayUnion(userId),
  });
}

// Forwards a message's content into a different chat as a brand-new
// message (tagged forwardedFrom), same as every major chat app does — it
// never moves or links to the original doc.
export async function forwardMessage({ toChatId, senderId, message }) {
  await sendMessage({
    chatId: toChatId,
    senderId,
    text: message.text || null,
    mediaFile: null,
    mediaType: message.mediaType || null,
    forwardedMediaUrl: message.mediaUrl || null,
    forwardedFrom: message.forwardedFrom || message.originalSenderName || 'forwarded message',
  });
}

// ---------- Typing indicators ----------

export async function setTypingStatus(chatId, userId, name) {
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  await setDoc(doc(db, 'chats', chatId, 'typing', userId), { name, updatedAt: serverTimestamp() });
}

export async function clearTypingStatus(chatId, userId) {
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'chats', chatId, 'typing', userId)).catch(() => {});
}

export async function listenToTyping(chatId, callback) {
  const { collection, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    collection(db, 'chats', chatId, 'typing'),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('listenToTyping error:', err)
  );
}

// ---------- Direct peer-to-peer file transfer ----------
// Sends files straight between two devices via a WebRTC data channel,
// bypassing Cloud Storage entirely. Faster and more private, but both
// people need to be online at the same time - there's no cloud fallback
// built into this path (the regular 📎 attach button still uploads to
// Storage as a reliable fallback).

export async function createTransferDoc({ chatId, fromId, fromName, toId, fileName, fileSize, mediaType }) {
  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  const ref = await addDoc(collection(db, 'transfers'), {
    chatId, fromId, fromName, toId, fileName, fileSize, mediaType,
    status: 'pending', offer: null, answer: null, createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listenForIncomingTransfers(userId, callback) {
  const { collection, query, where, onSnapshot } = await import('firebase/firestore');
  const q = query(collection(db, 'transfers'), where('toId', '==', userId), where('status', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('listenForIncomingTransfers error:', err)
  );
}

export async function setTransferOffer(id, offer) {
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'transfers', id), { offer, status: 'pending' });
}

export async function setTransferAnswer(id, answer) {
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'transfers', id), { answer, status: 'connecting' });
}

export async function updateTransferStatus(id, status) {
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'transfers', id), { status }).catch(() => {});
}

export async function listenToTransferDoc(id, callback) {
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    doc(db, 'transfers', id),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => console.error('listenToTransferDoc error:', err)
  );
}

export async function addTransferIceCandidate(id, role, candidate) {
  const { collection, addDoc } = await import('firebase/firestore');
  await addDoc(collection(db, 'transfers', id, `${role}Candidates`), candidate.toJSON());
}

export async function listenToTransferIceCandidates(id, role, callback) {
  const { collection, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    collection(db, 'transfers', id, `${role}Candidates`),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') callback(change.doc.data());
      });
    },
    (err) => console.error('listenToTransferIceCandidates error:', err)
  );
}

// Logs a completed direct transfer into the normal message list so it
// shows up in chat history (the file itself is never uploaded - only this
// small record is). Playback only works on devices that received the file
// directly; see DirectTransfer.jsx for how the local blob URL is resolved.
export async function logDirectTransferMessage({ chatId, senderId, fileName, mediaType, transferId }) {
  const { collection, addDoc, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  const ref = await addDoc(collection(db, 'chats', chatId, 'messages'), {
    senderId, text: null, mediaUrl: null, mediaType, direct: true, fileName, transferId,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: `⚡ Sent directly: ${fileName}`,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
  });
  return ref.id;
}

export { auth, db, storage };
