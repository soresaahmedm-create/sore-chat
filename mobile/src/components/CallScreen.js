import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
} from 'react-native-webrtc';
import { theme } from '../theme';
import {
  setCallOffer, setCallAnswer, listenToCallDoc, addIceCandidate, listenToIceCandidates, updateCallStatus,
} from '../firebase';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Same signaling contract as desktop/src/components/CallModal.jsx — this
// screen can complete a call with either a desktop or another mobile peer.
export default function CallScreen({ call, isCaller, onClose }) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState(isCaller ? 'calling…' : 'connecting…');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    let unsubCall = () => {};
    let unsubCandidates = () => {};
    let cancelled = false;

    async function setup() {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      let stream;
      try {
        stream = await mediaDevices.getUserMedia({
          audio: true,
          video: call.type === 'video' ? { facingMode: 'user' } : false,
        });
      } catch (err) {
        setStatus('camera/mic permission denied');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.ontrack = (e) => {
        setRemoteStream(e.streams[0]);
      };

      const myRole = isCaller ? 'caller' : 'callee';
      const theirRole = isCaller ? 'callee' : 'caller';

      pc.onicecandidate = (e) => {
        if (e.candidate) addIceCandidate(call.id, myRole, e.candidate);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected');
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) setStatus('call ended');
      };

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setCallOffer(call.id, { sdp: offer.sdp, type: offer.type });
      }

      unsubCall = listenToCallDoc(call.id, async (data) => {
        if (!data || cancelled) return;
        if (isCaller && data.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        if (!isCaller && data.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await setCallAnswer(call.id, { sdp: answer.sdp, type: answer.type });
        }
        if (data.status === 'ended' || data.status === 'declined') {
          handleClose(false);
        }
      });

      unsubCandidates = listenToIceCandidates(call.id, theirRole, (candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      });
    }

    setup();

    return () => {
      cancelled = true;
      unsubCall();
      unsubCandidates();
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose(updateRemote = true) {
    if (updateRemote) updateCallStatus(call.id, 'ended');
    onClose();
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks?.()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    }
  }

  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks?.()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraOff(!track.enabled);
    }
  }

  function flipCamera() {
    const track = localStreamRef.current?.getVideoTracks?.()[0];
    track?._switchCamera?.();
  }

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={() => handleClose(true)}>
      <View style={styles.container}>
        <Text style={styles.status}>{status}</Text>

        {call.type === 'video' ? (
          <View style={styles.videoArea}>
            {remoteStream ? (
              <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />
            ) : (
              <View style={[styles.remoteVideo, styles.center]}>
                <Text style={styles.waitingText}>Waiting for {call.callerName || 'the other person'}…</Text>
              </View>
            )}
            {localStream && !cameraOff && (
              <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" mirror zOrder={1} />
            )}
          </View>
        ) : (
          <View style={[styles.center, { flex: 1 }]}>
            <Text style={styles.audioIcon}>🎙️</Text>
            <Text style={styles.audioLabel}>Audio call</Text>
          </View>
        )}

        <View style={styles.controls}>
          <TouchableOpacity style={[styles.controlBtn, muted && styles.controlBtnActive]} onPress={toggleMute}>
            <Text style={styles.controlIcon}>{muted ? '🔇' : '🎤'}</Text>
          </TouchableOpacity>
          {call.type === 'video' && (
            <>
              <TouchableOpacity style={[styles.controlBtn, cameraOff && styles.controlBtnActive]} onPress={toggleCamera}>
                <Text style={styles.controlIcon}>{cameraOff ? '📷' : '🎥'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlBtn} onPress={flipCamera}>
                <Text style={styles.controlIcon}>🔄</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.endBtn} onPress={() => handleClose(true)}>
            <Text style={styles.controlIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: 50, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center' },
  status: { color: theme.textMuted, textAlign: 'center', fontSize: 12.5, marginBottom: 10 },
  videoArea: { flex: 1, position: 'relative' },
  remoteVideo: { flex: 1, backgroundColor: '#000' },
  localVideo: { position: 'absolute', width: 110, height: 150, bottom: 16, right: 16, borderRadius: 12, borderWidth: 2, borderColor: theme.signal },
  waitingText: { color: theme.textMuted, fontSize: 13 },
  audioIcon: { fontSize: 56, marginBottom: 12 },
  audioLabel: { color: theme.text, fontSize: 18, fontWeight: '600' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 20 },
  controlBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  controlBtnActive: { backgroundColor: theme.proDim },
  endBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' },
  controlIcon: { fontSize: 20 },
});
