import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../theme';
import { findOrCreateChatWithEmail } from '../firebase';

export default function AddContactScreen({ navigation, user }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!email.trim()) return;
    setError('');
    setLoading(true);
    try {
      const chatId = await findOrCreateChatWithEmail(user, email.trim());
      navigation.replace('Chat', { chatId });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Add a contact</Text>
      <Text style={styles.sub}>Enter the email they signed up to Sore Chat with.</Text>
      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor={theme.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoFocus
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.cta} onPress={handleAdd} disabled={loading}>
        {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={styles.ctaText}>Start chat</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 24, paddingTop: 56 },
  close: { color: theme.textMuted, fontSize: 18, marginBottom: 20 },
  title: { color: theme.text, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sub: { color: theme.textMuted, fontSize: 13, marginBottom: 20 },
  input: {
    backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    padding: 14, color: theme.text, fontSize: 15, marginBottom: 10,
  },
  error: { color: theme.danger, fontSize: 13, marginBottom: 10 },
  cta: { backgroundColor: theme.signal, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  ctaText: { color: theme.bg, fontWeight: '700', fontSize: 15 },
});
