export const CALLKEEP_OPTIONS = {
  ios: {
    appName: 'Sore Chat',
    supportsVideo: true,
    maximumCallGroups: '1',
    maximumCallsPerCallGroup: '1',
  },
  android: {
    alertTitle: 'Permissions required',
    alertDescription: 'Sore Chat needs access to show call notifications.',
    cancelButton: 'Cancel',
    okButton: 'OK',
    imageName: 'ic_launcher',
    additionalPermissions: [],
    // Lets the app show a full-screen incoming-call UI even when the
    // device is locked/backgrounded, same as the phone dialer.
    foregroundService: {
      channelId: 'com.sorechat.app.calls',
      channelName: 'Sore Chat calls',
      notificationTitle: 'Sore Chat is running in the background',
    },
  },
};
