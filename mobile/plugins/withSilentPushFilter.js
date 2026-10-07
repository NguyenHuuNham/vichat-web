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

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.RemoteMessage;
import expo.modules.notifications.service.ExpoFirebaseMessagingService;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONObject;

/**
 * Handles incoming FCM pushes on Android:
 * 1. Drops Tinode sender/device-sync pushes before Expo turns them into banners.
 * 2. Formats incoming message notifications with proper sender name and group title
 *    (e.g., Title: "Nhâm Nguyễn", Body: "hello" for 1-1; Title: "Nhóm...", Body: "Nhâm Nguyễn: hello" for group).
 * 3. Keeps notifications reliably active even when swiped away from recent apps.
 */
public final class ViChatFirebaseMessagingService extends ExpoFirebaseMessagingService {
  private static final String TAG = "ViChatFCM";
  private static final String CHANNEL_ID = "messages-v2";
  private static final String CHANNEL_NAME = "Tin nhắn ViChat";
  private static final Map<String, String> nameCache = new ConcurrentHashMap<>();
  private static long lastCacheReadTime = 0;

  @Override
  public void onMessageReceived(RemoteMessage remoteMessage) {
    if (shouldSuppressSilentMessage(remoteMessage)) {
      Log.d(TAG, "Suppressing silent push");
      return;
    }

    Map<String, String> data = remoteMessage.getData();
    if (isIncomingCall(data)) {
      Log.d(TAG, "Routing incoming call to ExpoFirebaseMessagingService");
      super.onMessageReceived(remoteMessage);
      return;
    }

    if (tryPostCustomNotification(remoteMessage)) {
      Log.d(TAG, "Custom notification successfully posted");
      return;
    }

    Log.w(TAG, "Custom notification could not handle message, calling super");
    super.onMessageReceived(remoteMessage);
  }

  private boolean tryPostCustomNotification(RemoteMessage remoteMessage) {
    try {
      Map<String, String> data = remoteMessage.getData();
      String topic = data.get("topic");
      String from = data.get("xfrom");
      if (from == null || from.isEmpty()) from = data.get("from");
      if (from == null || from.isEmpty()) from = data.get("sender");
      if (from == null || from.isEmpty()) from = data.get("x-sender-id");
      if (from == null || from.isEmpty()) from = data.get("sender_id");
      if (from == null || from.isEmpty()) from = data.get("uid");

      String content = data.get("content");
      if (content == null || content.trim().isEmpty()) {
        RemoteMessage.Notification notif = remoteMessage.getNotification();
        if (notif != null && notif.getBody() != null) {
          content = notif.getBody();
        }
      }
      if (content == null || content.trim().isEmpty()) {
        String mime = data.get("mime");
        if (mime != null && mime.startsWith("image/")) {
          content = "Đã gửi một hình ảnh";
        } else if (mime != null && (mime.startsWith("audio/") || mime.contains("voice"))) {
          content = "Đã gửi tin nhắn thoại";
        } else if (mime != null && mime.startsWith("video/")) {
          content = "Đã gửi một video";
        } else {
          content = "Bạn có tin nhắn mới";
        }
      }
      content = content.trim();

      loadNameCache();

      if (isTopicMuted(topic) || (from != null && isTopicMuted(from))) {
        Log.d(TAG, "Topic " + topic + " is muted, suppressing notification.");
        return true;
      }

      boolean isGroup = topic != null && (topic.startsWith("grp") || topic.startsWith("group"));

      // 1. Direct fields from data payload if available
      String senderName = data.get("sender_name");
      if (senderName == null || senderName.isEmpty()) senderName = data.get("senderName");
      if (senderName == null || senderName.isEmpty()) senderName = data.get("fn");
      if (senderName == null || senderName.isEmpty()) senderName = data.get("name");

      // 2. Lookup in nameCache by sender identifier
      if (senderName == null || senderName.trim().isEmpty()) {
        senderName = resolveName(from);
      }
      // If 1-1 chat (not a group), peer is the topic
      if ((senderName == null || senderName.trim().isEmpty()) && topic != null && !isGroup) {
        senderName = resolveName(topic);
      }

      // Fallback
      if (senderName == null || senderName.trim().isEmpty() || "Thành viên".equals(senderName) || "Người dùng".equals(senderName)) {
        senderName = isGroup ? "Thành viên" : "Người dùng";
      }

      String notificationTitle;
      String notificationBody;

      if (isGroup) {
        String groupTitle = resolveName(topic);
        if (groupTitle == null || groupTitle.trim().isEmpty()) {
          groupTitle = data.get("group_name");
        }
        if (groupTitle == null || groupTitle.trim().isEmpty()) {
          groupTitle = "Nhóm ViChat";
        }
        notificationTitle = groupTitle;
        notificationBody = senderName + ": " + content;
      } else {
        notificationTitle = senderName;
        notificationBody = content;
      }

      ensureNotificationChannel();

      Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
      PendingIntent pendingIntent = null;
      if (launchIntent != null) {
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (topic != null) {
          launchIntent.putExtra("tinodeTopic", topic);
        }
        int reqCode = (topic != null ? topic.hashCode() : 0) ^ (from != null ? from.hashCode() : 0);
        pendingIntent = PendingIntent.getActivity(
          this,
          reqCode,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
      }

      int iconRes = getNotificationIcon();

      NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(iconRes)
        .setContentTitle(notificationTitle)
        .setContentText(notificationBody)
        .setStyle(new NotificationCompat.BigTextStyle().bigText(notificationBody))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setColor(Color.parseColor("#F4511E"))
        .setAutoCancel(true);

      if (pendingIntent != null) {
        builder.setContentIntent(pendingIntent);
      }

      int notificationId = (topic != null ? topic.hashCode() : (int) System.currentTimeMillis());
      NotificationManagerCompat.from(this).notify(topic != null ? topic : "vichat", notificationId, builder.build());
      Log.i(TAG, "Custom notification posted: [" + notificationTitle + "] " + notificationBody);

      String seq = data.get("seq");
      if (seq != null && !seq.trim().isEmpty() && topic != null) {
        saveNotifiedSeq(topic, seq.trim());
      }
      return true;
    } catch (Throwable t) {
      Log.e(TAG, "Error posting custom notification", t);
      return false;
    }
  }

  private String resolveName(String id) {
    if (id == null) return null;
    String clean = id.trim();
    if (clean.isEmpty()) return null;
    if (nameCache.containsKey(clean)) return nameCache.get(clean);
    String lower = clean.toLowerCase(Locale.ROOT);
    if (nameCache.containsKey(lower)) return nameCache.get(lower);
    if (clean.startsWith("usr")) {
      String stripped = clean.substring(3);
      if (nameCache.containsKey(stripped)) return nameCache.get(stripped);
      if (nameCache.containsKey(stripped.toLowerCase(Locale.ROOT))) return nameCache.get(stripped.toLowerCase(Locale.ROOT));
    } else {
      String added = "usr" + clean;
      if (nameCache.containsKey(added)) return nameCache.get(added);
      if (nameCache.containsKey(added.toLowerCase(Locale.ROOT))) return nameCache.get(added.toLowerCase(Locale.ROOT));
    }
    return null;
  }

  private void saveNotifiedSeq(String topic, String seq) {
    if (topic == null || seq == null || seq.trim().isEmpty()) return;
    try {
      nameCache.put("notified_seq:" + topic.trim(), seq.trim());
      File file = new File(getFilesDir(), "vichat_names.json");
      JSONObject json = new JSONObject(nameCache);
      java.io.FileOutputStream fos = new java.io.FileOutputStream(file);
      fos.write(json.toString().getBytes(StandardCharsets.UTF_8));
      fos.close();
      lastCacheReadTime = file.lastModified();
    } catch (Throwable ignored) {
    }
  }

  private int getNotificationIcon() {
    int icon = getResources().getIdentifier("notification_icon", "drawable", getPackageName());
    if (icon == 0) {
      icon = getResources().getIdentifier("ic_launcher_monochrome", "mipmap", getPackageName());
    }
    if (icon == 0) {
      icon = getResources().getIdentifier("ic_launcher_foreground", "mipmap", getPackageName());
    }
    return icon != 0 ? icon : android.R.drawable.stat_notify_chat;
  }

  private void ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
        NotificationChannel channel = new NotificationChannel(
          CHANNEL_ID,
          CHANNEL_NAME,
          NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Thông báo tin nhắn mới trong ViChat");
        channel.enableLights(true);
        channel.setLightColor(Color.parseColor("#F4511E"));
        channel.enableVibration(true);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
      }
    }
  }

  private void loadNameCache() {
    try {
      File file = new File(getFilesDir(), "vichat_names.json");
      if (!file.exists()) return;
      long lastMod = file.lastModified();
      if (lastMod <= lastCacheReadTime && !nameCache.isEmpty()) return;

      FileInputStream fis = new FileInputStream(file);
      InputStreamReader reader = new InputStreamReader(fis, StandardCharsets.UTF_8);
      StringBuilder sb = new StringBuilder();
      char[] buf = new char[1024];
      int read;
      while ((read = reader.read(buf)) != -1) {
        sb.append(buf, 0, read);
      }
      reader.close();
      fis.close();

      JSONObject json = new JSONObject(sb.toString());
      java.util.Iterator<String> keys = json.keys();
      while (keys.hasNext()) {
        String k = keys.next();
        String v = json.optString(k, "");
        if (!v.isEmpty()) {
          nameCache.put(k, v);
        }
      }
      lastCacheReadTime = lastMod;
    } catch (Throwable ignored) {
    }
  }

  private boolean isTopicMuted(String topic) {
    if (topic == null || topic.trim().isEmpty()) return false;
    String muteKey = "mute:" + topic.trim();
    if (!nameCache.containsKey(muteKey)) return false;
    String muteVal = nameCache.get(muteKey);
    if (muteVal == null || muteVal.trim().isEmpty()) return false;
    if ("0".equals(muteVal.trim())) return true;
    try {
      long untilSec = Long.parseLong(muteVal.trim());
      return untilSec * 1000L > System.currentTimeMillis();
    } catch (Throwable t) {
      return false;
    }
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
    let contents = config.modResults.contents;
    const dependency = "implementation 'com.google.firebase:firebase-messaging:24.1.0'";
    if (!contents.includes('com.google.firebase:firebase-messaging')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dependency}`,
      );
      config.modResults.contents = contents;
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
        $: { 'android:priority': '1' },
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
