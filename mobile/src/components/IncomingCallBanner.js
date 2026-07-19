import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { theme } from '../theme';

export default function IncomingCallBanner({ call, onAccept, onDecline }) {
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(call.callerName || '?').slice(0, 1).toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Incoming {call.type === 'video' ? 'video' : 'audio'} call</Text>
          <Text style={styles.name}>{call.callerName || 'Someone'}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
              <Text style={styles.actionIcon}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
              <Text style={styles.actionIcon}>✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 300, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.signal, borderRadius: 20, padding: 26, alignItems: 'center' },
  avatarWrap: { marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.signal, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.bg, fontSize: 26, fontWeight: '700' },
  subtitle: { color: theme.textMuted, fontSize: 12.5, marginBottom: 4 },
  name: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 22 },
  actions: { flexDirection: 'row', gap: 20 },
  declineBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' },
  acceptBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.signal, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 22, color: theme.bg, fontWeight: '700' },
});
