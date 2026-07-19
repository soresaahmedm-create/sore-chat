import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

const FEATURES = [
  'No ads, ever',
  'Send files & videos up to 2GB (vs 25MB free)',
  'HD video quality on uploads',
  'Custom chat themes',
  'Priority message delivery',
];

export default function UpgradeScreen({ navigation, onUpgrade }) {
  const [plan, setPlan] = useState('monthly');
  const price = plan === 'monthly' ? '$4.99/mo' : '$39.99/yr';

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Sore Chat Pro</Text>
      <Text style={styles.sub}>Faster, cleaner, unlimited.</Text>

      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, plan === 'monthly' && styles.toggleActive]}
          onPress={() => setPlan('monthly')}
        >
          <Text style={[styles.toggleText, plan === 'monthly' && styles.toggleTextActive]}>MONTHLY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, plan === 'yearly' && styles.toggleActive]}
          onPress={() => setPlan('yearly')}
        >
          <Text style={[styles.toggleText, plan === 'yearly' && styles.toggleTextActive]}>YEARLY · SAVE 33%</Text>
        </TouchableOpacity>
      </View>

      {FEATURES.map((f) => (
        <View key={f} style={styles.featureRow}>
          <Text style={{ color: theme.pro }}>✓</Text>
          <Text style={styles.featureText}>{f}</Text>
        </View>
      ))}

      <TouchableOpacity
        style={styles.cta}
        onPress={() => {
          // Wire to react-native-iap (App Store / Play Store billing)
          // or RevenueCat in production. See README.md "Payments".
          onUpgrade?.(plan);
          navigation.goBack();
        }}
      >
        <Text style={styles.ctaText}>Upgrade — {price}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 24, paddingTop: 56 },
  close: { color: theme.textMuted, fontSize: 18, marginBottom: 20 },
  title: { color: theme.text, fontSize: 26, fontWeight: '700' },
  sub: { color: theme.textMuted, fontSize: 14, marginBottom: 24 },
  toggle: { flexDirection: 'row', backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 4, marginBottom: 20 },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 9, alignItems: 'center' },
  toggleActive: { backgroundColor: theme.pro },
  toggleText: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
  toggleTextActive: { color: '#1a0d13' },
  featureRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  featureText: { color: theme.text, fontSize: 14 },
  cta: { marginTop: 20, backgroundColor: theme.pro, padding: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#1a0d13', fontWeight: '700', fontSize: 15 },
});
