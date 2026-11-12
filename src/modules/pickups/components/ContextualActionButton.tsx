import { Button } from '@components/ui';
import { useTheme } from '@theme';
import { View } from 'react-native';

import type { ContextualAction } from '../lib/contextualAction';

export type ContextualActionButtonProps = {
  action: ContextualAction;
  label: string;
  loading?: boolean;
  onPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
};

export function ContextualActionButton({
  action,
  label,
  loading,
  onPress,
  secondaryLabel,
  onSecondaryPress,
}: ContextualActionButtonProps) {
  const { spacing } = useTheme();
  if (action.kind === 'none') return null;

  return (
    <View style={{ padding: spacing.lg, gap: spacing.sm }}>
      <Button variant="primary" size="lg" onPress={onPress} disabled={loading}>
        {loading ? 'Enviando…' : label}
      </Button>
      {secondaryLabel && onSecondaryPress ? (
        <Button variant="ghost" onPress={onSecondaryPress} disabled={loading}>
          {secondaryLabel}
        </Button>
      ) : null}
    </View>
  );
}
