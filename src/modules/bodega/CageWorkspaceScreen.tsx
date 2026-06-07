import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { QrScanner } from '@components/QrScanner';
import { Button, ScreenContainer } from '@components/ui';
import { fetchActiveCageSession } from '@core/api/cageSessions';
import {
  closeWarehouseCage,
  fetchDriversForAssignment,
  fetchWarehouseCageDetail,
  scanPackageIntoCage,
  type DriverForAssignment,
  type WarehouseCageShipment,
} from '@core/api/cagesWarehouse';
import { playScanFeedback, prepareScanAudio } from '@core/feedback/scanFeedback';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';
import type { BodegaStackParamList } from '@navigation/bodegaStackTypes';
import { useTheme, type AppTheme } from '@theme';

type Props = NativeStackScreenProps<BodegaStackParamList, 'CageWorkspace'>;

type ScanErrorRow = { id: string; code: string; message: string };

type LastScanned = { tracking: string; duplicate: boolean };

const SCAN_COOLDOWN_MS = 1500;
const LAST_SCANNED_TTL_MS = 3000;
const SCAN_ERROR_TTL_MS = 4500;
const CORNER_SIZE = 22;
const CORNER_THICKNESS = 3;

function resolveTrackingFromScanRaw(raw: string): string {
  return normalizeShipmentScanToLookupKey(raw);
}

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

/** Visible shortening of long tracking codes for the "last scanned" banner. */
function formatTrackingDisplay(t: string): string {
  if (t.startsWith('TRK_')) return '#' + t.slice(4, 14).toUpperCase();
  if (t.length > 16) return t.slice(0, 13).toUpperCase() + '…';
  return t.toUpperCase();
}

export function CageWorkspaceScreen({ navigation, route }: Props) {
  const { cageId, cageName } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const qc = useQueryClient();

  const [scanErrors, setScanErrors] = useState<ScanErrorRow[]>([]);
  const [lastScanned, setLastScanned] = useState<LastScanned | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  const lastScannedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Locks while a scan POST is in flight (defends against double-fire from camera frames). */
  const scanInFlightRef = useRef(false);

  // Reanimated overlays for visual feedback over the scanner.
  const successFlash = useSharedValue(0);
  const errorFlash = useSharedValue(0);
  const counterScale = useSharedValue(1);

  const successFlashStyle = useAnimatedStyle(() => ({ opacity: successFlash.value }));
  const errorFlashStyle = useAnimatedStyle(() => ({ opacity: errorFlash.value }));
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ scale: counterScale.value }] }));

  const detailQuery = useQuery({
    queryKey: ['warehouse', 'cages', 'detail', cageId],
    queryFn: () => fetchWarehouseCageDetail(cageId),
  });

  const driversQuery = useQuery({
    queryKey: ['warehouse', 'drivers-for-assignment'],
    queryFn: fetchDriversForAssignment,
    enabled: closeOpen,
  });

  const sessionQuery = useQuery({
    queryKey: ['cage-sessions', 'active'],
    queryFn: fetchActiveCageSession,
    refetchInterval: 4_000,
    staleTime: 0,
  });
  const hasActiveSession = sessionQuery.data?.session !== null && sessionQuery.data?.session !== undefined;

  const shipments: WarehouseCageShipment[] = detailQuery.data?.shipments ?? [];
  const okCount = shipments.length;

  const trackingsInCage = useMemo(() => {
    const set = new Set<string>();
    for (const s of shipments) set.add(s.tracking);
    return set;
  }, [shipments]);

  useEffect(() => {
    prepareScanAudio();
  }, []);

  useEffect(() => {
    return () => {
      if (lastScannedTimerRef.current !== null) clearTimeout(lastScannedTimerRef.current);
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const triggerSuccessVisuals = useCallback(
    (tracking: string, duplicate: boolean) => {
      playScanFeedback('success');
      successFlash.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 380 }),
      );
      counterScale.value = withSequence(
        withSpring(1.3, { damping: 3, stiffness: 320 }),
        withSpring(1, { damping: 8, stiffness: 180 }),
      );
      if (lastScannedTimerRef.current !== null) clearTimeout(lastScannedTimerRef.current);
      setLastScanned({ tracking, duplicate });
      lastScannedTimerRef.current = setTimeout(() => setLastScanned(null), LAST_SCANNED_TTL_MS);
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
      setTransientError(null);
    },
    [successFlash, counterScale],
  );

  const triggerErrorVisuals = useCallback(
    (message: string) => {
      playScanFeedback('error');
      errorFlash.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 480 }),
      );
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
      setTransientError(message);
      setLastScanned(null);
      errorTimerRef.current = setTimeout(() => setTransientError(null), SCAN_ERROR_TTL_MS);
    },
    [errorFlash],
  );

  const scanMutation = useMutation({
    mutationFn: (tracking: string) => scanPackageIntoCage(cageId, tracking),
    onSuccess: async (_d, tracking) => {
      triggerSuccessVisuals(tracking, false);
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages'] });
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages', 'detail', cageId] });
    },
    onError: (e, tracking) => {
      const msg = axiosMessage(e, 'No se pudo agregar el paquete.');
      triggerErrorVisuals(msg);
      setScanErrors((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          code: tracking,
          message: msg,
        },
        ...prev,
      ]);
    },
    onSettled: () => {
      scanInFlightRef.current = false;
    },
  });

  const closeMutation = useMutation({
    mutationFn: (driverId: string | null) => closeWarehouseCage(cageId, driverId),
    onSuccess: async (assigned) => {
      setCloseOpen(false);
      setSelectedDriverId(null);
      setCloseError(null);
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages'] });
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages', 'detail', cageId] });
      setScanErrors([]);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'CageList', params: {} }],
        }),
      );
      void assigned;
    },
    onError: (e: unknown) => {
      setCloseError(axiosMessage(e, 'No se pudo cerrar la jaula.'));
    },
  });

  const drivers = driversQuery.data ?? [];
  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (q === '') return drivers;
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, driverSearch]);

  useEffect(() => {
    if (!closeOpen) return;
    setDriverSearch('');
  }, [closeOpen]);

  useEffect(() => {
    if (selectedDriverId === null) return;
    if (!filteredDrivers.some((d) => d.id === selectedDriverId)) {
      setSelectedDriverId(null);
    }
  }, [filteredDrivers, selectedDriverId]);

  const onQrScanned = useCallback(
    (raw: string) => {
      if (scanInFlightRef.current || closeMutation.isPending) return;
      const tracking = resolveTrackingFromScanRaw(raw);
      if (tracking === '') return;
      // Local de-duplication: package already in this cage → reward feedback without hitting the API.
      if (trackingsInCage.has(tracking)) {
        triggerSuccessVisuals(tracking, true);
        return;
      }
      scanInFlightRef.current = true;
      scanMutation.mutate(tracking);
    },
    [scanMutation, trackingsInCage, triggerSuccessVisuals, closeMutation.isPending],
  );

  const onConfirmClose = useCallback(() => {
    if (selectedDriverId === null || closeMutation.isPending) return;
    setCloseError(null);
    closeMutation.mutate(selectedDriverId);
  }, [selectedDriverId, closeMutation]);

  const onOpenCloseModal = useCallback(() => {
    setCloseError(null);
    setCloseOpen(true);
  }, []);

  const onRequestCloseModal = useCallback(() => {
    Keyboard.dismiss();
    setCloseOpen(false);
    setCloseError(null);
  }, []);

  const renderDriver = useCallback(
    ({ item }: { item: DriverForAssignment }) => {
      const selected = item.id === selectedDriverId;
      return (
        <Pressable
          style={[styles.driverRow, selected && styles.driverRowSelected]}
          onPress={() => setSelectedDriverId(item.id)}
        >
          <Text style={styles.driverName}>{item.name}</Text>
        </Pressable>
      );
    },
    [selectedDriverId, styles],
  );

  const renderShipment = useCallback(
    ({ item }: { item: WarehouseCageShipment }) => (
      <View style={styles.shipRow}>
        <View style={styles.shipRowMain}>
          <Text style={styles.shipTracking}>{item.tracking}</Text>
          <Text style={styles.shipStatus}>
            {item.status_code === 'in_cage' ? 'En jaula' : (item.status_code ?? '—')}
          </Text>
        </View>
        {item.status_code === 'in_cage' ? (
          <Pressable
            style={styles.transferBtn}
            onPress={() =>
              navigation.navigate('CageList', {
                mode: 'transfer',
                transferTracking: item.tracking,
                excludeCageId: cageId,
                transferFromLabel: cageName,
              })
            }
          >
            <Text style={styles.transferBtnLabel}>Mover</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    [cageId, cageName, navigation, styles],
  );

  return (
    <ScreenContainer>
      <Text style={styles.cageLabel}>Jaula</Text>
      <Text style={styles.cageName}>{cageName}</Text>

      <View style={styles.scannerWrap}>
        <QrScanner
          onScan={onQrScanned}
          scanCooldownMs={SCAN_COOLDOWN_MS}
          containerStyle={styles.scanner}
        />
        <Animated.View style={[styles.flashSuccess, successFlashStyle]} pointerEvents="none" />
        <Animated.View style={[styles.flashError, errorFlashStyle]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
        {scanMutation.isPending ? (
          <View style={styles.scannerLockOverlay} pointerEvents="none">
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.scannerLockText}>Registrando…</Text>
          </View>
        ) : null}
      </View>

      {transientError !== null ? (
        <View style={styles.scanErrorBanner}>
          <Ionicons name="close-circle" size={22} color={theme.colors.danger} />
          <Text style={styles.scanErrorText}>{transientError}</Text>
        </View>
      ) : lastScanned !== null ? (
        <View style={styles.lastScannedBanner}>
          <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
          <View style={styles.lastScannedTextWrap}>
            <Text style={styles.lastScannedLabel}>
              {lastScanned.duplicate ? 'Ya estaba en la jaula' : '¡Agregado!'}
            </Text>
            <Text style={styles.lastScannedId}>{formatTrackingDisplay(lastScanned.tracking)}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.hintRow}>
          <Ionicons name="scan-outline" size={16} color={theme.colors.muted} />
          <Text style={styles.hintText}>Apuntá al QR del paquete</Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <Animated.View style={[styles.statBox, counterStyle]}>
          <Text style={[styles.statValue, styles.statOk]}>{okCount}</Text>
          <Text style={styles.statLabel}>OK en jaula</Text>
        </Animated.View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, styles.statBad]}>{scanErrors.length}</Text>
          <Text style={styles.statLabel}>Rechazos</Text>
        </View>
      </View>

      {hasActiveSession ? (
        <View style={styles.sessionLockedBanner}>
          <Ionicons name="lock-closed-outline" size={16} color={theme.colors.muted} />
          <Text style={styles.sessionLockedText}>
            Esta jaula se cierra al cerrar la sesión.
          </Text>
        </View>
      ) : (
        <>
          <Button
            onPress={() => {
              if (okCount === 0) {
                setCloseError(null);
                closeMutation.mutate(null);
              } else {
                onOpenCloseModal();
              }
            }}
            disabled={detailQuery.isLoading || closeMutation.isPending}
            loading={closeMutation.isPending}
            style={styles.closeCageBtn}
          >
            {okCount === 0 ? 'Cerrar jaula' : 'Cerrar jaula y asignar conductor'}
          </Button>
          {closeError !== null && !closeOpen ? (
            <Text style={styles.footerCloseErr}>{closeError}</Text>
          ) : null}
        </>
      )}

      <View style={styles.listHeaderRow}>
        <Text style={styles.sectionLabel}>Paquetes en esta jaula</Text>
        {detailQuery.isFetching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>

      {detailQuery.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={shipments}
          keyExtractor={(s) => s.id}
          renderItem={renderShipment}
          style={styles.shipList}
          contentContainerStyle={styles.shipListContent}
          ListEmptyComponent={
            <Text style={styles.emptyList}>Todavía no hay paquetes. Escaneá el primero.</Text>
          }
        />
      )}

      <Modal visible={closeOpen} animationType="fade" transparent onRequestClose={onRequestCloseModal}>
        <KeyboardAvoidingView
          style={styles.closeKeyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          <View style={styles.closeOverlay}>
            <Pressable style={styles.closeBackdrop} onPress={onRequestCloseModal} />
            <View style={styles.closeSheet}>
              <Text style={styles.closeTitle}>¿Qué conductor retira la jaula?</Text>
              <Text style={styles.closeHint}>
                Se liberan {okCount} paquete{okCount === 1 ? '' : 's'} para ruta; elegí quién los retira.
              </Text>
              {closeError !== null ? <Text style={styles.closeApiErr}>{closeError}</Text> : null}
              <View style={styles.closeActions}>
                <Pressable style={styles.cancelBtn} onPress={onRequestCloseModal}>
                  <Text style={styles.cancelBtnLabel}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmBtn,
                    (selectedDriverId === null || closeMutation.isPending) && styles.confirmDisabled,
                  ]}
                  onPress={onConfirmClose}
                  disabled={selectedDriverId === null || closeMutation.isPending}
                >
                  <Text style={styles.confirmBtnLabel}>{closeMutation.isPending ? 'Cerrando…' : 'Confirmar'}</Text>
                </Pressable>
              </View>
              {driversQuery.isLoading ? (
                <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
              ) : (
                <>
                  <TextInput
                    value={driverSearch}
                    onChangeText={setDriverSearch}
                    placeholder="Buscar por nombre…"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.driverSearchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <FlatList
                    data={filteredDrivers}
                    keyExtractor={(d) => d.id}
                    renderItem={renderDriver}
                    style={styles.driverList}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    nestedScrollEnabled
                    ListEmptyComponent={
                      <Text style={styles.emptyList}>
                        {drivers.length === 0
                          ? 'No hay conductores para tu negocio.'
                          : 'Ningún conductor coincide con la búsqueda.'}
                      </Text>
                    }
                  />
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    cageLabel: {
      ...typography.caption,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    cageName: {
      ...typography.subtitle,
      color: colors.text,
      marginBottom: spacing.md,
    },

    // ── Scanner ────────────────────────────────────────────────────────
    scannerWrap: {
      height: 230,
      borderRadius: spacing.radiusLg,
      overflow: 'hidden',
      backgroundColor: '#000',
      marginBottom: spacing.md,
    },
    scanner: { flex: 1 },
    flashSuccess: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(34, 197, 94, 0.48)',
    },
    flashError: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(239, 68, 68, 0.48)',
    },
    corner: {
      position: 'absolute',
      width: CORNER_SIZE,
      height: CORNER_SIZE,
      borderColor: colors.primary,
    },
    cornerTL: {
      top: 12,
      left: 12,
      borderTopWidth: CORNER_THICKNESS,
      borderLeftWidth: CORNER_THICKNESS,
      borderTopLeftRadius: 4,
    },
    cornerTR: {
      top: 12,
      right: 12,
      borderTopWidth: CORNER_THICKNESS,
      borderRightWidth: CORNER_THICKNESS,
      borderTopRightRadius: 4,
    },
    cornerBL: {
      bottom: 12,
      left: 12,
      borderBottomWidth: CORNER_THICKNESS,
      borderLeftWidth: CORNER_THICKNESS,
      borderBottomLeftRadius: 4,
    },
    cornerBR: {
      bottom: 12,
      right: 12,
      borderBottomWidth: CORNER_THICKNESS,
      borderRightWidth: CORNER_THICKNESS,
      borderBottomRightRadius: 4,
    },
    scannerLockOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      gap: spacing.xs,
    },
    scannerLockText: {
      ...typography.bodyStrong,
      color: '#ffffff',
      letterSpacing: 0.4,
    },

    // ── Banners ────────────────────────────────────────────────────────
    lastScannedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: 'rgba(34, 197, 94, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(34, 197, 94, 0.4)',
      borderRadius: spacing.radiusMd,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      minHeight: 52,
    },
    lastScannedTextWrap: { flex: 1, minWidth: 0 },
    lastScannedLabel: {
      ...typography.captionStrong,
      color: colors.success,
    },
    lastScannedId: {
      ...typography.bodyStrong,
      color: colors.text,
      marginTop: 2,
    },
    scanErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.45)',
      borderRadius: spacing.radiusMd,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      minHeight: 52,
    },
    scanErrorText: {
      ...typography.body,
      color: colors.danger,
      flex: 1,
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.md,
      minHeight: 52,
    },
    hintText: {
      ...typography.caption,
      color: colors.muted,
    },

    // ── Stats ──────────────────────────────────────────────────────────
    statsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    statBox: {
      flex: 1,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      ...typography.title,
    },
    statOk: {
      color: colors.success,
    },
    statBad: {
      color: colors.danger,
    },
    statLabel: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 4,
    },

    // ── Cerrar jaula ───────────────────────────────────────────────────
    closeCageBtn: {
      marginBottom: spacing.md,
    },
    sessionLockedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sessionLockedText: {
      ...typography.caption,
      color: colors.muted,
      flex: 1,
    },
    footerCloseErr: {
      ...typography.caption,
      color: colors.danger,
      marginTop: -spacing.sm,
      marginBottom: spacing.md,
      textAlign: 'center',
    },

    // ── Lista ──────────────────────────────────────────────────────────
    listHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    sectionLabel: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    shipList: {
      flex: 1,
    },
    shipListContent: {
      paddingBottom: spacing.lg,
    },
    shipRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    shipRowMain: {
      flex: 1,
      minWidth: 0,
    },
    transferBtn: {
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.primary + '66',
    },
    transferBtnLabel: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    shipTracking: {
      ...typography.bodyStrong,
      color: colors.text,
      fontFamily: 'monospace',
    },
    shipStatus: {
      ...typography.caption,
      color: colors.muted,
    },
    emptyList: {
      ...typography.caption,
      color: colors.muted,
      paddingVertical: spacing.md,
    },
    loader: {
      marginVertical: spacing.md,
    },

    // ── Modal cerrar jaula ─────────────────────────────────────────────
    closeKeyboardRoot: {
      flex: 1,
    },
    closeOverlay: {
      flex: 1,
      backgroundColor: '#000a',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    closeBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    closeSheet: {
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusLg,
      padding: spacing.lg,
      maxHeight: '88%',
      zIndex: 1,
    },
    closeApiErr: {
      ...typography.caption,
      color: colors.danger,
      marginBottom: spacing.sm,
    },
    closeTitle: {
      ...typography.subtitle,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    closeHint: {
      ...typography.caption,
      color: colors.muted,
      marginBottom: spacing.md,
    },
    driverSearchInput: {
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusMd,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginBottom: spacing.sm,
    },
    driverList: {
      flexGrow: 0,
      maxHeight: 260,
    },
    driverRow: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.radiusSm,
      marginBottom: 4,
    },
    driverRowSelected: {
      backgroundColor: colors.primary + '33',
    },
    driverName: {
      ...typography.body,
      color: colors.text,
    },
    closeActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    cancelBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    cancelBtnLabel: {
      ...typography.body,
      color: colors.muted,
    },
    confirmBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.primary,
      borderRadius: spacing.radiusMd,
    },
    confirmDisabled: {
      opacity: 0.45,
    },
    confirmBtnLabel: {
      ...typography.bodyStrong,
      color: colors.primaryOn,
    },
  });
}
