import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { theme } from '../theme';
import { signIn, signUp, ensureUserDoc } from '../firebase';

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const user = mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, name.trim());
      await ensureUserDoc(user).catch(() => {});
      onAuthed?.(user);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.pulse} />
          <Text style={styles.brand}>Sore Chat</Text>
        </View>
        <Text style={styles.subtitle}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>

        {mode === 'signup' && (
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={theme.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={theme.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={theme.bg} />
          ) : (
            <Text style={styles.submitText}>{mode === 'signin' ? 'Sign in' : 'Sign up'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setError(''); setMode(mode === 'signin' ? 'signup' : 'signin'); }}>
          <Text style={styles.switchText}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <Text style={{ color: theme.signal, fontWeight: '700' }}>{mode === 'signin' ? 'Sign up' : 'Sign in'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Incorrect email or password.';
  if (code.includes('user-not-found')) return 'No account found with that email.';
  if (code.includes('email-already-in-use')) return 'That email is already registered — try signing in.';
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if (code.includes('network-request-failed')) return "Can't reach the server — check your connection.";
  return err?.message || 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginBottom: 6 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.signal },
  brand: { color: theme.text, fontSize: 26, fontWeight: '700' },
  subtitle: { color: theme.textMuted, textAlign: 'center', marginBottom: 28, fontSize: 14 },
  input: {
    backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: theme.text,
    fontSize: 15, marginBottom: 12,
  },
  error: { color: '#f0637a', fontSize: 13, marginBottom: 8, textAlign: 'center' },
  submitBtn: {
    backgroundColor: theme.signal, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  submitText: { color: theme.bg, fontWeight: '700', fontSize: 15 },
  switchText: { color: theme.textMuted, textAlign: 'center', marginTop: 20, fontSize: 13 },
});
