import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Eraser, RotateCcw, Send, Spline, Trash2, X } from 'lucide-react-native';
import { useI18n } from '../store/languageStore';
import { useThemePalette } from '../theme/useThemePalette';
import { ThemeColors } from '../theme/colors';
import { PickerFile } from '../types';

interface Stroke {
  path: string;
  color: string;
  width: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (file: PickerFile) => void;
}

const COLORS = [
  '#1E293B', // Black/Charcoal
  '#FFFFFF', // White
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#F59E0B', // Yellow
  '#E056FD', // Purple
  '#10B981', // Green
];

const STROKE_WIDTHS = [
  { label: 'Mảnh', width: 2.5 },
  { label: 'Vừa', width: 5.5 },
  { label: 'Đậm', width: 9.5 },
];

export function DoodleModal({ visible, onClose, onSend }: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();
  const styles = createStyles(palette);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [selectedColor, setSelectedColor] = useState('#1E293B');
  const [selectedWidth, setSelectedWidth] = useState(5.5);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 340, height: 380 });

  const currentPathRef = useRef('');
  const selectedColorRef = useRef(selectedColor);
  selectedColorRef.current = selectedColor;
  const selectedWidthRef = useRef(selectedWidth);
  selectedWidthRef.current = selectedWidth;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: event => {
        const { locationX, locationY } = event.nativeEvent;
        const initialPath = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        currentPathRef.current = initialPath;
        setCurrentStroke({
          path: initialPath,
          color: selectedColorRef.current,
          width: selectedWidthRef.current,
        });
      },
      onPanResponderMove: event => {
        const { locationX, locationY } = event.nativeEvent;
        currentPathRef.current += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        setCurrentStroke({
          path: currentPathRef.current,
          color: selectedColorRef.current,
          width: selectedWidthRef.current,
        });
      },
      onPanResponderRelease: () => {
        if (currentPathRef.current) {
          const finishedStroke: Stroke = {
            path: currentPathRef.current,
            color: selectedColorRef.current,
            width: selectedWidthRef.current,
          };
          setStrokes(prev => [...prev, finishedStroke]);
        }
        currentPathRef.current = '';
        setCurrentStroke(null);
      },
    })
  ).current;

  const handleUndo = () => {
    setStrokes(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke(null);
  };

  const handleCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasDimensions({ width, height });
    }
  };

  const handleSend = async () => {
    if (strokes.length === 0 && !currentStroke) return;
    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
    const { width, height } = canvasDimensions;

    const pathTags = allStrokes
      .map(
        s =>
          `<path d="${s.path}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" />`
      )
      .join('\n');

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  <rect width="100%" height="100%" fill="#FFFFFF" />\n  ${pathTags}\n</svg>`;

    try {
      const fileSystem: any = require('expo-file-system');
      const filename = `doodle-${Date.now()}.svg`;
      const fileUri = `${fileSystem.cacheDirectory || ''}${filename}`;
      await fileSystem.writeAsStringAsync(fileUri, svgString, {
        encoding: fileSystem.EncodingType ? fileSystem.EncodingType.UTF8 : 'utf8',
      });

      let fileSize = 0;
      try {
        if (fileSystem.getInfoAsync) {
          const info = await fileSystem.getInfoAsync(fileUri, { size: true });
          fileSize = Number(info.size) || 0;
        }
      } catch {
        fileSize = 0;
      }
      if (!fileSize) {
        try {
          fileSize = new TextEncoder().encode(svgString).length;
        } catch {
          fileSize = svgString.length;
        }
      }

      const file: PickerFile = {
        uri: fileUri,
        name: filename,
        type: 'image/svg+xml',
        size: fileSize,
      };
      onSend(file);
      onClose();
      handleClear();
    } catch {
      // Fallback if file system error
      const fallbackSize = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(svgString).length
        : svgString.length;
      const file: PickerFile = {
        uri: `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`,
        name: `doodle-${Date.now()}.svg`,
        type: 'image/svg+xml',
        size: fallbackSize,
      };
      onSend(file);
      onClose();
      handleClear();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Spline color="#E056FD" size={20} />
              </View>
              <Text style={styles.headerTitle}>{t('Vẽ hình')}</Text>
            </View>
            <View style={styles.headerRight}>
              <Pressable
                accessibilityLabel={t('Hoàn tác')}
                onPress={handleUndo}
                disabled={strokes.length === 0}
                style={[styles.toolBtn, strokes.length === 0 && styles.disabledBtn]}
              >
                <RotateCcw color={palette.inkSoft} size={20} />
              </Pressable>
              <Pressable
                accessibilityLabel={t('Xóa hết')}
                onPress={handleClear}
                disabled={strokes.length === 0}
                style={[styles.toolBtn, strokes.length === 0 && styles.disabledBtn]}
              >
                <Trash2 color={palette.inkSoft} size={20} />
              </Pressable>
              <Pressable
                accessibilityLabel={t('Đóng')}
                onPress={onClose}
                style={styles.toolBtn}
              >
                <X color={palette.inkSoft} size={22} />
              </Pressable>
            </View>
          </View>

          {/* Canvas Area */}
          <View
            style={styles.canvasContainer}
            onLayout={handleCanvasLayout}
            {...panResponder.panHandlers}
          >
            <Svg width="100%" height="100%">
              <Rect width="100%" height="100%" fill="#FFFFFF" rx={12} ry={12} />
              {strokes.map((stroke, index) => (
                <Path
                  key={`stroke-${index}`}
                  d={stroke.path}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentStroke ? (
                <Path
                  d={currentStroke.path}
                  fill="none"
                  stroke={currentStroke.color}
                  strokeWidth={currentStroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </View>

          {/* Color & Tool Palette */}
          <View style={styles.toolbar}>
            {/* Colors */}
            <View style={styles.colorRow}>
              {COLORS.map(c => {
                const isSelected = selectedColor === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setSelectedColor(c)}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      c === '#FFFFFF' && styles.whiteDotBorder,
                      isSelected && styles.colorDotSelected,
                    ]}
                  />
                );
              })}
            </View>

            {/* Stroke Widths */}
            <View style={styles.widthRow}>
              {STROKE_WIDTHS.map(sw => {
                const isSelected = selectedWidth === sw.width;
                return (
                  <Pressable
                    key={sw.label}
                    onPress={() => setSelectedWidth(sw.width)}
                    style={[styles.widthBtn, isSelected && styles.widthBtnSelected]}
                  >
                    <View
                      style={[
                        styles.widthLine,
                        { height: sw.width, backgroundColor: selectedColor === '#FFFFFF' ? '#1E293B' : selectedColor },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Send Button */}
          <Pressable
            accessibilityRole="button"
            onPress={handleSend}
            disabled={strokes.length === 0 && !currentStroke}
            style={[
              styles.sendBtn,
              strokes.length === 0 && !currentStroke && styles.sendBtnDisabled,
            ]}
          >
            <Send color="#FFFFFF" size={18} />
            <Text style={styles.sendBtnText}>{t('Gửi hình vẽ')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: palette.paper,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 28,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(224, 86, 253, 0.12)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: palette.ink,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toolBtn: {
      padding: 6,
    },
    disabledBtn: {
      opacity: 0.35,
    },
    canvasContainer: {
      height: 340,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: palette.line,
      overflow: 'hidden',
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginTop: 14,
    },
    colorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    colorDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
    },
    whiteDotBorder: {
      borderWidth: 1.5,
      borderColor: '#CBD5E1',
    },
    colorDotSelected: {
      borderWidth: 3,
      borderColor: '#E056FD',
      transform: [{ scale: 1.15 }],
    },
    widthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    widthBtn: {
      width: 36,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 8,
      backgroundColor: palette.canvas,
      borderWidth: 1,
      borderColor: palette.line,
    },
    widthBtnSelected: {
      borderColor: '#E056FD',
      backgroundColor: 'rgba(224, 86, 253, 0.12)',
    },
    widthLine: {
      width: 20,
      borderRadius: 4,
    },
    sendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#E056FD',
      marginHorizontal: 16,
      marginTop: 14,
      paddingVertical: 12,
      borderRadius: 10,
      gap: 8,
      shadowColor: '#E056FD',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    sendBtnDisabled: {
      opacity: 0.45,
    },
    sendBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
}
