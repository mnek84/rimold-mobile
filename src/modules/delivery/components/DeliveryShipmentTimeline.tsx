import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@components/ui';
import { useTheme, type AppTheme } from '@theme';

import type { TimelineStepUi } from '../deliveryStatus';

type Props = {
  steps: TimelineStepUi[];
};

export function DeliveryShipmentTimeline({ steps }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Card style={styles.timelineCard}>
      <Text style={styles.timelineCardTitle}>Avance del envío</Text>
      <View style={styles.timelineList}>
        {steps.map((step, index) => (
          <View key={step.key} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View style={[styles.timelineDot, dotStyle(styles, step.state)]} />
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.timelineLine,
                    step.state === 'done' ? styles.timelineLineDone : styles.timelineLineMuted,
                  ]}
                />
              ) : null}
            </View>
            <Text style={[styles.timelineStepTitle, titleStyle(styles, step.state)]}>
              {step.title}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function dotStyle(
  styles: ReturnType<typeof createStyles>,
  state: TimelineStepUi['state'],
): object {
  switch (state) {
    case 'done':
      return styles.timelineDotDone;
    case 'current':
      return styles.timelineDotCurrent;
    case 'error':
      return styles.timelineDotError;
    default:
      return styles.timelineDotUpcoming;
  }
}

function titleStyle(
  styles: ReturnType<typeof createStyles>,
  state: TimelineStepUi['state'],
): object {
  switch (state) {
    case 'done':
      return styles.timelineTitleDone;
    case 'current':
      return styles.timelineTitleCurrent;
    case 'error':
      return styles.timelineTitleError;
    default:
      return styles.timelineTitleUpcoming;
  }
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    timelineCard: {
      marginBottom: spacing.xl,
    },
    timelineCardTitle: {
      ...typography.captionStrong,
      color: colors.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: spacing.md,
    },
    timelineList: {
      gap: 0,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      minHeight: 44,
    },
    timelineRail: {
      width: 22,
      alignItems: 'center',
      marginRight: spacing.md,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
    },
    timelineDotDone: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    timelineDotCurrent: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    timelineDotError: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
    },
    timelineDotUpcoming: {
      backgroundColor: 'transparent',
      borderColor: colors.muted,
    },
    timelineLine: {
      width: 2,
      height: 28,
      marginVertical: 4,
      borderRadius: 1,
    },
    timelineLineDone: {
      backgroundColor: colors.success,
    },
    timelineLineMuted: {
      backgroundColor: colors.border,
    },
    timelineStepTitle: {
      flex: 1,
      ...typography.bodyStrong,
      paddingTop: 0,
    },
    timelineTitleDone: {
      color: colors.text,
      opacity: 0.85,
    },
    timelineTitleCurrent: {
      color: colors.text,
      fontWeight: '700',
    },
    timelineTitleError: {
      color: colors.danger,
      fontWeight: '700',
    },
    timelineTitleUpcoming: {
      color: colors.muted,
    },
  });
}
