import React, { useEffect, useRef, useState } from 'react';
import {
  setCallOffer,
  setCallAnswer,
  listenToCallDoc,
  addIceCandidate,
  listenToIceCandidates,
  updateCallStatus,
} from '../firebase.js';
import { playCallConnect, playCallEnd, stopRing } from '../sound.js';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function CallModal({ call, isCaller, onClose }) {
  const localVideoRef = useRef(null);
  const remoteMediaRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [status, setStatus] = useState(isCaller ? 'calling' : 'connecting');
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let unsubCall = () => {};
    let unsubCandidates = () => {};
    let cancelled = false;
    stopRing();

    async function setup() {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      let localStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: call.type === 'video',
        });
      } catch (err) {
        setStatus('error: camera/mic permission denied');
        return;
      }
      if (cancelled) return;
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

      const remoteStream = new MediaStream();
      if (remoteMediaRef.current) remoteMediaRef.current.srcObject = remoteStream;
      pc.ontrack = (e) => {
        e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
      };

      const myRole = isCaller ? 'caller' : 'callee';
      const theirRole = isCaller ? 'callee' : 'caller';

      pc.onicecandidate = (e) => {
        if (e.candidate) addIceCandidate(call.id, myRole, e.candidate);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('connected');
          playCallConnect();
        }
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          setStatus('call ended');
        }
      };

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setCallOffer(call.id, { sdp: offer.sdp, type: offer.type });
      }

      unsubCall = await listenToCallDoc(call.id, async (data) => {
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

      unsubCandidates = await listenToIceCandidates(call.id, theirRole, (candidate) => {
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
    playCallEnd();
    onClose();
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks?.()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    }
  }

  return (
    <div className="modal-overlay">
      <div style={{ width: 480, background: 'var(--surface)', borderRadius: 20, padding: 20, textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
          {status}
        </div>

        {call.type === 'video' ? (
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
            <video ref={remoteMediaRef} autoPlay playsInline style={{ width: '100%', display: 'block', minHeight: 260 }} />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: 110, position: 'absolute', bottom: 12, right: 12, borderRadius: 10, border: '2px solid var(--signal)' }}
            />
          </div>
        ) : (
          <>
            <audio ref={remoteMediaRef} autoPlay />
            <div style={{ padding: '30px 0', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 18 }}>
              🎙️ Audio call
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18 }}>
          <button
            onClick={toggleMute}
            style={{
              width: 46, height: 46, borderRadius: '50%', border: '1px solid var(--border)',
              background: muted ? 'var(--pro-dim)' : 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer', fontSize: 16,
            }}
          >
            {muted ? '🔇' : '🎤'}
          </button>
          <button
            onClick={() => handleClose(true)}
            style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 18 }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
