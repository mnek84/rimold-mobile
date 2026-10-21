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
  newClientScanId,
  type CrossdockAllocateResult,
  type CrossdockingLocation,
} from '@core/api/crossdockAllocate';
import { playScanFeedback, prepareScanAudio } from '@core/feedback/scanFeedback';
import { parseQrPayload } from '@core/scanner/parseQrPayload';
import { scanDedupeKey } from '@core/scanner/types';
import { useTheme, type AppTheme } from '@theme';

const SCAN_COOLDOWN_MS = 1500;
const LAST_TTL_MS = 4500;
const HISTORY_LIMIT = 6;

type HistoryRow = {
  id: string;
  barcode: string;
  outcome: 'ok' | 'duplicate' | 'error';
  grid: number;
  cageName: string | null;
  /** `false` => `cageName` es una sugerencia y `grid` es el de excepcion. */
  applied: boolean;
  detail: string;
};

function messageForResult(result: CrossdockAllocateResult): string {
  if (result.success) {
    // Sin jaula aplicada el escaneo fue OK pero NO hay destino: decir
    // "Grid 0" seria inventarle uno al operario.
    if (!result.applied) {
      return result.suggested_cage !== null
        ? `Sugerida ${result.suggested_cage.name} — falta asignar`
        : 'Ingresado — todavía sin jaula';
    }

    return result.duplicate
      ? `Ya sorteado — ${result.cage?.name ?? `grid ${result.grid}`}`
      : `${result.cage?.name ?? `Grid ${result.grid}`}`;
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
  /** Resultado por codigo ya resuelto en esta pantalla, para el dedupe local. */
  const scannedRef = useRef<Map<string, CrossdockAllocateResult & { barcode: string }>>(
    new Map(),
  );
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

  // Otro deposito es otra operacion: lo sorteado antes no aplica.
  useEffect(() => {
    scannedRef.current.clear();
  }, [locationId]);

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
        // Un re-escaneo suena distinto a propósito: el operario tiene que poder
        // distinguir "este es nuevo" de "este ya lo pasaste" sin mirar.
        playScanFeedback(result.duplicate ? 'error' : 'success');
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
        outcome: result.success ? (result.duplicate ? 'duplicate' : 'ok') : 'error',
        grid: result.grid,
        cageName: result.applied
          ? (result.cage?.name ?? null)
          : (result.suggested_cage?.name ?? null),
        applied: result.applied,
        detail,
      });
    },
    [successFlash, errorFlash, pushHistory],
  );

  const scanMutation = useMutation({
    mutationFn: ({
      barcode,
      cdlId,
      clientScanId,
    }: {
      barcode: string;
      cdlId: string;
      clientScanId: string;
    }) =>
      crossdockAllocate({
        barcode,
        crossdocking_location_id: cdlId,
        client_scan_id: clientScanId,
      }),
    onSuccess: (result, vars) => {
      // Solo se cachean los exitos. Un fallo puede dejar de serlo en cuanto
      // alguien configure el CP que faltaba, y el operario tiene que poder
      // reintentar sin reiniciar la pantalla.
      if (result.success) {
        const key = scanDedupeKey(parseQrPayload(vars.barcode));
        if (key !== '') {
          scannedRef.current.set(key, {
            ...result,
            duplicate: true,
            barcode: vars.barcode,
          });
        }
      }
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
      const normalized = scanDedupeKey(parseQrPayload(raw));
      if (normalized === '') return;

      // Dedupe local, igual que CageWorkspaceScreen: la camara lee el mismo QR
      // varias veces si el operario lo deja en cuadro. La clave es el bulto
      // (codigo LGST1, o TRACK-NN del QR viejo), no el tracking: si no, el
      // bulto 2 se descarta como repetido del 1. El backend lo resolveria
      // igual como duplicado, pero ahorrarse el viaje hace que la pantalla
      // responda al instante en vez de parpadear "Resolviendo…".
      const already = scannedRef.current.get(normalized);
      if (already !== undefined) {
        showResult(raw, already);
        return;
      }

      scanInFlightRef.current = true;
      // Un id por intento de escaneo. Los reintentos internos de
      // `crossdockAllocate` lo reusan, asi que una respuesta perdida no
      // termina contando el bulto dos veces.
      scanMutation.mutate({
        barcode: raw,
        cdlId: locationId,
        clientScanId: newClientScanId(),
      });
    },
    [locationId, scanMutation, showResult],
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
            last.success
              ? last.duplicate
                ? styles.resultBannerDuplicate
                : styles.resultBannerOk
              : styles.resultBannerError,
          ]}
        >
          {last.success ? (
            // LA JAULA es lo primero y lo mas grande: el operario tiene el
            // paquete en la mano y lo unico que necesita decidir es a donde lo
            // lleva. El grid y el tracking son para verificar, no para decidir.
            <View style={styles.resultTextWrap}>
              <View style={styles.resultHeaderRow}>
                <Ionicons
                  name={
                    !last.applied ? 'help-circle' : last.duplicate ? 'repeat' : 'checkmark-circle'
                  }
                  size={22}
                  color={
                    !last.applied || last.duplicate
                      ? theme.colors.warning
                      : theme.colors.success
                  }
                />
                <Text
                  style={[
                    styles.resultLabel,
                    { color: last.duplicate ? theme.colors.warning : theme.colors.success },
                  ]}
                >
                  {!last.applied
                    ? 'SUGERIDA · SIN ASIGNAR'
                    : last.duplicate
                      ? 'YA SORTEADO'
                      : 'CROSSDOCKING OK'}
                </Text>
              </View>
              <Text style={styles.resultCage} numberOfLines={1} adjustsFontSizeToFit>
                {/*
                  Sin jaula aplicada se muestra la sugerencia, y el rotulo de
                  arriba aclara que nadie la asigno. El `GRID n` de fallback
                  solo aplica cuando SI hay asignacion: anunciar un grid que el
                  sistema no registro manda el bulto a una jaula fantasma.
                */}
                {last.applied
                  ? (last.cage?.name ?? `GRID ${last.grid}`)
                  : (last.suggested_cage?.name ?? 'SIN JAULA')}
              </Text>
              <View style={styles.resultMetaRow}>
                {last.applied ? <Text style={styles.resultMeta}>Grid {last.grid}</Text> : null}
                {last.destination_label !== null ? (
                  <Text style={styles.resultMeta}>{last.destination_label}</Text>
                ) : null}
                {last.cage?.session_count !== null && last.cage?.session_count !== undefined ? (
                  <Text style={styles.resultMeta}>
                    {last.cage.session_count}
                    {last.cage.capacity !== null ? ` / ${last.cage.capacity}` : ''} en jaula
                  </Text>
                ) : null}
              </View>
              <Text style={styles.resultDetail}>
                {last.shipment?.tracking ?? last.barcode}
              </Text>
            </View>
          ) : (
            <View style={styles.resultTextWrap}>
              <View style={styles.resultHeaderRow}>
                <Ionicons name="close-circle" size={22} color={theme.colors.danger} />
                <Text style={[styles.resultLabel, { color: theme.colors.danger }]}>
                  SIN JAULA
                </Text>
              </View>
              <Text style={styles.resultGrid}>{messageForResult(last)}</Text>
              <Text style={styles.resultDetail}>
                {last.shipment?.tracking ?? last.barcode}
              </Text>
            </View>
          )}
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
              name={
                item.outcome === 'error'
                  ? 'close-circle'
                  : item.outcome === 'duplicate'
                    ? 'repeat'
                    : 'checkmark-circle'
              }
              size={20}
              color={
                item.outcome === 'error'
                  ? theme.colors.danger
                  : item.outcome === 'duplicate'
                    ? theme.colors.warning
                    : theme.colors.success
              }
            />
            <View style={styles.histTextWrap}>
              <Text style={styles.histTitle}>
                {/*
                  Sin asignacion, `grid` es el de EXCEPCION: repetirlo al lado
                  del nombre leeria como un destino valido.
                */}
                {item.outcome === 'error'
                  ? item.detail
                  : item.applied
                    ? `${item.cageName ?? `Grid ${item.grid}`} · grid ${item.grid}`
                    : `${item.cageName ?? 'Sin jaula'} · sin asignar`}
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
      alignItems: 'flex-start',
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
    resultBannerDuplicate: {
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      borderColor: 'rgba(245, 158, 11, 0.45)',
    },
    resultTextWrap: { flex: 1, minWidth: 0 },
    resultHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    resultLabel: {
      ...typography.captionStrong,
      color: colors.text,
      letterSpacing: 1.1,
    },
    /**
     * El nombre de la jaula es el dato dominante de la pantalla. 44pt se lee de
     * un vistazo con el paquete en la mano; `adjustsFontSizeToFit` baja solo si
     * la jaula tiene un nombre largo.
     */
    resultCage: {
      fontSize: 44,
      lineHeight: 50,
      fontWeight: '900',
      color: colors.text,
      marginTop: 2,
    },
    resultMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginTop: 2,
    },
    resultMeta: {
      ...typography.captionStrong,
      color: colors.muted,
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
