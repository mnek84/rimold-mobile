import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
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
import { ScreenContainer } from '@components/ui';
import {
  crossdockAllocate,
  listCrossdockingLocations,
  type CrossdockAllocateResult,
  type CrossdockingLocation,
} from '@core/api/crossdockAllocate';
import { playScanFeedback, prepareScanAudio } from '@core/feedback/scanFeedback';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';
import { useTheme, type AppTheme } from '@theme';

const SCAN_COOLDOWN_MS = 1500;
const LAST_TTL_MS = 4500;
const HISTORY_LIMIT = 6;

type HistoryRow = {
  id: string;
  barcode: string;
  outcome: 'ok' | 'error';
  grid: number;
  cageName: string | null;
  detail: string;
};

function messageForResult(result: CrossdockAllocateResult): string {
  if (result.success) {
    return `Grid ${result.grid} — ${result.cage?.name ?? ''}`;
  }
  switch (result.error_code) {
    case 'shipment_not_found':
      return 'Ese envío no existe.';
    case 'missing_destination':
      return 'El envío no tiene código postal.';
    case 'no_cage_for_cp':
      return `Sin jaula configurada para ${result.shipment?.destination_postal_code ?? 'este CP'}.`;
    case 'barcode_invalid':
      return 'Código inválido.';
    case 'network':
      return 'Sin conexión, reintentá.';
    default:
      return result.msg || 'No pudimos sortear el paquete.';
  }
}

/**
 * Fallback manual del sorter físico: cuando la máquina no está disponible,
 * el operario escanea con la app y la pantalla le dice a qué jaula (grid)
 * llevar el paquete. Comparte lógica con el endpoint del sorter físico.
 */
export function CrossdockManualScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const locationsQuery = useQuery({
    queryKey: ['crossdocking-locations'],
    queryFn: listCrossdockingLocations,
  });

  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [last, setLast] = useState<
    (CrossdockAllocateResult & { barcode: string }) | null
  >(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const lastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInFlightRef = useRef(false);
  const successFlash = useSharedValue(0);
  const errorFlash = useSharedValue(0);

  const successFlashStyle = useAnimatedStyle(() => ({ opacity: successFlash.value }));
  const errorFlashStyle = useAnimatedStyle(() => ({ opacity: errorFlash.value }));

  useEffect(() => {
    prepareScanAudio();
    return () => {
      if (lastTimerRef.current !== null) clearTimeout(lastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (locationId === null && locationsQuery.data && locationsQuery.data.length > 0) {
      const defaultLoc =
        locationsQuery.data.find((l: CrossdockingLocation) => l.is_default) ??
        locationsQuery.data[0];
      setLocationId(defaultLoc.id);
    }
  }, [locationsQuery.data, locationId]);

  const currentLocation: CrossdockingLocation | null = useMemo(() => {
    if (locationId === null || !locationsQuery.data) return null;
    return locationsQuery.data.find((l: CrossdockingLocation) => l.id === locationId) ?? null;
  }, [locationId, locationsQuery.data]);

  const pushHistory = useCallback((row: HistoryRow) => {
    setHistory((prev) => [row, ...prev].slice(0, HISTORY_LIMIT));
  }, []);

  const showResult = useCallback(
    (barcode: string, result: CrossdockAllocateResult) => {
      const detail = messageForResult(result);
      if (result.success) {
        playScanFeedback('success');
        successFlash.value = withSequence(
          withTiming(1, { duration: 60 }),
          withTiming(0, { duration: 380 }),
        );
      } else {
        playScanFeedback('error');
        errorFlash.value = withSequence(
          withTiming(1, { duration: 60 }),
          withTiming(0, { duration: 480 }),
        );
      }
      setLast({ ...result, barcode });
      if (lastTimerRef.current !== null) clearTimeout(lastTimerRef.current);
      lastTimerRef.current = setTimeout(() => setLast(null), LAST_TTL_MS);
      pushHistory({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        barcode,
        outcome: result.success ? 'ok' : 'error',
        grid: result.grid,
        cageName: result.cage?.name ?? null,
        detail,
      });
    },
    [successFlash, errorFlash, pushHistory],
  );

  const scanMutation = useMutation({
    mutationFn: ({ barcode, cdlId }: { barcode: string; cdlId: string }) =>
      crossdockAllocate({ barcode, crossdocking_location_id: cdlId }),
    onSuccess: (result, vars) => {
      showResult(vars.barcode, result);
    },
    onSettled: () => {
      scanInFlightRef.current = false;
    },
  });

  const onQrScanned = useCallback(
    (raw: string) => {
      if (scanInFlightRef.current) return;
      if (locationId === null) return;
      const normalized = normalizeShipmentScanToLookupKey(raw);
      if (normalized === '') return;
      scanInFlightRef.current = true;
      scanMutation.mutate({ barcode: raw, cdlId: locationId });
    },
    [locationId, scanMutation],
  );

  const ready = locationId !== null && !locationsQuery.isLoading;

  return (
    <ScreenContainer>
      <Text style={styles.headline}>Crossdocking manual</Text>
      <Text style={styles.hint}>
        Modo fallback cuando el sorter no está disponible. Escaneá el paquete y te decimos
        a qué jaula (grid) llevarlo.
      </Text>

      <Pressable
        style={styles.locationSelector}
        onPress={() => setLocationPickerOpen((v) => !v)}
        accessibilityRole="button"
      >
        <Ionicons name="business-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.locationLabel}>
          {currentLocation?.name ?? 'Elegí un depósito'}
        </Text>
        <Ionicons
          name={locationPickerOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.muted}
        />
      </Pressable>

      {locationPickerOpen ? (
        <View style={styles.pickerBox}>
          {(locationsQuery.data ?? []).map((loc: CrossdockingLocation) => (
            <Pressable
              key={loc.id}
              style={styles.pickerRow}
              onPress={() => {
                setLocationId(loc.id);
                setLocationPickerOpen(false);
              }}
            >
              <Ionicons
                name={loc.id === locationId ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={theme.colors.primary}
              />
              <Text style={styles.pickerRowText}>{loc.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.scannerWrap}>
        <QrScanner
          onScan={onQrScanned}
          scanCooldownMs={SCAN_COOLDOWN_MS}
          containerStyle={styles.scanner}
        />
        <Animated.View style={[styles.flashSuccess, successFlashStyle]} pointerEvents="none" />
        <Animated.View style={[styles.flashError, errorFlashStyle]} pointerEvents="none" />
        {scanMutation.isPending || !ready ? (
          <View style={styles.scannerLockOverlay} pointerEvents="none">
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.scannerLockText}>
              {!ready ? 'Cargando depósitos…' : 'Resolviendo…'}
            </Text>
          </View>
        ) : null}
      </View>

      {last ? (
        <View
          style={[
            styles.resultBanner,
            last.success ? styles.resultBannerOk : styles.resultBannerError,
          ]}
        >
          <Ionicons
            name={last.success ? 'checkmark-circle' : 'close-circle'}
            size={26}
            color={last.success ? theme.colors.success : theme.colors.danger}
          />
          <View style={styles.resultTextWrap}>
            <Text style={styles.resultLabel}>
              {last.success
                ? `Jaula ${last.cage?.name ?? ''}`
                : (last.error_code ?? 'Error')}
            </Text>
            <Text style={styles.resultGrid}>
              {last.success ? `Grid ${last.grid}` : messageForResult(last)}
            </Text>
            <Text style={styles.resultDetail}>
              {last.shipment?.tracking ?? last.barcode}
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Últimos escaneos</Text>
      <FlatList
        data={history}
        keyExtractor={(h) => h.id}
        style={styles.histList}
        ListEmptyComponent={<Text style={styles.emptyList}>Sin escaneos aún.</Text>}
        renderItem={({ item }) => (
          <View style={styles.histRow}>
            <Ionicons
              name={item.outcome === 'ok' ? 'checkmark-circle' : 'close-circle'}
              size={20}
              color={item.outcome === 'ok' ? theme.colors.success : theme.colors.danger}
            />
            <View style={styles.histTextWrap}>
              <Text style={styles.histTitle}>
                {item.outcome === 'ok' ? `Grid ${item.grid} — ${item.cageName}` : item.detail}
              </Text>
              <Text style={styles.histSubtitle}>{item.barcode}</Text>
            </View>
          </View>
        )}
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
    locationSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusMd,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
    },
    locationLabel: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    pickerBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pickerRowText: {
      ...typography.body,
      color: colors.text,
      flex: 1,
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
    resultBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      marginBottom: spacing.md,
    },
    resultBannerOk: {
      backgroundColor: 'rgba(34, 197, 94, 0.12)',
      borderColor: 'rgba(34, 197, 94, 0.45)',
    },
    resultBannerError: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'rgba(239, 68, 68, 0.45)',
    },
    resultTextWrap: { flex: 1, minWidth: 0 },
    resultLabel: {
      ...typography.captionStrong,
      color: colors.text,
    },
    resultGrid: {
      ...typography.title,
      color: colors.text,
      marginTop: 2,
    },
    resultDetail: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 2,
      fontFamily: 'monospace',
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
    histTitle: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    histSubtitle: {
      ...typography.caption,
      color: colors.muted,
      fontFamily: 'monospace',
    },
    emptyList: {
      ...typography.caption,
      color: colors.muted,
      paddingVertical: spacing.md,
    },
  });
}
