// Custom entry point, replacing expo/AppEntry.js, so we can register the
// Firebase Messaging background handler before React (or anything else)
// touches the app. Android requires this handler to be set at the true
// top level of the JS bundle — registering it inside a component's
// useEffect is too late and the handler won't fire when the app is
// killed, only when it's backgrounded.
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import RNCallKeep from 'react-native-callkeep';
import { CALLKEEP_OPTIONS } from './src/callkeepOptions';

// This module-level setup call also covers the "app is fully killed"
// case: Android spins up a separate headless JS context just to run the
// background handler below, which never touches App.js, so CallKeep has
// to be initialized here too, not only inside the React app.
RNCallKeep.setup(CALLKEEP_OPTIONS).catch((err) => {
  console.error('CallKeep setup (background context) failed:', err);
});

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const data = remoteMessage?.data;
  if (data?.type === 'incoming_call') {
    // Google requires the incoming call to be reported to the native
    // call UI synchronously, before any other async work — this is that.
    RNCallKeep.displayIncomingCall(
      data.callId,
      data.callerName || 'Unknown',
      data.callerName || 'Unknown',
      'generic',
      data.callType === 'video'
    );
  }
});

import App from './App';

registerRootComponent(App);
