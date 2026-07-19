import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, Modal, ActivityIndicator, Image, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { theme } from '../theme';
import AudioPlayer from '../components/AudioPlayer';
import {
  listenToMessages, sendMessage, markChatRead, loadOlderMessages, cacheGet, deserializeFromCache,
  listenToPresence, listenToTyping, setTypingStatus, clearTypingStatus,
  pinMessage, toggleStar, deleteForMe, deleteForEveryone, forwardMessage, listenToChats, chatDisplayName,
} from '../firebase';
import { enqueueMessage, getOutbox } from '../offlineQueue';

function formatTime(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return '';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mediaLabel(mediaType) {
  if (mediaType === 'video') return '📹 Video';
  if (mediaType === 'image') return '📷 Photo';
  if (mediaType === 'audio') return '🎤 Voice message';
  return 'Attachment';
}

export default function ChatScreen({ route, navigation, user, isOnline, onStartCall }) {
  const { chatId, chat: chatParam } = route.params;
  const [chat, setChat] = useState(chatParam || null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [actionMsg, setActionMsg] = useState(null); // message currently showing the action sheet
  const [otherPresence, setOtherPresence] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [allChats, setAllChats] = useState([]);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordingRef = useRef(null);
  const recordTimerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Show anything still sitting in the offline outbox for this chat as
  // pending bubbles, so the user sees their message immediately instead of
  // wondering if it disappeared.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const outbox = await getOutbox();
      if (!cancelled) setQueuedMessages(outbox.filter((o) => o.chatId === chatId));
    }
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatId]);

  useEffect(() => {
    let cancelled = false;
    cacheGet(`messages:${chatId}`).then((cached) => {
      if (cancelled || !cached) return;
      setMessages(cached.map(deserializeFromCache));
      setLoading(false);
    });
    const unsub = listenToMessages(chatId, (msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [chatId]);

  useEffect(() => {
    if (chatId && user) markChatRead(chatId, user.uid);
  }, [chatId, user, messages.length]);

  useEffect(() => {
    if (!chat || chat.isGroup) return;
    const otherId = chat.participantIds?.find((id) => id !== user.uid);
    if (!otherId) return;
    const unsub = listenToPresence(otherId, setOtherPresence);
    return unsub;
  }, [chat, user.uid]);

  useEffect(() => {
    const unsub = listenToTyping(chatId, (typers) => {
      setTypingUsers(typers.filter((t) => t.id !== user.uid).map((t) => t.name));
    });
    return unsub;
  }, [chatId, user.uid]);

  // For the forward picker, and to fill in `chat` if we navigated in
  // without the full chat object (e.g. a future deep link).
  useEffect(() => {
    const unsub = listenToChats(user.uid, (chatsData) => {
      setAllChats(chatsData.map((c) => ({ id: c.id, name: chatDisplayName(c, user.uid) })));
      if (!chat) {
        const found = chatsData.find((c) => c.id === chatId);
        if (found) {
          setChat({
            id: found.id,
            name: chatDisplayName(found, user.uid),
            isGroup: !!found.isGroup,
            participantIds: found.participantIds,
            participantNames: found.participantNames,
            memberCount: found.participantIds?.length,
          });
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  const visibleMessages = useMemo(() => {
    const real = messages.filter((m) => !m.deletedFor?.includes(user.uid));
    const stillQueued = queuedMessages
      .filter((q) => !real.some((m) => m.senderId === q.senderId && m.text === q.text))
      .map((q) => ({ id: q.localId, senderId: q.senderId, text: q.text, pending: true, createdAt: null }));
    return [...real, ...stillQueued];
  }, [messages, queuedMessages, user.uid]);
  const pinned = useMemo(() => visibleMessages.filter((m) => m.pinned), [visibleMessages]);
  // FlatList is inverted for perf (renders/scrolls from the bottom without
  // us managing scroll position manually), so the data needs reversing.
  const inverted = useMemo(() => [...visibleMessages].reverse(), [visibleMessages]);

  function handleTextChange(val) {
    setText(val);
    if (!chatId) return;
    setTypingStatus(chatId, user.uid, user.displayName || user.email);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => clearTypingStatus(chatId, user.uid), 2500);
  }

  async function handleSend() {
    if (!text.trim()) return;
    const payload = {
      chatId,
      senderId: user.uid,
      text: text.trim(),
      replyToId: replyTo?.id || null,
      replyToText: replyTo?.text || (replyTo?.mediaType ? mediaLabel(replyTo.mediaType) : null),
      replyToSender: replyTo
        ? (replyTo.senderId === user.uid ? 'You' : (chat?.isGroup ? chat.participantNames?.[replyTo.senderId] : chat?.name))
        : null,
    };
    setText('');
    setReplyTo(null);
    clearTypingStatus(chatId, user.uid);
    if (!isOnline) {
      // No connection right now — queue it durably (survives an app kill)
      // instead of firing a Firestore write that would just hang/fail.
      const item = await enqueueMessage(payload);
      setQueuedMessages((prev) => [...prev, item]);
      return;
    }
    try {
      await sendMessage(payload);
    } catch (err) {
      // A write can still fail after we thought we were online (e.g. flaky
      // connection) — fall back to the durable queue rather than losing it.
      const item = await enqueueMessage(payload);
      setQueuedMessages((prev) => [...prev, item]);
    }
  }

  async function handleLoadOlder() {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0]?.createdAt;
      const older = await loadOlderMessages(chatId, oldest, 30);
      if (older.length === 0) setHasMoreOlder(false);
      else {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !ids.has(m.id)), ...prev];
        });
        if (older.length < 30) setHasMoreOlder(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone permission needed', 'Enable microphone access in Settings to record voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      Alert.alert('Could not start recording', err.message || 'Please try again.');
    }
  }

  async function stopRecording(send) {
    const recording = recordingRef.current;
    if (!recording) return;
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    setRecordSeconds(0);
    recordingRef.current = null;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (send) {
        const uri = recording.getURI();
        await sendMessage({ chatId, senderId: user.uid, mediaUri: uri, mediaType: 'audio' });
      }
    } catch (err) {
      if (send) Alert.alert('Voice message not sent', err.message || 'Please try again.');
    }
  }

  useEffect(() => () => clearInterval(recordTimerRef.current), []);

  function openActions(m) {
    setActionMsg(m);
  }

  async function handleAction(action) {
    const m = actionMsg;
    setActionMsg(null);
    if (!m) return;
    switch (action) {
      case 'reply':
        setReplyTo(m);
        break;
      case 'copy':
        if (m.text) Clipboard.setStringAsync(m.text);
        break;
      case 'star':
        toggleStar(chatId, m.id, user.uid);
        break;
      case 'pin':
        pinMessage(chatId, m.id, !m.pinned);
        break;
      case 'forward':
        setForwardTarget(m);
        break;
      case 'deleteForMe':
        deleteForMe(chatId, m.id, user.uid);
        break;
      case 'deleteForEveryone':
        try {
          await deleteForEveryone(chatId, m.id, m.createdAt);
        } catch (err) {
          Alert.alert('Could not delete', err.message);
        }
        break;
    }
  }

  if (loading && messages.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.signal} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>{chat?.name || '...'}</Text>
          <Text style={styles.headerStatus}>
            {typingUsers.length > 0
              ? `${typingUsers.join(', ')} typing…`
              : chat?.isGroup
                ? `${chat.memberCount || ''} members`
                : otherPresence?.online
                  ? 'online'
                  : otherPresence?.lastSeen
                    ? `last seen ${formatLastSeen(otherPresence.lastSeen)}`
                    : ''}
          </Text>
        </View>
        {!chat?.isGroup && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity
              style={styles.headerCallBtn}
              onPress={() => {
                const otherId = chat?.participantIds?.find((id) => id !== user.uid);
                if (otherId) onStartCall?.(otherId, chat.name, 'audio');
              }}
            >
              <Text style={styles.headerCallIcon}>📞</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerCallBtn}
              onPress={() => {
                const otherId = chat?.participantIds?.find((id) => id !== user.uid);
                if (otherId) onStartCall?.(otherId, chat.name, 'video');
              }}
            >
              <Text style={styles.headerCallIcon}>🎥</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Offline — messages will send once you're back online.</Text>
        </View>
      )}

      {pinned.length > 0 && (
        <View style={styles.pinnedBar}>
          <Text style={styles.pinnedText} numberOfLines={1}>📌 {pinned[pinned.length - 1].text || 'Pinned attachment'}</Text>
        </View>
      )}

      <FlatList
        data={inverted}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14 }}
        onEndReached={handleLoadOlder}
        onEndReachedThreshold={0.3}
        ListFooterComponent={hasMoreOlder && loadingOlder ? <ActivityIndicator color={theme.signal} style={{ marginVertical: 10 }} /> : null}
        renderItem={({ item: m }) => {
          const isMine = m.senderId === user.uid;
          const isStarred = m.starredBy?.includes(user.uid);
          if (m.deletedForEveryone) {
            return (
              <View style={[styles.bubbleRow, isMine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, styles.deletedBubble]}>
                  <Text style={styles.deletedText}>🚫 This message was deleted</Text>
                </View>
              </View>
            );
          }
          return (
            <TouchableOpacity
              style={[styles.bubbleRow, isMine ? styles.rowMine : styles.rowTheirs]}
              onLongPress={() => openActions(m)}
              activeOpacity={0.8}
            >
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {(m.pinned || isStarred) && (
                  <Text style={styles.badgeRow}>{m.pinned ? '📌 Pinned  ' : ''}{isStarred ? '★ Starred' : ''}</Text>
                )}
                {m.forwardedFrom && <Text style={styles.forwardedLabel}>↪️ Forwarded</Text>}
                {m.replyToId && (
                  <View style={styles.quoteBox}>
                    <Text style={styles.quoteText} numberOfLines={1}>{m.replyToSender ? `${m.replyToSender}: ` : ''}{m.replyToText || 'Attachment'}</Text>
                  </View>
                )}
                {m.mediaUrl && m.mediaType === 'image' && (
                  <Image source={{ uri: m.mediaUrl }} style={styles.media} />
                )}
                {m.mediaUrl && m.mediaType === 'audio' && <AudioPlayer uri={m.mediaUrl} />}
                {m.text ? <Text style={styles.bubbleText}>{m.text}</Text> : null}
                <View style={styles.bubbleMeta}>
                  {m.edited && <Text style={styles.editedTag}>edited </Text>}
                  <Text style={styles.timeText}>{formatTime(m.createdAt)}</Text>
                  {isMine && <Text style={styles.tick}>{m.pending ? '🕐' : '✓✓'}</Text>}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {replyTo && (
        <View style={styles.replyPreview}>
          <Text style={styles.replyPreviewText} numberOfLines={1}>
            Replying: {replyTo.text || mediaLabel(replyTo.mediaType)}
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={styles.replyClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.composer}>
        {isRecording ? (
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>
              {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}
            </Text>
            <Text style={styles.recordingHint}>Recording…</Text>
            <TouchableOpacity onPress={() => stopRecording(false)}>
              <Text style={styles.recordingCancel}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TextInput
            style={styles.composerInput}
            placeholder={isOnline ? 'Message' : 'Message (sends when back online)'}
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={handleTextChange}
            multiline
          />
        )}
        {isRecording ? (
          <TouchableOpacity style={styles.sendBtn} onPress={() => stopRecording(true)}>
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        ) : text.trim() ? (
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.sendBtn} onPress={startRecording}>
            <Text style={styles.sendBtnText}>🎤</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Long-press action sheet */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setActionMsg(null)}>
          <View style={styles.actionSheet}>
            <ActionItem label="↩️ Reply" onPress={() => handleAction('reply')} />
            {actionMsg?.text && <ActionItem label="📋 Copy" onPress={() => handleAction('copy')} />}
            <ActionItem label={actionMsg?.starredBy?.includes(user.uid) ? '★ Unstar' : '☆ Star'} onPress={() => handleAction('star')} />
            <ActionItem label={actionMsg?.pinned ? '📌 Unpin' : '📌 Pin'} onPress={() => handleAction('pin')} />
            <ActionItem label="↪️ Forward" onPress={() => handleAction('forward')} />
            <ActionItem label="🗑️ Delete for me" onPress={() => handleAction('deleteForMe')} danger />
            {actionMsg?.senderId === user.uid && (
              <ActionItem label="🗑️ Delete for everyone" onPress={() => handleAction('deleteForEveryone')} danger />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward target picker */}
      <Modal visible={!!forwardTarget} transparent animationType="fade" onRequestClose={() => setForwardTarget(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setForwardTarget(null)}>
          <View style={styles.actionSheet}>
            <Text style={styles.sheetTitle}>Forward to…</Text>
            {allChats.filter((c) => c.id !== chatId).map((c) => (
              <ActionItem
                key={c.id}
                label={c.name}
                onPress={async () => {
                  await forwardMessage({
                    toChatId: c.id,
                    senderId: user.uid,
                    message: { ...forwardTarget, forwardedFrom: forwardTarget.senderId === user.uid ? 'You' : chat?.name },
                  });
                  setForwardTarget(null);
                }}
              />
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ActionItem({ label, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.actionItem} onPress={onPress}>
      <Text style={[styles.actionItemText, danger && { color: theme.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12,
    paddingTop: 54, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  back: { color: theme.signal, fontSize: 30, paddingHorizontal: 4 },
  headerName: { color: theme.text, fontWeight: '700', fontSize: 16 },
  headerStatus: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  headerCallBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerCallIcon: { fontSize: 18 },
  offlineBanner: { backgroundColor: theme.proDim, paddingVertical: 5, alignItems: 'center' },
  offlineText: { color: theme.pro, fontSize: 11.5 },
  pinnedBar: { paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface },
  pinnedText: { color: theme.text, fontSize: 12.5 },
  bubbleRow: { marginVertical: 3, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: theme.signalDim, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: theme.surfaceRaised, borderBottomLeftRadius: 4 },
  deletedBubble: { backgroundColor: theme.surfaceRaised },
  deletedText: { color: theme.textMuted, fontStyle: 'italic', fontSize: 13 },
  badgeRow: { color: theme.textMuted, fontSize: 10.5, marginBottom: 2 },
  forwardedLabel: { color: theme.textMuted, fontSize: 11, fontStyle: 'italic', marginBottom: 2 },
  quoteBox: { borderLeftWidth: 2, borderLeftColor: theme.signal, paddingLeft: 8, marginBottom: 4 },
  quoteText: { color: theme.textMuted, fontSize: 12 },
  media: { width: 200, height: 200, borderRadius: 10, marginBottom: 4 },
  bubbleText: { color: theme.text, fontSize: 15, lineHeight: 20 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, alignSelf: 'flex-end' },
  editedTag: { color: theme.textMuted, fontSize: 10, fontStyle: 'italic' },
  timeText: { color: theme.textMuted, fontSize: 10 },
  tick: { color: theme.textMuted, fontSize: 11 },
  replyPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderLeftWidth: 3, borderLeftColor: theme.signal,
    backgroundColor: theme.surfaceRaised, borderRadius: 8,
  },
  replyPreviewText: { flex: 1, color: theme.textMuted, fontSize: 12 },
  replyClose: { color: theme.textMuted, fontSize: 14 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10,
    borderTopWidth: 1, borderTopColor: theme.border, paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  composerInput: {
    flex: 1, backgroundColor: theme.surfaceRaised, borderRadius: 20, borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 10, color: theme.text, fontSize: 15, maxHeight: 120,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.signal, alignItems: 'center', justifyContent: 'center' },
  recordingBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border,
    borderRadius: 20, paddingHorizontal: 14, height: 42,
  },
  recordingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.danger },
  recordingTime: { color: theme.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  recordingHint: { flex: 1, color: theme.textMuted, fontSize: 12.5 },
  recordingCancel: { fontSize: 15 },
  sendBtnText: { color: theme.bg, fontSize: 17, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: theme.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 10, paddingBottom: 28 },
  sheetTitle: { color: theme.textMuted, fontSize: 12, padding: 10 },
  actionItem: { paddingVertical: 13, paddingHorizontal: 14 },
  actionItemText: { color: theme.text, fontSize: 15 },
});
