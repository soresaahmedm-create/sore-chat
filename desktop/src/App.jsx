import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import UpgradeModal from './components/UpgradeModal.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import AddContactModal from './components/AddContactModal.jsx';
import IncomingCallBanner from './components/IncomingCallBanner.jsx';
import CallModal from './components/CallModal.jsx';
import {
  initFirebase,
  watchAuthState,
  signOutUser,
  listenToChats,
  listenToMessages,
  sendMessage,
  ensureUserDoc,
  createCallDoc,
  listenForIncomingCalls,
  updateCallStatus,
  markChatRead,
  loadOlderMessages,
  goOnline,
  goOffline,
  setPresence,
  listenToPresence,
  deleteForMe,
  deleteForEveryone,
  pinMessage,
  toggleStar,
  forwardMessage,
} from './firebase.js';
import { getTheme, applyTheme, getAccent, applyAccent, getNotificationsEnabled } from './settings.js';
import { playSend, playReceive, startRing, stopRing } from './sound.js';
import { listenForIncomingDirectTransfers } from './directTransfer.js';

function formatTime(ts) {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function chatDisplayName(chatData, myUid) {
  if (chatData.isGroup) return chatData.groupName || 'Group chat';
  const otherId = Object.keys(chatData.participantNames || {}).find((id) => id !== myUid);
  return chatData.participantNames?.[otherId] || 'Unknown';
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [rawChats, setRawChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [isPro, setIsPro] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null); // { id, type, ...call, isCaller }
  const [windowFocused, setWindowFocused] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Publish our own presence. This is a client-driven approximation (no
  // dedicated presence server), so it goes online on load/focus and flips
  // to offline the moment we know the window is closing or losing focus.
  useEffect(() => {
    if (!user) return;
    setPresence(user.uid, true);
    const onBeforeUnload = () => setPresence(user.uid, false);
    window.addEventListener('beforeunload', onBeforeUnload);
    const onVisibility = () => setPresence(user.uid, document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      setPresence(user.uid, false);
    };
  }, [user]);

  // Live presence (online / last seen) for the other person in a 1:1 chat.
  const [otherPresence, setOtherPresence] = useState(null);
  useEffect(() => {
    const activeChatData = rawChats.find((c) => c.id === activeId);
    if (!activeChatData || activeChatData.isGroup || !user) {
      setOtherPresence(null);
      return;
    }
    const otherId = activeChatData.participantIds.find((id) => id !== user.uid);
    if (!otherId) return;
    let unsub;
    listenToPresence(otherId, setOtherPresence).then((fn) => (unsub = fn));
    return () => unsub && unsub();
  }, [activeId, rawChats, user]);

  const activeIdRef = useRef(null);
  const messageCountRef = useRef({});

  // Reflect real connectivity in the UI and let Firestore know explicitly,
  // so writes queue locally offline and flush the moment we're back.
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); goOnline(); };
    const onOffline = () => { setIsOnline(false); goOffline(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Apply saved theme immediately, before first paint of the app UI
  useEffect(() => {
    applyTheme(getTheme());
    applyAccent(getAccent());
  }, []);

  // Track window focus for desktop notifications
  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    let unsubAuth;
    initFirebase().then(() => {
      watchAuthState(async (u) => {
        if (u) {
          try {
            await ensureUserDoc(u);
          } catch (err) {
            // Don't let a permission hiccup here (e.g. rules not yet
            // deployed) leave the app stuck on the loading screen forever.
            console.error('ensureUserDoc failed:', err);
          }
        }
        setUser(u);
        setReady(true);
      }).then((fn) => (unsubAuth = fn));
    });
    window.soreChatNative?.onUpdateReady?.(() => setUpdateReady(true));
    return () => unsubAuth && unsubAuth();
  }, []);

  // Live chat list
  useEffect(() => {
    if (!user) {
      setChats([]);
      setRawChats([]);
      setChatsLoading(true);
      return;
    }
    let unsub;
    const stuckTimer = setTimeout(() => setChatsLoading(false), 6000);
    listenToChats(user.uid, (chatsData) => {
      clearTimeout(stuckTimer);
      setRawChats(chatsData);
      const formatted = chatsData.map((c) => {
        const lastMs = c.lastMessageAt?.toMillis?.() || 0;
        const readMs = c.readBy?.[user.uid]?.toMillis?.() || 0;
        const isLastMine = c.lastSenderId === user.uid;
        return {
          id: c.id,
          name: chatDisplayName(c, user.uid),
          preview: c.lastMessage || 'Say hello 👋',
          time: formatTime(c.lastMessageAt),
          unread: !isLastMine && lastMs > readMs && lastMs > 0 ? 1 : 0,
          isGroup: !!c.isGroup,
          memberCount: c.participantIds?.length,
          participantNames: c.participantNames,
          participantIds: c.participantIds,
          readBy: c.readBy,
        };
      });
      setChats(formatted);
      setChatsLoading(false);
      if (!activeId && formatted.length > 0) setActiveId(formatted[0].id);
    }).then((fn) => (unsub = fn));
    return () => {
      clearTimeout(stuckTimer);
      unsub && unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live messages for active chat, plus sound/notification side-effects
  useEffect(() => {
    setHasMoreOlder(true);
    if (!activeId) {
      setMessages([]);
      return;
    }
    let unsub;
    let firstSnapshot = true;
    listenToMessages(activeId, (msgs) => {
      const prevCount = messageCountRef.current[activeId] || 0;
      const formatted = msgs.map((m) => ({ ...m, time: formatTime(m.createdAt) }));
      setMessages(formatted);

      // Reconcile optimistic messages once the real ones land
      setPendingMessages((prev) =>
        prev.filter((p) => !formatted.some((m) => m.senderId === p.senderId && m.text === p.text && Math.abs((m.createdAt?.toMillis?.() || 0) - p.createdAtLocal) < 15000))
      );

      if (!firstSnapshot && formatted.length > prevCount) {
        const last = formatted[formatted.length - 1];
        if (last.senderId !== user?.uid) {
          playReceive();
          if (!windowFocused && getNotificationsEnabled() && 'Notification' in window && Notification.permission === 'granted') {
            const chat = chats.find((c) => c.id === activeId);
            new Notification(chat?.name || 'New message', {
              body: last.text || (last.mediaType === 'video' ? '📹 Sent a video' : last.mediaType === 'image' ? '📷 Sent a photo' : 'New message'),
            });
          }
        }
      }
      messageCountRef.current[activeId] = formatted.length;
      firstSnapshot = false;
    }).then((fn) => (unsub = fn));
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, windowFocused]);

  // Mark the open chat as read whenever it changes or new messages arrive
  useEffect(() => {
    if (activeId && user) markChatRead(activeId, user.uid);
  }, [activeId, user, messages.length]);

  // Global listener for incoming calls, regardless of which chat is open
  useEffect(() => {
    if (!user) return;
    let unsub;
    listenForIncomingCalls(user.uid, (call) => {
      if (call && !activeCall) {
        setIncomingCall(call);
        startRing();
      }
      if (!call) {
        setIncomingCall(null);
        stopRing();
      }
    }).then((fn) => (unsub = fn));
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeCall]);

  // Accept incoming direct (peer-to-peer) file transfers globally, so they
  // work even if the sender's file arrives while a different chat is open.
  useEffect(() => {
    if (!user) return;
    let unsub;
    listenForIncomingDirectTransfers(user.uid, () => {
      // Progress callback intentionally minimal for now — the message
      // itself appears once the transfer completes (see logDirectTransferMessage).
    }).then((fn) => (unsub = fn));
    return () => unsub && unsub();
  }, [user]);

  const handleSend = useCallback(
    async ({ text, mediaFile, mediaType, replyToId, replyToText, replyToSender }) => {
      if (!activeId || !user) return;
      playSend();
      if (text) {
        const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setPendingMessages((prev) => [
          ...prev,
          { id: tempId, senderId: user.uid, text, time: 'now', pending: true, createdAtLocal: Date.now(), replyToId, replyToText, replyToSender },
        ]);
      }
      await sendMessage({ chatId: activeId, senderId: user.uid, text, mediaFile, mediaType, replyToId, replyToText, replyToSender });
    },
    [activeId, user]
  );

  const handleLoadOlder = useCallback(async () => {
    if (!activeId || loadingOlder || !hasMoreOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0]?.createdAt;
      const older = await loadOlderMessages(activeId, oldest, 30);
      if (older.length === 0) {
        setHasMoreOlder(false);
      } else {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const merged = older.filter((m) => !existingIds.has(m.id)).map((m) => ({ ...m, time: formatTime(m.createdAt) }));
          return [...merged, ...prev];
        });
        if (older.length < 30) setHasMoreOlder(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [activeId, loadingOlder, hasMoreOlder, messages]);

  const handleDeleteForMe = useCallback(
    (messageId) => activeId && user && deleteForMe(activeId, messageId, user.uid),
    [activeId, user]
  );
  const handleDeleteForEveryone = useCallback(
    (messageId, createdAt) => {
      if (!activeId) return;
      return deleteForEveryone(activeId, messageId, createdAt).catch((err) => {
        window.alert(err.message || 'Could not delete this message for everyone.');
      });
    },
    [activeId]
  );
  const handlePin = useCallback(
    (messageId, pinned) => activeId && pinMessage(activeId, messageId, pinned),
    [activeId]
  );
  const handleStar = useCallback(
    (messageId) => activeId && user && toggleStar(activeId, messageId, user.uid),
    [activeId, user]
  );
  const handleForward = useCallback(
    (toChatId, message) => user && forwardMessage({ toChatId, senderId: user.uid, message }),
    [user]
  );

  const handleStartCall = useCallback(
    async (type) => {
      const chat = rawChats.find((c) => c.id === activeId);
      if (!chat || chat.isGroup) return;
      const calleeId = chat.participantIds.find((id) => id !== user.uid);
      const callId = await createCallDoc({
        callerId: user.uid,
        callerName: user.displayName || user.email,
        calleeId,
        type,
      });
      setActiveCall({ id: callId, type, isCaller: true });
    },
    [rawChats, activeId, user]
  );

  function handleAcceptCall() {
    stopRing();
    setActiveCall({ ...incomingCall, isCaller: false });
    setIncomingCall(null);
  }

  function handleDeclineCall() {
    stopRing();
    updateCallStatus(incomingCall.id, 'declined');
    setIncomingCall(null);
  }

  if (!ready) {
    return <div style={{ height: '100vh', background: 'var(--bg)' }} />;
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />;
  }

  const activeChat = chats.find((c) => c.id === activeId);
  const combinedMessages = [...messages, ...pendingMessages.filter((p) => !messages.some((m) => m.senderId === p.senderId && m.text === p.text))];

  return (
    <div className="app-shell">
      <Sidebar
        chats={chats}
        loading={chatsLoading}
        activeId={activeId}
        onSelect={setActiveId}
        onUpgradeClick={() => setShowUpgrade(true)}
        onAddContact={() => setShowAddContact(true)}
        onSignOut={() => signOutUser()}
        isPro={isPro}
        currentUser={user}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
        {!isOnline && <div className="offline-banner">You're offline — messages will send once you're back online.</div>}
        <ChatWindow
          chat={activeChat}
          messages={combinedMessages}
          onSend={handleSend}
          isPro={isPro}
          onUpgradeClick={() => setShowUpgrade(true)}
          currentUser={user}
          currentUserId={user.uid}
          currentUserName={user.displayName || user.email}
          onStartCall={handleStartCall}
          onLoadOlder={handleLoadOlder}
          hasMoreOlder={hasMoreOlder}
          loadingOlder={loadingOlder}
          isOnline={isOnline}
          otherPresence={otherPresence}
          allChats={chats}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForEveryone={handleDeleteForEveryone}
          onPin={handlePin}
          onStar={handleStar}
          onForward={handleForward}
        />
      </div>
      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          onUpgrade={() => {
            setIsPro(true);
            setShowUpgrade(false);
          }}
        />
      )}
      {showAddContact && (
        <AddContactModal
          currentUser={user}
          onClose={() => setShowAddContact(false)}
          onChatReady={(chatId) => setActiveId(chatId)}
        />
      )}
      {incomingCall && !activeCall && (
        <IncomingCallBanner call={incomingCall} onAccept={handleAcceptCall} onDecline={handleDeclineCall} />
      )}
      {activeCall && (
        <CallModal call={activeCall} isCaller={activeCall.isCaller} onClose={() => setActiveCall(null)} />
      )}
      {updateReady && (
        <div className="update-toast">
          <span>An update just downloaded.</span>
          <button onClick={() => window.soreChatNative.restartAndUpdate()}>Restart now</button>
        </div>
      )}
    </div>
  );
}
