const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Sends a push notification to the other participant whenever a new
// message is written. Requires each user doc to store an fcmToken
// (captured client-side via Firebase Messaging / Expo push tokens).
exports.onNewMessage = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const { chatId } = context.params;

    const chatDoc = await admin.firestore().doc(`chats/${chatId}`).get();
    const participantIds = chatDoc.data().participantIds || [];
    const recipientId = participantIds.find((id) => id !== message.senderId);
    if (!recipientId) return null;

    const userDoc = await admin.firestore().doc(`users/${recipientId}`).get();
    const token = userDoc.data()?.fcmToken;
    if (!token) return null;

    const body = message.text || (message.mediaType === 'video' ? '📹 Sent a video' : '📷 Sent a photo');

    return admin.messaging().send({
      token,
      notification: { title: 'New message', body },
      data: { chatId },
    });
  });

// Example Stripe webhook stub for the desktop app's Pro subscription.
// Deploy behind a real Stripe account; on 'checkout.session.completed'
// set a custom claim so Storage/Firestore rules can grant Pro limits.
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  // TODO: verify req against your Stripe webhook signing secret
  const event = req.body;

  if (event.type === 'checkout.session.completed') {
    const uid = event.data.object.client_reference_id;
    if (uid) {
      await admin.auth().setCustomUserClaims(uid, { pro: true });
      await admin.firestore().doc(`users/${uid}`).set({ isPro: true }, { merge: true });
    }
  }

  res.status(200).send('ok');
});

// ---------- Calls: wake the callee's Android app to ring, even backgrounded/killed ----------
// A high-priority FCM data message wakes the app in the background, which
// then calls RNCallKeep.displayIncomingCall via the handler in mobile/index.js.
exports.onIncomingCall = functions.firestore
  .document('calls/{callId}')
  .onCreate(async (snap, context) => {
    const call = snap.data();
    const { callId } = context.params;
    if (!call.calleeId) return null;

    const calleeDoc = await admin.firestore().doc(`users/${call.calleeId}`).get();
    const fcmToken = calleeDoc.data()?.fcmToken;
    if (!fcmToken) {
      console.warn(`No push token for callee ${call.calleeId} — call only rings if their app is already open.`);
      return null;
    }

    return admin.messaging().send({
      token: fcmToken,
      android: { priority: 'high' },
      data: {
        type: 'incoming_call',
        callId,
        callerName: call.callerName || 'Unknown',
        callType: call.type || 'audio',
      },
    }).catch((err) => console.error('FCM call push failed:', err));
  });
