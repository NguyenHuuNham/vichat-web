/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const {
  createRunOncePlugin,
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');

const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const VICHAT_SERVICE = 'vn.upgo.vichat.notifications.ViChatFirebaseMessagingService';
const FCM_ACTION = 'com.google.firebase.MESSAGING_EVENT';

const SERVICE_SOURCE = `package vn.upgo.vichat.notifications;

import com.google.firebase.messaging.RemoteMessage;
import expo.modules.notifications.service.ExpoFirebaseMessagingService;
import java.util.Locale;
import java.util.Map;

/**
 * Drops Tinode sender/device-sync pushes before Expo turns them into banners.
 * Recipient alerts and incoming-call pushes still use Expo's normal handler.
 */
public final class ViChatFirebaseMessagingService extends ExpoFirebaseMessagingService {
  @Override
  public void onMessageReceived(RemoteMessage remoteMessage) {
    if (shouldSuppressSilentMessage(remoteMessage)) return;
    super.onMessageReceived(remoteMessage);
  }

  private static boolean shouldSuppressSilentMessage(RemoteMessage remoteMessage) {
    Map<String, String> data = remoteMessage.getData();
    if (isIncomingCall(data)) return false;
    return isTruthy(data.get("silent"))
      || isTruthy(data.get("data.silent"))
      || isTruthy(data.get("gcm.n.silent"))
      || isTruthy(data.get("gcm.notification.silent"));
  }

  private static boolean isIncomingCall(Map<String, String> data) {
    String type = join(data.get("type"), data.get("notification_type"), data.get("notificationType"),
      data.get("kind"), data.get("event"), data.get("category"), data.get("action"));
    if (type.contains("call") || type.contains("webrtc")) return true;
    return data.containsKey("webrtc") || data.containsKey("call") || data.containsKey("incoming-call");
  }

  private static String join(String... values) {
    StringBuilder result = new StringBuilder();
    for (String value : values) {
      if (value != null) result.append(' ').append(value.toLowerCase(Locale.ROOT));
    }
    return result.toString();
  }

  private static boolean isTruthy(String value) {
    if (value == null) return false;
    String normalized = value.trim().toLowerCase(Locale.ROOT);
    return "true".equals(normalized) || "1".equals(normalized) || "yes".equals(normalized);
  }
}
`;

function withSilentPushFilter(config) {
  config = withAppBuildGradle(config, config => {
    const dependency = "implementation 'com.google.firebase:firebase-messaging:25.0.1'";
    if (!config.modResults.contents.includes(dependency)) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        match => `${match}\n    ${dependency}`,
      );
    }
    return config;
  });

  config = withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    manifest.$ = {
      ...(manifest.$ || {}),
      'xmlns:tools': manifest.$?.['xmlns:tools'] || 'http://schemas.android.com/tools',
    };
    const application = manifest.application?.[0];
    if (!application) return config;

    const services = (application.service || []).filter(service => {
      const name = service?.$?.['android:name'];
      return name !== VICHAT_SERVICE && !(name === EXPO_SERVICE && service?.$?.['tools:node'] === 'remove');
    });

    // Remove Expo's default service so only the filtering service handles FCM.
    services.push({
      $: {
        'android:name': EXPO_SERVICE,
        'tools:node': 'remove',
      },
    });
    services.push({
      $: {
        'android:name': VICHAT_SERVICE,
        'android:exported': 'false',
      },
      'intent-filter': [{
        $: { 'android:priority': '-1' },
        action: [{ $: { 'android:name': FCM_ACTION } }],
      }],
    });
    application.service = services;
    return config;
  });

  return withDangerousMod(config, ['android', async config => {
    const sourcePath = path.join(
      config.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'java',
      'vn',
      'upgo',
      'vichat',
      'notifications',
      'ViChatFirebaseMessagingService.java',
    );
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    if (!fs.existsSync(sourcePath) || fs.readFileSync(sourcePath, 'utf8') !== SERVICE_SOURCE) {
      fs.writeFileSync(sourcePath, SERVICE_SOURCE, 'utf8');
    }
    return config;
  }]);
}

module.exports = createRunOncePlugin(withSilentPushFilter, 'vichat-silent-push-filter', '1.0.0');
