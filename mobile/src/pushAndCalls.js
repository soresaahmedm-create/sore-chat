import messaging from '@react-native-firebase/messaging';
import RNCallKeep from 'react-native-callkeep';
import { registerPushToken, updateCallStatus } from './firebase';
import { CALLKEEP_OPTIONS } from './callkeepOptions';

let initialized = false;
let onAnswerHandler = null;
let onDeclineHandler = null;

export function setCallHandlers({ onAnswer, onDecline }) {
  onAnswerHandler = onAnswer;
  onDeclineHandler = onDecline;
}

export async function initPushAndCallKeep(userId) {
  if (initialized) return;
  initialized = true;

  try {
    await RNCallKeep.setup(CALLKEEP_OPTIONS);
    RNCallKeep.setAvailable(true);
  } catch (err) {
    console.error('CallKeep setup failed (needs a dev build, not Expo Go):', err);
  }

  RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
    onAnswerHandler?.(callUUID);
  });
  RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
    updateCallStatus(callUUID, 'ended').catch(() => {});
    onDeclineHandler?.(callUUID);
  });

  // FCM token registration — this is what the Cloud Function sends the
  // wake-up push to when a call comes in while the app is backgrounded/killed.
  await messaging().requestPermission().catch(() => {});
  const fcmToken = await messaging().getToken().catch(() => null);
  if (fcmToken) registerPushToken(userId, { fcmToken });
  messaging().onTokenRefresh((token) => registerPushToken(userId, { fcmToken: token }));

  // Foreground: the Firestore listenForIncomingCalls listener in App.js
  // already handles this, so nothing extra needed here.
  messaging().onMessage(async () => {});

  // Background/killed: handled by the top-level handler in index.js.
}

export function reportCallEnded(callUUID) {
  RNCallKeep.endCall(callUUID);
}
