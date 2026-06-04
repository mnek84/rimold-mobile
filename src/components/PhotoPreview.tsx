import { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type AppTheme } from '@theme';

type Props = {
  /** A `data:image/...` URI or a remote/local URI. */
  uri: string;
  /** Side length of the inline thumbnail in dp. Defaults to 96. */
  size?: number;
  /** Hint shown below the thumbnail. Defaults to "Tocá la foto para agrandarla". */
  hint?: string;
};

/**
 * Renders a tappable thumbnail of a captured photo and opens a full-screen
 * viewer when pressed. The full-screen viewer supports pinch-to-zoom on iOS
 * (no-op on Android, where the contain-fit preview already fills the screen).
 */
export function PhotoPreview({ uri, size = 96, hint }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.thumbWrap,
          { width: size, height: size },
          pressed && styles.pressed,
        ]}
        accessibilityRole="imagebutton"
        accessibilityLabel="Ver foto en grande"
      >
        <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
      </Pressable>
      <Text style={styles.hint}>{hint ?? 'Tocá la foto para agrandarla'}</Text>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.overlay} edges={['top', 'left', 'right', 'bottom']}>
          <ScrollView
            style={styles.zoomScroll}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            pinchGestureEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent
          >
            <Image
              source={{ uri }}
              style={{ width, height: height - 80 }}
              resizeMode="contain"
            />
          </ScrollView>

          <Pressable
            onPress={() => setOpen(false)}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Cerrar vista de foto"
          >
            <Text style={styles.closeBtnLabel}>Cerrar</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    thumbWrap: {
      borderRadius: spacing.radiusMd,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: spacing.sm,
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    hint: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.xs,
    },
    overlay: {
      flex: 1,
      backgroundColor: '#000000',
    },
    zoomScroll: {
      flex: 1,
    },
    zoomContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeBtn: {
      position: 'absolute',
      top: spacing.lg,
      right: spacing.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    closeBtnLabel: {
      ...typography.bodyStrong,
      color: '#FFFFFF',
    },
    pressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
  });
}
