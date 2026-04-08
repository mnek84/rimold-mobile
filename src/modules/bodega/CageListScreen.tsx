import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenContainer } from '@components/ui';
import { fetchWarehouseCages, scanPackageIntoCage, type WarehouseCageListItem } from '@core/api/cagesWarehouse';
import type { BodegaStackNav, BodegaStackRoute } from '@navigation/bodegaStackTypes';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

function axiosMessage(e: unknown, fallback: string): string {
  if (isAxiosError(e)) {
    const d = e.response?.data;
    if (d !== null && typeof d === 'object' && 'message' in d) {
      const m = (d as { message: unknown }).message;
      if (typeof m === 'string' && m !== '') return m;
    }
  }
  return e instanceof Error && e.message !== '' ? e.message : fallback;
}

export function CageListScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<BodegaStackNav<'CageList'>>();
  const route = useRoute<BodegaStackRoute<'CageList'>>();
  const qc = useQueryClient();

  const transfer =
    route.params?.mode === 'transfer'
      ? {
          tracking: route.params.transferTracking ?? '',
          excludeCageId: route.params.excludeCageId,
          fromLabel: route.params.transferFromLabel ?? '',
        }
      : null;

  const query = useQuery({
    queryKey: ['warehouse', 'cages'],
    queryFn: fetchWarehouseCages,
  });

  const transferMutation = useMutation({
    mutationFn: async ({ cage, tracking }: { cage: WarehouseCageListItem; tracking: string }) => {
      await scanPackageIntoCage(cage.id, tracking);
      return cage;
    },
    onSuccess: async (cage) => {
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages'] });
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages', 'detail'] });
      navigation.navigate('CageWorkspace', { cageId: cage.id, cageName: cage.name });
    },
  });

  const onSelect = useCallback(
    (c: WarehouseCageListItem) => {
      if (transfer !== null) {
        if (c.id === transfer.excludeCageId) return;
        const t = transfer.tracking.trim();
        if (t === '' || transferMutation.isPending) return;
        transferMutation.mutate({ cage: c, tracking: t });
        return;
      }
      navigation.navigate('CageWorkspace', { cageId: c.id, cageName: c.name });
    },
    [navigation, transfer, transferMutation],
  );

  const renderItem = useCallback(
    ({ item }: { item: WarehouseCageListItem }) => {
      const count = item.shipments_count ?? 0;
      const sub = [item.zone?.name].filter(Boolean).join(' · ');
      const disabledTransfer =
        transfer !== null && (item.id === transfer.excludeCageId || transferMutation.isPending);
      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            pressed && !disabledTransfer && styles.cardPressed,
            disabledTransfer && styles.cardDisabled,
          ]}
          onPress={() => onSelect(item)}
          disabled={Boolean(transfer !== null && item.id === transfer.excludeCageId)}
        >
          <Text style={styles.cardTitle}>{item.name}</Text>
          {sub !== '' ? <Text style={styles.cardSub}>{sub}</Text> : null}
          <Text style={styles.cardCount}>
            {count === 1 ? '1 paquete en jaula' : `${count} paquetes en jaula`}
          </Text>
        </Pressable>
      );
    },
    [onSelect, styles, transfer, transferMutation.isPending],
  );

  const intro =
    transfer !== null ? (
      <View style={styles.transferBanner}>
        <Text style={styles.transferTitle}>Transferir paquete</Text>
        <Text style={styles.transferBody}>
          Elegí la jaula destino para el tracking{' '}
          <Text style={styles.transferMono}>{transfer.tracking}</Text>
          {transfer.fromLabel !== '' ? (
            <>
              {' '}
              (origen: {transfer.fromLabel})
            </>
          ) : null}
          .
        </Text>
        {transferMutation.isError ? (
          <Text style={styles.transferErr}>{axiosMessage(transferMutation.error, 'No se pudo mover.')}</Text>
        ) : null}
      </View>
    ) : (
      <Text style={styles.intro}>
        Elegí una jaula para escanear paquetes. Al terminar, cerrá la jaula y asigná el conductor que los retira. Para
        mover un paquete a otra jaula, usá &quot;Mover&quot; desde la jaula actual.
      </Text>
    );

  return (
    <ScreenContainer>
      {intro}

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : query.isError ? (
        <Text style={styles.error}>No se pudieron cargar las jaulas. Reintentá más tarde.</Text>
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>No hay jaulas activas para tu cuenta.</Text>}
        />
      )}

      {transferMutation.isPending ? (
        <View style={styles.transferLoading}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.transferLoadingLabel}>Moviendo paquete…</Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    intro: {
      ...typography.caption,
      color: colors.muted,
      marginBottom: spacing.md,
    },
    transferBanner: {
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary + '55',
    },
    transferTitle: {
      ...typography.bodyStrong,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    transferBody: {
      ...typography.caption,
      color: colors.muted,
    },
    transferMono: {
      fontFamily: 'monospace',
      color: colors.text,
      fontWeight: '600',
    },
    transferErr: {
      ...typography.caption,
      color: colors.danger,
      marginTop: spacing.sm,
    },
    transferLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    transferLoadingLabel: {
      ...typography.caption,
      color: colors.muted,
    },
    loader: {
      marginTop: spacing.xl,
    },
    error: {
      ...typography.body,
      color: colors.danger,
    },
    listContent: {
      paddingBottom: spacing.xl,
      gap: spacing.sm,
    },
    card: {
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: borderSubtle,
    },
    cardPressed: {
      opacity: 0.92,
    },
    cardDisabled: {
      opacity: 0.45,
    },
    cardTitle: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    cardSub: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 2,
    },
    cardCount: {
      ...typography.captionStrong,
      color: colors.primary,
      marginTop: spacing.sm,
    },
    empty: {
      ...typography.body,
      color: colors.muted,
      marginTop: spacing.lg,
    },
  });
}
