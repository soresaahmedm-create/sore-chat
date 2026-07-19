import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { theme } from '../theme';

function fmt(ms) {
  if (!ms || !isFinite(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function AudioPlayer({ uri }) {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  async function toggle() {
    if (!soundRef.current) {
      const { sound, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onStatusUpdate
      );
      soundRef.current = sound;
      setDuration(status.durationMillis || 0);
      setPlaying(true);
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      if (status.didJustFinish || status.positionMillis >= (status.durationMillis || 0)) {
        await soundRef.current.setPositionAsync(0);
      }
      await soundRef.current.playAsync();
    }
  }

  function onStatusUpdate(status) {
    if (!status.isLoaded) return;
    setPlaying(status.isPlaying);
    setPosition(status.positionMillis || 0);
    if (status.durationMillis) setDuration(status.durationMillis);
    if (status.didJustFinish) setPlaying(false);
  }

  async function seek(e) {
    if (!soundRef.current || !duration) return;
    const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / trackWidth));
    await soundRef.current.setPositionAsync(ratio * duration);
  }

  const pct = duration ? (position / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playBtn} onPress={toggle}>
        <Text style={styles.playIcon}>{playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <Pressable
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onPress={seek}
      >
        <View style={[styles.trackFill, { width: `${pct}%` }]} />
      </Pressable>
      <Text style={styles.time}>{fmt(playing || position ? position : duration)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180, paddingVertical: 2 },
  playBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.signal, alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 12, color: theme.bg },
  track: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: theme.signal, borderRadius: 4 },
  time: { color: theme.textMuted, fontSize: 10.5, minWidth: 30 },
});
