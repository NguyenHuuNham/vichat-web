import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Check,
  Clock,
  Compass,
  Crosshair,
  MapPin,
  Radio,
  X,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useI18n } from '../store/languageStore';
import { useThemePalette } from '../theme/useThemePalette';
import { ThemeColors } from '../theme/colors';
import { LocationAttachment, StaticLocationPayload } from '../types';
import { liveLocationService } from '../services/liveLocationService';

interface NearbyPlace {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: LocationAttachment) => void;
  conversationId?: string;
  senderInfo?: {
    senderId: string;
    senderName: string;
    senderAvatar?: string;
  };
}

const DEFAULT_COORDS = {
  latitude: 21.028511,
  longitude: 105.854444,
  accuracy: 14,
};

const DURATION_OPTIONS: Array<{ value: 15 | 30 | 60 | 480; label: string }> = [
  { value: 15, label: '15 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
  { value: 480, label: '8 giờ' },
];

export function LocationPickerModal({
  visible,
  onClose,
  onSelect,
  conversationId,
  senderInfo,
}: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();
  const styles = createStyles(palette);

  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [addressText, setAddressText] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [durationSheetVisible, setDurationSheetVisible] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<15 | 30 | 60 | 480>(30);
  const [liveSharingBusy, setLiveSharingBusy] = useState(false);

  const webViewRef = useRef<WebView>(null);

  const generateNearbyPlaces = useCallback((lat: number, lng: number, baseStreet: string, city: string) => {
    const list: NearbyPlace[] = [
      {
        id: 'poi_1',
        title: 'CÔNG TY CP DFA ( NỘI THẤT )',
        address: `11 liền kề 14, Khu đô thị mới, ${city || 'Hà Nội'}`,
        latitude: lat + 0.0008,
        longitude: lng + 0.0006,
      },
      {
        id: 'poi_3',
        title: 'Highlands Coffee',
        address: baseStreet ? `Góc ngã tư ${baseStreet}` : 'Khu thương mại tầng 1',
        latitude: lat - 0.0011,
        longitude: lng + 0.0009,
      },
      {
        id: 'poi_4',
        title: 'Trung tâm Hội nghị & Triển lãm',
        address: `${city || 'Khu đô thị Trung tâm'}`,
        latitude: lat - 0.0018,
        longitude: lng - 0.0014,
      },
    ];
    return list;
  }, []);

  const fetchCurrentLocation = useCallback(async () => {
    setLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingGps(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy || 14),
      };
      setCoords(nextCoords);

      let resolvedAddress = '';
      let streetName = '';
      let cityName = '';
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: nextCoords.latitude,
          longitude: nextCoords.longitude,
        });
        if (places && places.length > 0) {
          const p = places[0];
          streetName = p.street || p.name || '';
          cityName = p.region || p.city || 'Hà Nội';
          resolvedAddress = [p.name, p.street, p.subregion || p.district, p.region || p.city]
            .filter(Boolean)
            .join(', ');
        }
      } catch {
        // Reverse geocoding fallback
      }

      const finalAddress = resolvedAddress || `${nextCoords.latitude.toFixed(6)}, ${nextCoords.longitude.toFixed(6)}`;
      setAddressText(finalAddress);
      setNearbyPlaces(generateNearbyPlaces(nextCoords.latitude, nextCoords.longitude, streetName, cityName));

      // Update map center
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(
          `if (window.recenter) { window.recenter(${nextCoords.latitude}, ${nextCoords.longitude}); } true;`,
        );
      }
    } catch {
      // Fallback
    } finally {
      setLoadingGps(false);
    }
  }, [generateNearbyPlaces]);

  useEffect(() => {
    if (visible) {
      setDurationSheetVisible(false);
      setLiveSharingBusy(false);
      void fetchCurrentLocation();
    }
  }, [visible, fetchCurrentLocation]);

  const handleRecenter = () => {
    void fetchCurrentLocation();
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(
        `if (window.recenter) { window.recenter(${coords.latitude}, ${coords.longitude}); } true;`,
      );
    }
  };

  const handleSendCurrentLocation = () => {
    const payload: StaticLocationPayload = {
      kind: 'static',
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      title: t('Vị trí hiện tại của bạn'),
      address: addressText || `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
    };
    onSelect(payload);
    onClose();
  };

  const handleSendPlace = (place: NearbyPlace) => {
    const payload: StaticLocationPayload = {
      kind: 'static',
      latitude: place.latitude,
      longitude: place.longitude,
      accuracy: coords.accuracy,
      title: place.title,
      address: place.address,
    };
    onSelect(payload);
    onClose();
  };

  const handleConfirmLiveSharing = async () => {
    if (!conversationId) {
      // fallback static
      handleSendCurrentLocation();
      return;
    }
    setLiveSharingBusy(true);
    try {
      await liveLocationService.startLiveSharing(conversationId, selectedDuration, senderInfo || {
        senderId: '',
        senderName: 'Bạn',
      });
      setDurationSheetVisible(false);
      onClose();
    } catch {
      // error handling
    } finally {
      setLiveSharingBusy(false);
    }
  };

  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { box-sizing: border-box; }
        body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #E8ECEF; }
        .pulse-marker-wrap {
          display: flex; align-items: center; justify-content: center;
        }
        .pulse-core {
          width: 18px; height: 18px; border-radius: 50%;
          background: #0084FF; border: 3px solid #FFFFFF;
          box-shadow: 0 0 0 6px rgba(0, 132, 255, 0.35);
          animation: pulse 2s infinite ease-out;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 132, 255, 0.6); }
          70% { box-shadow: 0 0 0 14px rgba(0, 132, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 132, 255, 0); }
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${coords.latitude}, ${coords.longitude}], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        var pulseIcon = L.divIcon({
          className: 'pulse-marker-wrap',
          html: '<div class="pulse-core"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        var marker = L.marker([${coords.latitude}, ${coords.longitude}], { icon: pulseIcon }).addTo(map);
        window.recenter = function(lat, lng) {
          map.setView([lat, lng], 16, { animate: true });
          marker.setLatLng([lat, lng]);
        };
      </script>
    </body>
    </html>
  `;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Đóng')}
            onPress={onClose}
            style={styles.closeBtn}
          >
            <X color={palette.ink} size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Vị trí')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Upper Half: Interactive Map View */}
        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: leafletHtml }}
            style={styles.mapWebView}
            javaScriptEnabled
            domStorageEnabled
            scalesPageToFit={false}
            scrollEnabled={false}
            webviewDebuggingEnabled={false}
          />

          {/* Floating Re-center FAB */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Định vị vị trí hiện tại')}
            onPress={handleRecenter}
            style={({ pressed }) => [styles.recenterFab, pressed && { opacity: 0.8 }]}
          >
            {loadingGps ? (
              <ActivityIndicator color={palette.accent} size="small" />
            ) : (
              <Crosshair color="#0084FF" size={22} />
            )}
          </Pressable>
        </View>

        {/* Lower Half: Action Sheet */}
        <View style={styles.sheetContainer}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Mode 1: Chia sẻ hành trình trực tiếp */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setDurationSheetVisible(true)}
              style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#FF5722' }]}>
                <Radio color="#FFFFFF" size={20} />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>{t('Chia sẻ hành trình trực tiếp')}</Text>
                <Text style={styles.actionSubtitle}>{t('Liên tục cập nhật khi bạn di chuyển')}</Text>
              </View>
            </Pressable>

            {/* Divider & Section Title */}
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionHeader}>{t('Gửi địa điểm cụ thể:')}</Text>

            {/* Mode 2: Gửi vị trí hiện tại của bạn */}
            <Pressable
              accessibilityRole="button"
              onPress={handleSendCurrentLocation}
              style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#0084FF' }]}>
                <MapPin color="#FFFFFF" size={20} />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>{t('Gửi vị trí hiện tại của bạn')}</Text>
                <Text style={styles.actionSubtitle}>
                  {loadingGps ? t('Đang định vị...') : `${t('Chính xác đến')} ${coords.accuracy}m`}
                </Text>
              </View>
            </Pressable>

            {/* Mode 3: Nearby POI List */}
            {nearbyPlaces.map(place => (
              <Pressable
                key={place.id}
                accessibilityRole="button"
                onPress={() => handleSendPlace(place)}
                style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
              >
                <View style={[styles.actionIconBox, { backgroundColor: palette.canvas }]}>
                  <MapPin color={palette.inkSoft} size={20} />
                </View>
                <View style={styles.actionInfo}>
                  <Text numberOfLines={1} style={styles.placeTitle}>
                    {place.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.placeAddress}>
                    {place.address}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Duration Selection Modal / Bottom Sheet */}
        <Modal
          visible={durationSheetVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDurationSheetVisible(false)}
        >
          <View style={styles.durationBackdrop}>
            <View style={styles.durationCard}>
              <View style={styles.durationHeader}>
                <Clock color="#FF5722" size={22} />
                <Text style={styles.durationTitle}>{t('Thời lượng chia sẻ trực tiếp')}</Text>
              </View>
              <Text style={styles.durationHint}>
                {t('Người nhận sẽ theo dõi được vị trí di chuyển theo thời gian thực cho đến khi hết hạn hoặc khi bạn bấm dừng.')}
              </Text>

              {/* Options */}
              <View style={styles.durationOptionsList}>
                {DURATION_OPTIONS.map(opt => {
                  const isSelected = selectedDuration === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      accessibilityRole="button"
                      onPress={() => setSelectedDuration(opt.value)}
                      style={[
                        styles.durationOptionRow,
                        isSelected && styles.durationOptionRowActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.durationOptionText,
                          isSelected && styles.durationOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {isSelected && <Check color="#FF5722" size={18} />}
                    </Pressable>
                  );
                })}
              </View>

              {/* Actions */}
              <View style={styles.durationActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDurationSheetVisible(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>{t('Hủy')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleConfirmLiveSharing()}
                  disabled={liveSharingBusy}
                  style={styles.confirmLiveBtn}
                >
                  {liveSharingBusy ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.confirmLiveBtnText}>{t('Bắt đầu chia sẻ')}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.paper,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      backgroundColor: palette.paper,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    closeBtn: {
      padding: 6,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: palette.ink,
    },
    mapContainer: {
      height: '42%',
      width: '100%',
      position: 'relative',
      backgroundColor: '#E8ECEF',
    },
    mapWebView: {
      flex: 1,
    },
    recenterFab: {
      position: 'absolute',
      top: 14,
      right: 14,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: palette.paper,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    },
    sheetContainer: {
      flex: 1,
      backgroundColor: palette.paper,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      marginTop: -16,
      paddingTop: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.line,
      alignSelf: 'center',
      marginBottom: 12,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 12,
    },
    rowPressed: {
      opacity: 0.7,
      backgroundColor: palette.canvas,
    },
    actionIconBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    actionInfo: {
      flex: 1,
    },
    actionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: palette.ink,
      marginBottom: 3,
    },
    actionSubtitle: {
      fontSize: 13,
      color: palette.muted,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: palette.line,
      marginVertical: 8,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.muted,
      marginBottom: 6,
      marginTop: 4,
    },
    placeTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: palette.ink,
      marginBottom: 2,
    },
    placeAddress: {
      fontSize: 12,
      color: palette.muted,
    },
    durationBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    durationCard: {
      width: '100%',
      backgroundColor: palette.paper,
      borderRadius: 16,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
    },
    durationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    durationTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: palette.ink,
    },
    durationHint: {
      fontSize: 13,
      color: palette.muted,
      lineHeight: 18,
      marginBottom: 16,
    },
    durationOptionsList: {
      gap: 8,
      marginBottom: 20,
    },
    durationOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: palette.canvas,
      borderWidth: 1,
      borderColor: palette.line,
    },
    durationOptionRowActive: {
      borderColor: '#FF5722',
      backgroundColor: 'rgba(255, 87, 34, 0.08)',
    },
    durationOptionText: {
      fontSize: 15,
      fontWeight: '500',
      color: palette.ink,
    },
    durationOptionTextActive: {
      color: '#FF5722',
      fontWeight: '600',
    },
    durationActionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    cancelBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    cancelBtnText: {
      fontSize: 15,
      color: palette.inkSoft,
      fontWeight: '500',
    },
    confirmLiveBtn: {
      backgroundColor: '#FF5722',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    confirmLiveBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
}
