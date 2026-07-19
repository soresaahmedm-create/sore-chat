import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { theme } from './src/theme';
import { watchAuthState, ensureUserDoc, setPresence, listenForIncomingCalls, createCallDoc, updateCallStatus, getCallOnce } from './src/firebase';
import { flushOutbox } from './src/offlineQueue';
import { initPushAndCallKeep, setCallHandlers, reportCallEnded } from './src/pushAndCalls';
import IncomingCallBanner from './src/components/IncomingCallBanner';
import CallScreen from './src/components/CallScreen';
import AuthScreen from './src/screens/AuthScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatScreen from './src/screens/ChatScreen';
import AddContactScreen from './src/screens/AddContactScreen';
import UpgradeScreen from './src/screens/UpgradeScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  dark: true,
  colors: {
    primary: theme.signal,
    background: theme.bg,
    card: theme.surface,
    text: theme.text,
    border: theme.border,
    notification: theme.signal,
  },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsub = watchAuthState(async (u) => {
      if (u) {
        try {
          await ensureUserDoc(u);
        } catch (err) {
          console.error('ensureUserDoc failed:', err);
        }
      }
      setUser(u);
      setReady(true);
    });
    return unsub;
  }, []);

  // Real connectivity (not just navigator.onLine, which doesn't exist on
  // native) drives the offline banner and lets us mark presence accurately.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const nowOnline = !!state.isConnected;
      setIsOnline((wasOnline) => {
        if (nowOnline && !wasOnline) flushOutbox();
        return nowOnline;
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    setPresence(user.uid, isOnline);
  }, [user, isOnline]);

  useEffect(() => {
    if (user && isOnline) flushOutbox();
  }, [user, isOnline]);

  // Global incoming-call listener — lives at the app root (not inside a
  // single screen) so a call rings no matter which screen you're on while
  // the app is open. Background/killed-state ringing is handled separately
  // below via initPushAndCallKeep (native push -> CallKit/ConnectionService).
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null); // { call, isCaller }

  useEffect(() => {
    if (!user) return;
    const unsub = listenForIncomingCalls(user.uid, (call) => {
      if (call && !activeCall) setIncomingCall(call);
      if (!call) setIncomingCall(null);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Register push/VoIP tokens and set up native CallKit / ConnectionService
  // handling. This is what lets a call ring when the app is backgrounded
  // or fully killed — the Firestore listener above only covers the
  // "app is open" case.
  useEffect(() => {
    if (!user) return;
    initPushAndCallKeep(user.uid);
    setCallHandlers({
      onAnswer: async (callUUID) => {
        const call = await getCallOnce(callUUID);
        if (call) {
          setActiveCall({ call, isCaller: false });
          setIncomingCall(null);
        }
      },
      onDecline: (callUUID) => {
        setIncomingCall((current) => (current?.id === callUUID ? null : current));
        setActiveCall((current) => (current?.call?.id === callUUID ? null : current));
      },
    });
  }, [user]);

  async function handleStartCall(otherUserId, otherUserName, type) {
    if (!user) return;
    const callId = await createCallDoc({
      callerId: user.uid,
      callerName: user.displayName || user.email,
      calleeId: otherUserId,
      type,
    });
    setActiveCall({ call: { id: callId, callerName: user.displayName || user.email, type }, isCaller: true });
  }

  function handleAcceptCall() {
    setActiveCall({ call: incomingCall, isCaller: false });
    setIncomingCall(null);
  }

  function handleDeclineCall() {
    if (incomingCall) {
      updateCallStatus(incomingCall.id, 'declined');
      reportCallEnded(incomingCall.id);
    }
    setIncomingCall(null);
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.signal} />
      </View>
    );
  }

  if (!user) {
    return (
      <NavigationContainer theme={navTheme}>
        <AuthScreen />
      </NavigationContainer>
    );
  }

  return (
    <>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="ChatList">
            {(props) => <ChatListScreen {...props} user={user} isPro={isPro} isOnline={isOnline} />}
          </Stack.Screen>
          <Stack.Screen name="Chat">
            {(props) => (
              <ChatScreen {...props} user={user} isPro={isPro} isOnline={isOnline} onStartCall={handleStartCall} />
            )}
          </Stack.Screen>
          <Stack.Screen name="AddContact">
            {(props) => <AddContactScreen {...props} user={user} />}
          </Stack.Screen>
          <Stack.Screen name="Upgrade" options={{ presentation: 'modal' }}>
            {(props) => <UpgradeScreen {...props} onUpgrade={() => setIsPro(true)} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>

      {incomingCall && !activeCall && (
        <IncomingCallBanner call={incomingCall} onAccept={handleAcceptCall} onDecline={handleDeclineCall} />
      )}
      {activeCall && (
        <CallScreen
          call={activeCall.call}
          isCaller={activeCall.isCaller}
          onClose={() => {
            reportCallEnded(activeCall.call.id);
            setActiveCall(null);
          }}
        />
      )}
    </>
  );
}
