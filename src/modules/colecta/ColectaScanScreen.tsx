import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const BEEP_ASSET = require('../../../assets/sounds/industrial_beep.wav') as number;

import { Button, ScreenContainer } from '@components/ui';
import { QrScanner } from '@components/QrScanner';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';
import { parseQrPayload } from '@core/scanner/parseQrPayload';
import { EventType } from '@core/sync/eventTypes';
import { enqueueEvent, scheduleProcessQueueIfOnline } from '@core/sync/syncEngine';
import { useColectaSelectionStore } from '@modules/colecta/colectaSelectionStore';
import {
  type ColectaScanSource,
  useColectaSessionStore,
} from '@modules/colecta/colectaSessionStore';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { borderSubtle, useTheme, type AppTheme } from '@theme';
import { useAuthStore } from '@store/useAuthStore';

type Props = NativeStackScreenProps<ColectaStackParamList, 'ColectaScan'>;

/**
 * Muestra el tracking ID de forma legible para el chofer.
 * Oculta UUIDs/strings largos mostrando solo lo relevante.
 */
function scanSourceFromParse(raw: string): ColectaScanSource {
  const p = parseQrPayload(raw.trim());
  if (p.type === 'mercadolibre') return 'flex';
  if (p.type === 'internal') return 'interno';
  return 'externo';
}

function formatTrackingDisplay(trackingId: string): string {
  if (trackingId.startsWith('TRK_')) {
    return '#' + trackingId.slice(4, 14).toUpperCase();
  }
  if (trackingId.length > 16) {
    return trackingId.slice(0, 13).toUpperCase() + '…';
  }
  return trackingId.toUpperCase();
}

const CORNER_SIZE = 22;
const CORNER_THICKNESS = 3;

export function ColectaScanScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const clientId = route.params?.clientId ?? '';
  const clientName = route.params?.clientName ?? '';
  const warehouseId = route.params?.warehouseId ?? '';
  const warehouseName = route.params?.warehouseName ?? '';

  const authUser = useAuthStore((s) => s.user);

  const setColectaSelection = useColectaSelectionStore((s) => s.setSelection);
  const clearColectaSelection = useColectaSelectionStore((s) => s.clearSelection);

  const collectionId = useColectaSessionStore((s) => s.collectionId);
  const items = useColectaSessionStore((s) => s.items);
  const sessionClientId = useColectaSessionStore((s) => s.clientId);
  const sessionWarehouseId = useColectaSessionStore((s) => s.warehouseId);
  const addScannedItem = useColectaSessionStore((s) => s.addScannedItem);
  const markCollectionStartedEmitted = useColectaSessionStore((s) => s.markCollectionStartedEmitted);
  const clearColectaSession = useColectaSessionStore((s) => s.clearSession);

  const [storeHydrated, setStoreHydrated] = useState(
    () => useColectaSessionStore.persist.hasHydrated(),
  );
  const [lastScanned, setLastScanned] = useState<{
    trackingId: string;
    source: ColectaScanSource;
  } | null>(null);
  const lastScannedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Animaciones ────────────────────────────────────────────────────────
  // Flash verde sobre el scanner cuando se escanea exitosamente
  const scanFlashOpacity = useSharedValue(0);
  // Rebote en el contador de paquetes
  const counterScale = useSharedValue(1);

  const scanFlashStyle = useAnimatedStyle(() => ({ opacity: scanFlashOpacity.value }));
  const counterAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: counterScale.value }],
  }));

  // Configurar audio mode una sola vez al montar
  useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    return () => {
      if (lastScannedTimerRef.current !== null) clearTimeout(lastScannedTimerRef.current);
    };
  }, []);

  /** Reproduce el beep creando y descartando el Sound object — patrón más confiable con expo-av. */
  const playBeep = useCallback(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(BEEP_ASSET, { shouldPlay: true, volume: 1 });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void sound.unloadAsync();
        }
      });
    } catch {
      // Si falla el audio, la vibración y el visual siguen funcionando
    }
  }, []);

  useEffect(() => {
    if (useColectaSessionStore.persist.hasHydrated()) return;
    const unsub = useColectaSessionStore.persist.onFinishHydration(() => setStoreHydrated(true));
    return unsub;
  }, []);

  const enqueuedTrackingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    enqueuedTrackingRef.current = new Set(items.map((i) => i.trackingId));
  }, [collectionId, items]);

  useEffect(() => {
    if (!storeHydrated) return;
    if (clientId === '' || warehouseId === '') {
      clearColectaSelection();
      navigation.replace('ClientSelection');
      return;
    }
    if (
      collectionId == null ||
      sessionClientId !== clientId ||
      sessionWarehouseId !== warehouseId
    ) {
      clearColectaSession();
      clearColectaSelection();
      navigation.replace('ClientSelection');
      return;
    }
    setColectaSelection({ clientId, clientName, warehouseId, warehouseName });
  }, [
    clientId,
    clientName,
    warehouseId,
    warehouseName,
    collectionId,
    sessionClientId,
    sessionWarehouseId,
    clearColectaSession,
    clearColectaSelection,
    navigation,
    setColectaSelection,
    storeHydrated,
  ]);

  /** Feedback multisensorial al escanear exitosamente: vibración + flash verde + rebote contador. */
  const triggerScanFeedback = useCallback(
    (trackingId: string, source: ColectaScanSource) => {
      // Sonido de beep + vibración táctil
      void playBeep();
      Vibration.vibrate(55);

      // Flash verde sobre la cámara
      scanFlashOpacity.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 380 }),
      );

      // Rebote del contador
      counterScale.value = withSequence(
        withSpring(1.3, { damping: 3, stiffness: 320 }),
        withSpring(1, { damping: 8, stiffness: 180 }),
      );

      // Último escaneo visible por 3 segundos
      if (lastScannedTimerRef.current !== null) clearTimeout(lastScannedTimerRef.current);
      setLastScanned({ trackingId, source });
      lastScannedTimerRef.current = setTimeout(() => setLastScanned(null), 3000);
    },
    [playBeep, scanFlashOpacity, counterScale],
  );

  const onScan = useCallback(
    (raw: string) => {
      if (collectionId == null || clientId === '' || warehouseId === '') return;
      const trackingId = normalizeShipmentScanToLookupKey(raw);
      if (trackingId === '') return;
      const source = scanSourceFromParse(raw);
      const already = useColectaSessionStore.getState().items.some(
        (i) => i.trackingId === trackingId,
      );
      if (already) return;
      if (enqueuedTrackingRef.current.has(trackingId)) return;
      enqueuedTrackingRef.current.add(trackingId);
      void (async () => {
        const sess = useColectaSessionStore.getState();
        if (!sess.collectionStartedEmitted) {
          await enqueueEvent({
            type: EventType.COLLECTION_STARTED,
            payload: {
              collectionId,
              businessId: clientId,
              warehouseId,
              businessName: clientName,
              warehouseName,
              ...(authUser?.id ? { driverUserId: authUser.id } : {}),
              ...(authUser?.name?.trim() ? { driverName: authUser.name.trim() } : {}),
            },
          });
          markCollectionStartedEmitted();
        }
        addScannedItem(trackingId, source);
        triggerScanFeedback(trackingId, source);
        await enqueueEvent({
          type: EventType.COLLECTION_ITEM_ADDED,
          payload: { collectionId, trackingId, raw: trackingId },
        });
        scheduleProcessQueueIfOnline();
      })();
    },
    [
      clientId,
      warehouseId,
      collectionId,
      clientName,
      warehouseName,
      addScannedItem,
      triggerScanFeedback,
      markCollectionStartedEmitted,
      authUser?.id,
      authUser?.name,
    ],
  );

  const onFinalize = useCallback(() => {
    if (collectionId == null) return;
    const latest = useColectaSessionStore.getState().items;
    const n = latest.length;
    Alert.alert(
      'Finalizar colecta',
      n === 0
        ? '¿Cerrar la sesión sin paquetes escaneados?'
        : `Se registrarán ${n} paquete(s) y se cerrará la sesión.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'default',
          onPress: () => {
            void (async () => {
              const ids = useColectaSessionStore.getState().items.map((i) => i.trackingId);
              if (ids.length > 0) {
                await enqueueEvent({
                  type: EventType.COLLECTION_FINISHED,
                  payload: { collectionId, items: ids },
                });
                scheduleProcessQueueIfOnline();
              }
              clearColectaSession();
              clearColectaSelection();
              navigation.replace('ClientSelection');
            })();
          },
        },
      ],
    );
  }, [collectionId, clearColectaSession, clearColectaSelection, navigation]);

  if (!storeHydrated) {
    return (
      <ScreenContainer contentContainerStyle={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.muted}>Cargando sesión…</Text>
      </ScreenContainer>
    );
  }

  if (clientId === '' || warehouseId === '' || collectionId == null) return null;

  return (
    <ScreenContainer>
      {/* ── Header: cliente y depósito — sin UUIDs ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Ionicons name="business-outline" size={14} color={theme.colors.muted} />
          <Text style={styles.clientName}>{clientName}</Text>
        </View>
        <View style={styles.headerRow}>
          <Ionicons name="location-outline" size={14} color={theme.colors.muted} />
          <Text style={styles.warehouseName}>{warehouseName}</Text>
        </View>
      </View>

      {/* ── Scanner con overlay de flash y esquinas decorativas ── */}
      <View style={styles.scannerWrap}>
        <QrScanner onScan={onScan} scanCooldownMs={1500} containerStyle={styles.scanner} />
        {/* Flash verde en escaneo exitoso */}
        <Animated.View style={[styles.scanFlash, scanFlashStyle]} pointerEvents="none" />
        {/* Esquinas estilo visor de scanner */}
        <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
        <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
      </View>

      {/* ── Último escaneo / hint ── */}
      {lastScanned !== null ? (
        <View style={styles.lastScannedBanner}>
          <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
          <View style={styles.lastScannedTextWrap}>
            <Text style={styles.lastScannedLabel}>¡Escaneado!</Text>
            <View style={styles.lastScannedIdRow}>
              <Text style={styles.lastScannedId}>
                {formatTrackingDisplay(lastScanned.trackingId)}
              </Text>
              {(lastScanned.source === 'flex' || lastScanned.source === 'interno') && (
                <View
                  style={[
                    styles.sourcePill,
                    lastScanned.source === 'flex' ? styles.sourcePillFlex : styles.sourcePillInterno,
                  ]}
                >
                  <Text style={styles.sourcePillText}>
                    {lastScanned.source === 'flex' ? 'FLEX' : 'INTERNO'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.hintRow}>
          <Ionicons name="scan-outline" size={16} color={theme.colors.muted} />
          <Text style={styles.hintText}>Apuntá al código QR del paquete</Text>
        </View>
      )}

      {/* ── Contador con animación de rebote ── */}
      <Animated.View style={[styles.counterCard, counterAnimStyle]}>
        <Text style={styles.counterNumber}>{items.length}</Text>
        <Text style={styles.counterUnit}>{items.length === 1 ? 'paquete' : 'paquetes'}</Text>
        <View style={styles.counterSpacer} />
        <Ionicons name="cube-outline" size={20} color={theme.colors.muted} />
      </Animated.View>

      {/* ── Finalizar ── */}
      <Button variant="primary" size="lg" onPress={onFinalize} style={styles.finalizeBtn}>
        Finalizar colecta
      </Button>

      {/* ── Lista de paquetes escaneados ── */}
      <FlatList
        data={items}
        keyExtractor={(item, i) => `${item.trackingId}-${i}`}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="cube-outline" size={36} color={theme.colors.muted} />
            <Text style={styles.emptyText}>Aún no escaneaste paquetes</Text>
            <Text style={styles.emptyHint}>Los paquetes aparecerán aquí</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <View style={styles.rowBadge}>
              <Text style={styles.rowNum}>{index + 1}</Text>
            </View>
            <Ionicons name="cube" size={16} color={theme.colors.primary} />
            <Text style={styles.rowText} numberOfLines={1}>
              {formatTrackingDisplay(item.trackingId)}
            </Text>
            {(item.source === 'flex' || item.source === 'interno') && (
              <View
                style={[
                  styles.sourcePill,
                  item.source === 'flex' ? styles.sourcePillFlex : styles.sourcePillInterno,
                ]}
              >
                <Text style={styles.sourcePillText}>
                  {item.source === 'flex' ? 'FLEX' : 'INTERNO'}
                </Text>
              </View>
            )}
          </View>
        )}
      />
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    centered: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    muted: { ...typography.caption, color: colors.muted },

    // ── Header ────────────────────────────────────────────────────────
    header: {
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    clientName: {
      ...typography.subtitle,
      color: colors.text,
    },
    warehouseName: {
      ...typography.body,
      color: colors.muted,
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
    scanFlash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(34, 197, 94, 0.48)',
    },
    // Esquinas decorativas (efecto visor)
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

    // ── Último escaneo ─────────────────────────────────────────────────
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
    lastScannedTextWrap: { flex: 1 },
    lastScannedLabel: {
      ...typography.captionStrong,
      color: colors.success,
    },
    lastScannedIdRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: 2,
    },
    lastScannedId: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    sourcePill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: 6,
    },
    sourcePillFlex: {
      backgroundColor: 'rgba(245, 158, 11, 0.2)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(245, 158, 11, 0.55)',
    },
    sourcePillInterno: {
      backgroundColor: 'rgba(37, 99, 235, 0.12)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(37, 99, 235, 0.35)',
    },
    sourcePillText: {
      ...typography.captionStrong,
      fontSize: 11,
      letterSpacing: 0.6,
      color: colors.text,
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

    // ── Contador ───────────────────────────────────────────────────────
    counterCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: borderSubtle,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    counterNumber: {
      fontSize: 38,
      fontWeight: '700' as const,
      lineHeight: 42,
      color: colors.primary,
    },
    counterUnit: {
      ...typography.bodyStrong,
      color: colors.muted,
      alignSelf: 'flex-end',
      paddingBottom: 4,
    },
    counterSpacer: { flex: 1 },

    // ── Botón ──────────────────────────────────────────────────────────
    finalizeBtn: { marginBottom: spacing.md },

    // ── Lista ──────────────────────────────────────────────────────────
    list: { flex: 1 },
    emptyWrap: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xxl,
    },
    emptyText: {
      ...typography.body,
      color: colors.muted,
      marginTop: spacing.sm,
    },
    emptyHint: {
      ...typography.caption,
      color: colors.muted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusLg,
      marginBottom: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: borderSubtle,
    },
    rowBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(37, 99, 235, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowNum: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    rowText: {
      flex: 1,
      ...typography.bodyStrong,
      color: colors.text,
    },
  });
}
