import {
  createTransferDoc, setTransferOffer, setTransferAnswer, listenToTransferDoc,
  addTransferIceCandidate, listenToTransferIceCandidates, updateTransferStatus,
  logDirectTransferMessage, listenForIncomingTransfers,
} from './firebase.js';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const CHUNK_SIZE = 16 * 1024; // 16KB - safe, widely-supported data channel message size

// Local-only lookup so each device can find the blob it personally sent or
// received. Object URLs can't be shared over the network - each side
// resolves its own copy from its own memory.
const localBlobs = new Map();
export function getLocalTransferBlob(transferId) {
  return localBlobs.get(transferId) || null;
}

export async function sendFileDirect({ chatId, currentUser, toId, file, mediaType, onProgress }) {
  const transferId = await createTransferDoc({
    chatId, fromId: currentUser.uid, fromName: currentUser.displayName || currentUser.email,
    toId, fileName: file.name, fileSize: file.size, mediaType,
  });

  const pc = new RTCPeerConnection(ICE_SERVERS);
  const channel = pc.createDataChannel('file');

  pc.onicecandidate = (e) => {
    if (e.candidate) addTransferIceCandidate(transferId, 'from', e.candidate);
  };

  let unsubDoc, unsubCandidates;
  unsubDoc = await listenToTransferDoc(transferId, async (data) => {
    if (data?.answer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });
  unsubCandidates = await listenToTransferIceCandidates(transferId, 'to', (candidate) => {
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await setTransferOffer(transferId, { sdp: offer.sdp, type: offer.type });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The other person is offline — try the regular 📎 attach instead')), 20000);

    channel.onopen = async () => {
      clearTimeout(timeout);
      try {
        channel.send(JSON.stringify({ type: 'meta', name: file.name, size: file.size, mediaType }));
        const buf = await file.arrayBuffer();
        let offset = 0;
        while (offset < buf.byteLength) {
          if (channel.bufferedAmount > CHUNK_SIZE * 8) {
            await new Promise((r) => setTimeout(r, 20));
            continue;
          }
          const chunk = buf.slice(offset, offset + CHUNK_SIZE);
          channel.send(chunk);
          offset += CHUNK_SIZE;
          onProgress?.(Math.min(1, offset / buf.byteLength));
        }
        channel.send(JSON.stringify({ type: 'end' }));

        localBlobs.set(transferId, URL.createObjectURL(file));
        await logDirectTransferMessage({ chatId, senderId: currentUser.uid, fileName: file.name, mediaType, transferId });
        await updateTransferStatus(transferId, 'done');
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        unsubDoc?.();
        unsubCandidates?.();
        setTimeout(() => pc.close(), 2000);
      }
    };

    channel.onerror = (e) => {
      clearTimeout(timeout);
      reject(new Error('Direct transfer failed'));
    };
  });
}

// Global listener: call once per signed-in session. Auto-accepts incoming
// direct transfers (no camera/mic involved, so no permission prompt needed)
// and reconstructs the file once fully received.
export async function listenForIncomingDirectTransfers(userId, onProgress) {
  return listenForIncomingTransfers(userId, (transfers) => {
    transfers.forEach((t) => acceptIncomingTransfer(t, onProgress));
  });
}

const handledTransfers = new Set();

async function acceptIncomingTransfer(transfer, onProgress) {
  if (handledTransfers.has(transfer.id) || !transfer.offer) return;
  handledTransfers.add(transfer.id);

  const pc = new RTCPeerConnection(ICE_SERVERS);
  const chunks = [];
  let receivedBytes = 0;

  pc.onicecandidate = (e) => {
    if (e.candidate) addTransferIceCandidate(transfer.id, 'to', e.candidate);
  };

  pc.ondatachannel = (event) => {
    const channel = event.channel;
    channel.onmessage = async (msgEvent) => {
      if (typeof msgEvent.data === 'string') {
        const control = JSON.parse(msgEvent.data);
        if (control.type === 'end') {
          const blob = new Blob(chunks, { type: transfer.mediaType === 'video' ? 'video/mp4' : 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          localBlobs.set(transfer.id, url);
          await updateTransferStatus(transfer.id, 'done');
          setTimeout(() => pc.close(), 2000);
        }
        return;
      }
      chunks.push(msgEvent.data);
      receivedBytes += msgEvent.data.byteLength || 0;
      onProgress?.(transfer, receivedBytes / (transfer.fileSize || 1));
    };
  };

  await pc.setRemoteDescription(new RTCSessionDescription(transfer.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await setTransferAnswer(transfer.id, { sdp: answer.sdp, type: answer.type });

  listenToTransferIceCandidates(transfer.id, 'from', (candidate) => {
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  });
}
