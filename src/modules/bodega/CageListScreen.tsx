import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { QrScanner } from '@components/QrScanner';
import { ScreenContainer } from '@components/ui';
import { fetchActiveCageSession } from '@core/api/cageSessions';
import {
  fetchWarehouseCages,
  resolveWarehouseCageQr,
  scanPackageIntoCage,
  type WarehouseCageListItem,
} from '@core/api/cagesWarehouse';
import { playScanFeedback, prepareScanAudio } from '@core/feedback/scanFeedback';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';
import type { BodegaStackNav, BodegaStackRoute } from '@navigation/bodegaStackTypes';
import { useTheme, type AppTheme } from '@theme';

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
  const [search, setSearch] = useState('');
  const [cageScannerOpen, setCageScannerOpen] = useState(false);
  const [cageScanError, setCageScanError] = useState<string | null>(null);
  const [packageScannerOpen, setPackageScannerOpen] = useState(false);
  const [packageScanError, setPackageScanError] = useState<string | null>(null);

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
    refetchInterval: 4_000,
    staleTime: 0,
  });

  const sessionQ = useQuery({
    queryKey: ['cage-sessions', 'active'],
    queryFn: fetchActiveCageSession,
    refetchInterval: 4_000,
    staleTime: 0,
  });
  const session = sessionQ.data?.session ?? null;

  // If the session was just closed (by another device or by this user), kick
  // back to the gate so the operator has to start a new one.
  useEffect(() => {
    if (sessionQ.isLoading) return;
    if (session === null) {
      navigation.reset({ index: 0, routes: [{ name: 'CageSessionGate' }] });
    }
  }, [navigation, session, sessionQ.isLoading]);

  const filteredCages = useMemo(() => {
    const rows = query.data ?? [];
    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((c) => {
      const name = c.name.toLowerCase();
      const zone = [c.zone?.name, c.zone?.code].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || zone.includes(q);
    });
  }, [query.data, search]);

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

  useEffect(() => {
    prepareScanAudio();
  }, []);

  const resolveCageQrMutation = useMutation({
    mutationFn: (raw: string) => resolveWarehouseCageQr(raw),
    onSuccess: (cage) => {
      setCageScanError(null);
      if (transfer !== null) {
        if (cage.id === transfer.excludeCageId) {
          playScanFeedback('error');
          setCageScanError('Esa es la jaula de origen. Elegí otra.');
          return;
        }
        const t = transfer.tracking.trim();
        if (t === '') return;
        playScanFeedback('success');
        setCageScannerOpen(false);
        transferMutation.mutate({ cage: { id: cage.id, name: cage.name }, tracking: t });
        return;
      }
      playScanFeedback('success');
      setCageScannerOpen(false);
      navigation.navigate('CageWorkspace', { cageId: cage.id, cageName: cage.name });
    },
    onError: (e: unknown) => {
      playScanFeedback('error');
      setCageScanError(axiosMessage(e, 'No se pudo leer la jaula.'));
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

  const onCageQrScanned = useCallback(
    (raw: string) => {
      if (resolveCageQrMutation.isPending || transferMutation.isPending) return;
      resolveCageQrMutation.mutate(raw);
    },
    [resolveCageQrMutation, transferMutation.isPending],
  );

  const onPackageQrScanned = useCallback(
    (raw: string) => {
      if (!packageScannerOpen) return;
      const tracking = normalizeShipmentScanToLookupKey(raw);
      if (tracking === '') {
        playScanFeedback('error');
        setPackageScanError('No se pudo leer el QR del paquete. Probá otra vez.');
        return;
      }
      playScanFeedback('success');
      setPackageScanError(null);
      setPackageScannerOpen(false);
      navigation.setParams({
        mode: 'transfer',
        transferTracking: tracking,
        excludeCageId: undefined,
        transferFromLabel: '',
      });
    },
    [navigation, packageScannerOpen],
  );

  const onCancelTransfer = useCallback(() => {
    navigation.setParams({
      mode: undefined,
      transferTracking: undefined,
      excludeCageId: undefined,
      transferFromLabel: undefined,
    });
  }, [navigation]);

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

  const totalShipmentsInSession = useMemo(() => {
    const rows = sessionQ.data?.cages ?? [];
    return rows.reduce((acc, c) => acc + (c.shipments_count ?? 0), 0);
  }, [sessionQ.data?.cages]);

  const cagesWithPackagesInSession = (sessionQ.data?.cages ?? []).filter(
    (c) => (c.shipments_count ?? 0) > 0,
  ).length;

  const sessionHeader =
    session !== null ? (
      <View style={styles.sessionHeader}>
        <View style={styles.sessionHeaderText}>
          <Text style={styles.sessionTitle}>Sesión {session.name}</Text>
          <Text style={styles.sessionSub}>
            {totalShipmentsInSession} paquete{totalShipmentsInSession === 1 ? '' : 's'} en {cagesWithPackagesInSession} jaula
            {cagesWithPackagesInSession === 1 ? '' : 's'}
          </Text>
        </View>
        <Pressable
          style={styles.closeSessionBtn}
          onPress={() => navigation.navigate('CloseCageSession')}
        >
          <Ionicons name="checkmark-done-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.closeSessionBtnLabel}>Cerrar sesión</Text>
        </Pressable>
      </View>
    ) : null;

  const intro =
    transfer !== null ? (
      <View style={styles.transferBanner}>
        <View style={styles.transferHeaderRow}>
          <Text style={styles.transferTitle}>Transferir paquete</Text>
          <Pressable
            style={styles.transferCancelBtn}
            onPress={onCancelTransfer}
            disabled={transferMutation.isPending}
            hitSlop={8}
          >
            <Text
              style={[
                styles.transferCancelLabel,
                transferMutation.isPending && styles.transferCancelLabelDisabled,
              ]}
            >
              Cancelar
            </Text>
          </Pressable>
        </View>
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
        Elegí una jaula con la búsqueda o escaneando el QR pegado al contenedor. Después escaneá los paquetes.
        Para reubicar un envío entre jaulas, tocá &quot;Mover paquete&quot; o usá &quot;Mover&quot; desde la
        jaula actual.
      </Text>
    );

  return (
    <ScreenContainer>
      {sessionHeader}
      {intro}

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : query.isError ? (
        <Text style={styles.error}>No se pudieron cargar las jaulas. Reintentá más tarde.</Text>
      ) : (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar jaula o zona…"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <Pressable
            style={({ pressed }) => [styles.scanCageBtn, pressed && styles.scanCageBtnPressed]}
            onPress={() => {
              setCageScanError(null);
              setCageScannerOpen(true);
            }}
            disabled={resolveCageQrMutation.isPending || transferMutation.isPending}
          >
            <Ionicons name="qr-code-outline" size={22} color={theme.colors.primary} />
            <View style={styles.scanCageBtnText}>
              <Text style={styles.scanCageBtnTitle}>Escanear QR de jaula</Text>
              <Text style={styles.scanCageBtnSub}>Abrí la cámara y apuntá al código del depósito</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
          </Pressable>
          {transfer === null ? (
            <Pressable
              style={({ pressed }) => [styles.movePackageBtn, pressed && styles.scanCageBtnPressed]}
              onPress={() => {
                setPackageScanError(null);
                setPackageScannerOpen(true);
              }}
              disabled={transferMutation.isPending}
            >
              <Ionicons name="swap-horizontal-outline" size={22} color={theme.colors.primary} />
              <View style={styles.scanCageBtnText}>
                <Text style={styles.scanCageBtnTitle}>Mover paquete entre jaulas</Text>
                <Text style={styles.scanCageBtnSub}>Escaneá el envío y elegí la jaula destino</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
            </Pressable>
          ) : null}
          {cageScanError !== null && !cageScannerOpen ? (
            <Text style={styles.cageScanErr}>{cageScanError}</Text>
          ) : null}
          {packageScanError !== null && !packageScannerOpen ? (
            <Text style={styles.cageScanErr}>{packageScanError}</Text>
          ) : null}
          <FlatList
            data={filteredCages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>
                {(query.data ?? []).length === 0
                  ? 'No hay jaulas activas para tu cuenta.'
                  : 'No hay jaulas que coincidan con la búsqueda.'}
              </Text>
            }
          />
        </>
      )}

      {transferMutation.isPending ? (
        <View style={styles.transferLoading}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.transferLoadingLabel}>Moviendo paquete…</Text>
        </View>
      ) : null}

      <Modal visible={cageScannerOpen} animationType="slide" onRequestClose={() => setCageScannerOpen(false)}>
        <View style={styles.cageModalWrap}>
          <Text style={styles.cageModalTitle}>QR de la jaula</Text>
          {cageScanError !== null ? <Text style={styles.cageModalErr}>{cageScanError}</Text> : null}
          <QrScanner onScan={onCageQrScanned} containerStyle={styles.cageScannerBox} />
          {resolveCageQrMutation.isPending ? (
            <View style={styles.cageModalLoading}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={styles.cageModalLoadingLabel}>Abriendo jaula…</Text>
            </View>
          ) : null}
          <Pressable style={styles.cageModalClose} onPress={() => setCageScannerOpen(false)}>
            <Text style={styles.cageModalCloseLabel}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={packageScannerOpen}
        animationType="slide"
        onRequestClose={() => setPackageScannerOpen(false)}
      >
        <View style={styles.cageModalWrap}>
          <Text style={styles.cageModalTitle}>Escaneá el paquete a mover</Text>
          <Text style={styles.cageModalSub}>
            Apuntá al QR del envío. Después vas a elegir la jaula destino.
          </Text>
          {packageScanError !== null ? (
            <Text style={styles.cageModalErr}>{packageScanError}</Text>
          ) : null}
          <QrScanner onScan={onPackageQrScanned} containerStyle={styles.cageScannerBox} />
          <Pressable style={styles.cageModalClose} onPress={() => setPackageScannerOpen(false)}>
            <Text style={styles.cageModalCloseLabel}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>
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
    sessionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary + '44',
    },
    sessionHeaderText: { flex: 1, minWidth: 0 },
    sessionTitle: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    sessionSub: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 2,
    },
    closeSessionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.primary + '66',
      backgroundColor: colors.primary + '11',
    },
    closeSessionBtnLabel: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    searchInput: {
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusMd,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginBottom: spacing.sm,
    },
    scanCageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary + '44',
    },
    movePackageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary + '44',
    },
    scanCageBtnPressed: {
      opacity: 0.88,
    },
    scanCageBtnText: {
      flex: 1,
      minWidth: 0,
    },
    scanCageBtnTitle: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    scanCageBtnSub: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 2,
    },
    cageScanErr: {
      ...typography.caption,
      color: colors.danger,
      marginBottom: spacing.sm,
    },
    cageModalWrap: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: spacing.xxl,
      paddingHorizontal: spacing.md,
    },
    cageModalTitle: {
      ...typography.subtitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    cageModalErr: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    cageModalSub: {
      ...typography.caption,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    cageScannerBox: {
      flex: 1,
      minHeight: 320,
    },
    cageModalLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    cageModalLoadingLabel: {
      ...typography.caption,
      color: colors.muted,
    },
    cageModalClose: {
      padding: spacing.lg,
      alignItems: 'center',
    },
    cageModalCloseLabel: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
    transferBanner: {
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary + '55',
    },
    transferHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    transferCancelBtn: {
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.radiusSm,
    },
    transferCancelLabel: {
      ...typography.captionStrong,
      color: colors.danger,
    },
    transferCancelLabelDisabled: {
      opacity: 0.5,
    },
    transferTitle: {
      ...typography.bodyStrong,
      color: colors.text,
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
      borderColor: colors.border,
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
