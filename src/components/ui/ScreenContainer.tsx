import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme, type AppTheme } from '@theme';

export type ScreenContainerProps = {
  children: React.ReactNode;
  /** Scroll when content may overflow (keyboard-friendly scroll). */
  scroll?: boolean;
  /** Safe-area insets to apply. Default: top, left, right (tab bars often own the bottom). */
  edges?: Edge[];
  /** Wraps content in KeyboardAvoidingView (use with forms; iOS uses padding behavior). */
  keyboardAvoiding?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'style' | 'children'>;
};

const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right'];

export function ScreenContainer({
  children,
  scroll = false,
  edges = DEFAULT_EDGES,
  keyboardAvoiding = false,
  style,
  contentContainerStyle,
  scrollViewProps,
}: ScreenContainerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing } = t;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
  });
}
