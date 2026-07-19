# Sore Chat — Chat App (Windows Desktop + Mobile)

A WhatsApp/Telegram-style chat app: text, photo, video, and voice messages, plus real
audio/video calls. Two codebases share one backend:

```
sorechat-app/
  desktop/    Windows app (Electron + React) — installs like any Windows app, auto-updates itself
  mobile/     Android app (React Native / Expo) — iOS calls not yet built, see Part 2b
  backend/    Firebase security rules, Storage rules, and Cloud Functions
```

Both apps are wired to the same live Firebase project (`sore-chat`) — real accounts, real
messages, real-time sync between devices. There's no demo/offline-only mode anymore; running
either app talks to Firebase from the first launch. Make sure the security rules and indexes in
`backend/` are deployed (Part 2 below) before testing with a second account.

---

## Part 1 — Run the demo locally

### Desktop (Windows)
```bash
cd desktop
npm install
npm run dev          # starts Vite
# in a second terminal:
npm start             # launches the Electron window
```

### Mobile (Android)
**Expo Go will not open this app anymore.** Real-time calling and background call
notifications need native modules (`react-native-webrtc`, `react-native-callkeep`,
`@react-native-firebase/messaging`) that Expo Go doesn't include. You need a custom dev build:
```bash
cd mobile
npm install
eas build --profile development --platform android
# install the resulting build on a device/emulator, then:
npx expo start --dev-client
```
Everything except calls (chat, media, offline queue, reactions, etc.) is plain JS and would
technically run in Expo Go too, but since the whole app now depends on the dev-client build,
just use that for all testing.

The mobile app has real sign-in/sign-up, a live chat list, and real-time messaging — create
an account (or sign in with one made on desktop, same Firebase project) and it just works. It
also works offline: chats and messages are cached to disk, and outgoing messages sent while
offline are queued durably (survives the app being killed) and sent automatically on reconnect.

---

## Part 2 — Connect the real backend (Firebase)

This is what turns it from a demo into a working app that delivers messages between real
users. Firebase is used because it's free at small scale, requires no server you have to
manage, and covers everything a chat app needs: accounts, real-time database, file storage,
and push notifications.

**Config is already filled in** (`desktop/src/firebase.js` and `mobile/src/firebase.js` both
point at the `sore-chat` project) — you only need to deploy the rules/functions, or swap in your
own project if you're taking this over:

1. If using your own project: go to [console.firebase.google.com](https://console.firebase.google.com)
   → **Create project**, enable **Authentication** (Email/Password), **Firestore Database**,
   **Storage**, and **Cloud Messaging**, then paste the new config into both `firebase.js` files.
2. **Upgrade to the Blaze (pay-as-you-go) plan** — Cloud Functions won't deploy on the free
   Spark plan. This covers push notifications and the incoming-call wake-up push; usage at
   small scale is normally still $0.
3. For Android call/message push notifications: download `google-services.json` from
   Firebase console → Project settings → your Android app, and put it in `mobile/`.
4. Deploy everything (`firebase.json` now covers Firestore, Storage, *and* Functions —
   earlier it only had Firestore, which meant `firebase deploy` was silently skipping the
   other two):
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy
   ```

Both apps read/write to Firestore directly — there's no separate "demo mode" toggle anymore.

---

## Part 2b — Calls: Android works, iOS doesn't yet

- **Desktop ↔ Desktop, Desktop ↔ Android:** working WebRTC audio/video calls, signaled
  through Firestore (`calls/{callId}` docs). Desktop-to-desktop rings via the browser tab
  being open; calling an Android device rings even if that app is backgrounded or fully
  killed, via a Cloud Function (`onIncomingCall`) that sends a high-priority FCM push, which
  wakes the app and shows a native incoming-call screen (`react-native-callkeep`).
- **iOS:** not built. It needs a completely different push path (PushKit VoIP push over a
  direct APNs connection, not FCM) plus a paid Apple Developer account and a VoIP Services
  certificate — deliberately deferred until there's a reason to prioritize it.

---

## Part 3 — Ship the Windows app, with auto-updates

This is the piece that satisfies "works on any computer with all future updates":

1. **Build the installer:**
   ```bash
   cd desktop
   npm run build:win
   ```
   This produces a `.exe` installer in `desktop/dist_electron/` (via `electron-builder`) that
   any Windows 10/11 PC can run — no dependencies needed, nothing to install separately.

2. **Enable auto-updates:** the app already ships with `electron-updater` wired up
   (`electron/main.js`). Every time it launches, it silently checks for a newer version and
   installs it in the background, prompting the user to restart when ready.

3. **Where updates come from:** the simplest free option is GitHub Releases.
   - Create a GitHub repo, put your `owner`/`repo` in `desktop/package.json` under `build.publish`.
   - Run `npm run publish:win` — this builds the installer and uploads it to a GitHub Release.
   - When you want to ship an update later, bump `"version"` in `package.json` and run
     `npm run publish:win` again. Every installed copy of Sore Chat will pick it up automatically.

---

## Part 4 — Ship the mobile app

- **JavaScript/UI updates** (most day-to-day changes) go out instantly with no app-store review,
  via **EAS Update** — already configured in `mobile/app.json`. Run:
  ```bash
  npx eas update --branch production
  ```
- **Native changes** (new permissions, new native libraries) require a normal store submission:
  ```bash
  npx eas build --platform android
  npx eas build --platform ios
  ```
  then upload to Google Play Console / App Store Connect.

---

## Part 5 — Monetization (free tier with ads → paid Pro)

**Free tier:** everything works, with:
- A banner ad slot above the message composer (`AdBanner.jsx` on desktop, inline banner on
  mobile). Swap in a real ad network's SDK — Google AdSense for the desktop web view, or
  `react-native-google-mobile-ads` (already listed in `mobile/package.json`) for mobile.
- A 25MB cap on photo/video attachments.

**Sore Chat Pro** (suggested $4.99/mo or $39.99/yr — adjust freely):
- No ads
- Attachments up to 2GB
- HD video quality on uploads
- Custom chat themes
- Priority message delivery

**Wiring up real payments:**
- **Desktop:** Stripe Checkout is the simplest path — create a Payment Link in the Stripe
  dashboard, open it from the "Upgrade" button, and use the `stripeWebhook` function in
  `backend/functions/index.js` to mark the user as Pro once payment completes.
- **Mobile:** app stores require in-app purchase for digital goods. Use
  [RevenueCat](https://www.revenuecat.com) (free up to $2.5k/mo tracked revenue) to handle
  Apple/Google IAP without writing native billing code yourself.

---

## Selling the app later

Because everything is a standard, self-contained codebase (no proprietary tooling), a buyer
can take over cleanly. Before a sale, it's worth having:
- Clean ownership of the Firebase project, domain (if any), and app store listings — transfer
  these to the buyer's accounts.
- Basic usage numbers (active users, revenue if any) to justify a price.
- This README plus your Firebase config as the full handover package.

---

## What's real vs. what's a placeholder right now

| Piece | Status |
|---|---|
| Messaging core (reply, edit, delete for me/everyone, pin, star, forward, copy, search, voice messages) | Fully working, both platforms |
| Read receipts, typing indicator, online/last-seen presence | Working (presence is client-driven, not a dedicated presence server) |
| Offline support | Working — Firestore cache + durable send queue on mobile, IndexedDB cache on desktop |
| Audio/video calls, desktop ↔ desktop and desktop ↔ Android | Working (WebRTC via Firestore signaling) |
| Audio/video calls, iOS | Not built — needs Apple Developer account + VoIP push, see Part 2b |
| Background/killed-state call ringing, Android | Working (FCM + CallKeep), needs Blaze plan + `google-services.json` |
| Push notifications for new messages | Cloud Function written (`onNewMessage`), needs an FCM token wired to it the same way calls are |
| Payments | UI complete, needs a real Stripe/RevenueCat account connected |
| Windows auto-update | Fully configured, needs a GitHub repo (or other update host) |
| Groups, stories/status, channels, bots, AI features | Not started |

---

## Changelog

Kept up to date as features land — newest first.

- **Voice messages** — record/send/playback, both platforms.
- **Android background call ringing** — FCM + CallKeep wake the app from backgrounded/killed
  state; `calls/{id}` now uses a real UUID (CallKit requires it) instead of a Firestore auto-ID.
- **Real-time audio/video calls** — WebRTC, desktop and Android, signaled through Firestore.
- **Mobile Chapter 1 parity** — reply, pin, star, forward, delete-for-me/everyone, presence,
  typing, offline durable send queue; `firestore.rules` updated to allow these (previously
  only `reactions` and `text` edits were permitted — every new action would have been
  silently rejected in production).
- **Desktop Chapter 1** — reply, edit, forward, pin, star, copy, delete-for-me/everyone
  (1-hour window, enforced server-side in rules, not just client-side), search-in-chat,
  message pagination, unread badges (previously hardcoded to 0), online/last-seen presence.
- **Fixed the original scrollability/"chat won't open" bug** — `.chat-window`/`.sidebar` were
  flex children missing `min-height: 0`, a classic flexbox trap that made the message list
  grow past the viewport and get clipped instead of scrolling.
- **Mobile rebuilt from a hardcoded demo to a real Firebase-backed app** — auth, chat list,
  and messaging were previously `DEMO_CHATS` arrays with no backend connection at all.
- **`firebase.json` fixed** — was only configuring Firestore; Storage and Functions existed on
  disk in `backend/` but `firebase deploy` was silently skipping both.
