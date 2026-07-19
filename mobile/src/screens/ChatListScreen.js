import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { theme } from '../theme';
import { listenToChats, chatDisplayName, cacheGet, deserializeFromCache, signOutUser } from '../firebase';

function formatTime(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatChats(chatsData, myUid) {
  return chatsData.map((c) => {
    const lastMs = c.lastMessageAt?.toMillis?.() || 0;
    const readMs = c.readBy?.[myUid]?.toMillis?.() || 0;
    const isLastMine = c.lastSenderId === myUid;
    return {
      id: c.id,
      name: chatDisplayName(c, myUid),
      preview: c.lastMessage || 'Say hello 👋',
      time: formatTime(c.lastMessageAt),
      unread: !isLastMine && lastMs > readMs && lastMs > 0,
      isGroup: !!c.isGroup,
      memberCount: c.participantIds?.length,
      participantNames: c.participantNames,
      participantIds: c.participantIds,
      readBy: c.readBy,
    };
  });
}

export default function ChatListScreen({ navigation, isPro, user, isOnline }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const unsubRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    // Paint instantly from the last-known snapshot (works even fully offline
    // on a cold start), then let the live listener take over and refine it.
    cacheGet(`chats:${user.uid}`).then((cached) => {
      if (cancelled || !cached) return;
      const revived = cached.map(deserializeFromCache);
      setChats(formatChats(revived, user.uid));
      setFromCache(true);
      setLoading(false);
    });

    const stuckTimer = setTimeout(() => setLoading(false), 6000);
    unsubRef.current = listenToChats(user.uid, (chatsData) => {
      if (cancelled) return;
      clearTimeout(stuckTimer);
      setChats(formatChats(chatsData, user.uid));
      setFromCache(false);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(stuckTimer);
      unsubRef.current && unsubRef.current();
    };
  }, [user.uid]);

  const onRefresh = useCallback(() => {
    // The Firestore listener is already always live; this just gives users
    // the familiar pull-to-refresh affordance and a moment of feedback.
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.pulse, { backgroundColor: isOnline ? theme.signal : theme.textMuted }]} />
          <Text style={styles.brand}>Sore Chat</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {!isPro && (
            <TouchableOpacity style={styles.upgradePill} onPress={() => navigation.navigate('Upgrade')}>
              <Text style={styles.upgradeText}>↑ Pro</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('AddContact')}>
            <Text style={styles.addBtn}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signOutUser()}>
            <Text style={styles.signOutBtn}>⎋</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You're offline — showing last saved chats.</Text>
        </View>
      )}

      {loading && chats.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.signal} />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>No chats yet — tap ＋ to add a contact by email.</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={theme.signal} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatItem}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('Chat', { chatId: item.id, chat: item })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.chatTop}>
                  <Text style={[styles.chatName, item.unread && styles.chatNameUnread]} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.chatTime}>{item.time}</Text>
                </View>
                <Text style={[styles.chatPreview, item.unread && styles.chatPreviewUnread]} numberOfLines={1}>{item.preview}</Text>
              </View>
              {item.unread ? <View style={styles.unreadDot} /> : null}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingTop: 56 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4 },
  brand: { color: theme.text, fontSize: 20, fontWeight: '700' },
  upgradePill: { borderWidth: 1, borderColor: theme.pro, backgroundColor: theme.proDim, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  upgradeText: { color: theme.pro, fontSize: 11, fontWeight: '600' },
  addBtn: { color: theme.signal, fontSize: 24, fontWeight: '700', paddingHorizontal: 4 },
  signOutBtn: { color: theme.textMuted, fontSize: 20, paddingHorizontal: 4 },
  offlineBanner: { backgroundColor: theme.proDim, paddingVertical: 6, alignItems: 'center' },
  offlineText: { color: theme.pro, fontSize: 12 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyText: { color: theme.textMuted, textAlign: 'center', fontSize: 13 },
  chatItem: { flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.signal, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.bg, fontWeight: '700' },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between' },
  chatName: { color: theme.text, fontWeight: '600', fontSize: 15, flexShrink: 1 },
  chatNameUnread: { fontWeight: '800' },
  chatTime: { color: theme.textMuted, fontSize: 11 },
  chatPreview: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  chatPreviewUnread: { color: theme.text, fontWeight: '600' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.signal },
});
