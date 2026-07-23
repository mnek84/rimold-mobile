import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { QrScanner } from '@components/QrScanner';
import { ScreenContainer } from '@components/ui';
import { warehouseEntryScan, type WarehouseEntryScanResult } from '@core/api/warehouseEntry';
import { playScanFeedback, prepareScanAudio } from '@core/feedback/scanFeedback';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';
import { useTheme, type AppTheme } from '@theme';

const SCAN_COOLDOWN_MS = 1500;
const LAST_SCANNED_TTL_MS = 3000;
const SCAN_ERROR_TTL_MS = 4500;
const HISTORY_LIMIT = 6;
const CORNER_SIZE = 22;
const CORNER_THICKNESS = 3;

type HistoryRow = {
  id: string;
  tracking: string;
  outcome: 'ingressed' | 'duplicate' | 'error';
  detail: string;
};

type LastScanned = { tracking: string; duplicate: boolean };

function formatTrackingDisplay(t: string): string {
  if (t.startsWith('TRK_')) return '#' + t.slice(4, 14).toUpperCase();
  if (t.length > 16) return t.slice(0, 13).toUpperCase() + '…';
  return t.toUpperCase();
}

function messageForFailure(result: WarehouseEntryScanResult & { valid: false }): string {
  switch (result.reason) {
    case 'not_found':
      return 'No encontramos ese envío.';
    case 'invalid_qr':
      return 'El código escaneado no es válido.';
    case 'invalid_state':
      if (typeof result.currentStatus === 'string' && result.currentStatus !== '') {
        return `Este envío está en "${result.currentStatus}" y no se puede ingresar.`;
      }
      return 'Este envío no está en un estado que permita el ingreso.';
    case 'network':
      return 'Sin conexión, reintentá.';
    default:
      return typeof result.message === 'string' && result.message !== ''
        ? result.message
        : 'No pudimos procesar el escaneo.';
  }
}

export function WarehouseEntryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [lastScanned, setLastScanned] = useState<LastScanned | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const lastScannedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInFlightRef = useRef(false);

  const successFlash = useSharedValue(0);
  const errorFlash = useSharedValue(0);
  const counterScale = useSharedValue(1);

  const successFlashStyle = useAnimatedStyle(() => ({ opacity: successFlash.value }));
  const errorFlashStyle = useAnimatedStyle(() => ({ opacity: errorFlash.value }));
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ scale: counterScale.value }] }));

  useEffect(() => {
    prepareScanAudio();
  }, []);

  useEffect(() => {
    return () => {
      if (lastScannedTimerRef.current !== null) clearTimeout(lastScannedTimerRef.current);
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const pushHistory = useCallback((row: HistoryRow) => {
    setHistory((prev) => [row, ...prev].slice(0, HISTORY_LIMIT));
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
    mutationFn: (raw: string) => warehouseEntryScan(raw),
    onSuccess: (result, raw) => {
      const scannedKey = normalizeShipmentScanToLookupKey(raw);
      if (result.valid) {
        const tracking = result.shipment.tracking;
        triggerSuccessVisuals(tracking, result.duplicate);
        pushHistory({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          tracking,
          outcome: result.duplicate ? 'duplicate' : 'ingressed',
          detail: result.duplicate ? 'Ya estaba ingresado' : 'Ingresado a depósito',
        });
      } else {
        const message = messageForFailure(result);
        triggerErrorVisuals(message);
        pushHistory({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          tracking: scannedKey !== '' ? scannedKey : raw,
          outcome: 'error',
          detail: message,
        });
      }
    },
    onSettled: () => {
      scanInFlightRef.current = false;
    },
  });

  const onQrScanned = useCallback(
    (raw: string) => {
      if (scanInFlightRef.current) return;
      const normalized = normalizeShipmentScanToLookupKey(raw);
      if (normalized === '') return;
      scanInFlightRef.current = true;
      scanMutation.mutate(raw);
    },
    [scanMutation],
  );

  const okCount = history.filter((h) => h.outcome === 'ingressed').length;
  const errorCount = history.filter((h) => h.outcome === 'error').length;

  const renderHistoryRow = useCallback(
    ({ item }: { item: HistoryRow }) => {
      const iconName =
        item.outcome === 'error'
          ? 'close-circle'
          : item.outcome === 'duplicate'
            ? 'time-outline'
            : 'checkmark-circle';
      const iconColor =
        item.outcome === 'error'
          ? theme.colors.danger
          : item.outcome === 'duplicate'
            ? theme.colors.muted
            : theme.colors.success;
      return (
        <View style={styles.histRow}>
          <Ionicons name={iconName} size={20} color={iconColor} />
          <View style={styles.histTextWrap}>
            <Text style={styles.histTracking}>{formatTrackingDisplay(item.tracking)}</Text>
            <Text style={styles.histDetail}>{item.detail}</Text>
          </View>
        </View>
      );
    },
    [styles, theme.colors],
  );

  return (
    <ScreenContainer>
      <Text style={styles.headline}>Ingreso a depósito</Text>
      <Text style={styles.hint}>
        Escaneá los paquetes que llegan de la colecta para dejarlos ingresados.
      </Text>

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
        <View style={styles.errorBanner}>
          <Ionicons name="close-circle" size={22} color={theme.colors.danger} />
          <Text style={styles.errorText}>{transientError}</Text>
        </View>
      ) : lastScanned !== null ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
          <View style={styles.successTextWrap}>
            <Text style={styles.successLabel}>
              {lastScanned.duplicate ? 'Ya estaba ingresado' : 'Ingresado a depósito'}
            </Text>
            <Text style={styles.successId}>{formatTrackingDisplay(lastScanned.tracking)}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.hintRow}>
          <Ionicons name="scan-outline" size={16} color={theme.colors.muted} />
          <Text style={styles.hintTextInline}>Apuntá al QR del paquete</Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <Animated.View style={[styles.statBox, counterStyle]}>
          <Text style={[styles.statValue, styles.statOk]}>{okCount}</Text>
          <Text style={styles.statLabel}>Ingresados</Text>
        </Animated.View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, styles.statBad]}>{errorCount}</Text>
          <Text style={styles.statLabel}>Rechazos</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Últimos escaneos</Text>
      <FlatList
        data={history}
        keyExtractor={(h) => h.id}
        renderItem={renderHistoryRow}
        style={styles.histList}
        ListEmptyComponent={
          <Text style={styles.emptyList}>Todavía no escaneaste ningún paquete.</Text>
        }
      />
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    headline: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    hint: {
      ...typography.caption,
      color: colors.muted,
      marginBottom: spacing.md,
    },

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

    successBanner: {
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
    successTextWrap: { flex: 1, minWidth: 0 },
    successLabel: {
      ...typography.captionStrong,
      color: colors.success,
    },
    successId: {
      ...typography.bodyStrong,
      color: colors.text,
      marginTop: 2,
    },
    errorBanner: {
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
    errorText: {
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
    hintTextInline: {
      ...typography.caption,
      color: colors.muted,
    },

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

    sectionLabel: {
      ...typography.bodyStrong,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    histList: {
      flex: 1,
    },
    histRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    histTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    histTracking: {
      ...typography.bodyStrong,
      color: colors.text,
      fontFamily: 'monospace',
    },
    histDetail: {
      ...typography.caption,
      color: colors.muted,
    },
    emptyList: {
      ...typography.caption,
      color: colors.muted,
      paddingVertical: spacing.md,
    },
  });
}
