import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
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
import { parseQrPayload } from '@core/scanner/parseQrPayload';
import { EventType } from '@core/sync/eventTypes';
import { enqueueEvent, scheduleProcessQueueIfOnline } from '@core/sync/syncEngine';
import { useIsOnline } from '@core/sync/useIsOnline';
import {
  validateColectaScan,
  type ColectaScanInvalidReason,
} from '@modules/colecta/api/colectaScan';
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

type ScanError = {
  message: string;
  reason: ColectaScanInvalidReason;
};

function describeInvalidReason(
  reason: ColectaScanInvalidReason,
  details: { currentStatus?: string; mlSenderId?: number },
): string {
  switch (reason) {
    case 'not_found':
      return 'El paquete no existe.';
    case 'wrong_business':
      return 'Este paquete pertenece a otro cliente.';
    case 'invalid_status':
      return details.currentStatus !== undefined && details.currentStatus !== ''
        ? `Estado no válido para colecta (${details.currentStatus}).`
        : 'Estado no válido para colecta.';
    case 'sender_not_authorized':
      return details.mlSenderId !== undefined
        ? `Sender ML ${details.mlSenderId} no autorizado para este depósito.`
        : 'Sender ML no autorizado para este depósito.';
    case 'network':
      return 'Sin conexión. Reintentá cuando vuelvas a tener red.';
  }
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
  const removeScannedItem = useColectaSessionStore((s) => s.removeScannedItem);
  const markCollectionStartedEmitted = useColectaSessionStore((s) => s.markCollectionStartedEmitted);
  const clearColectaSession = useColectaSessionStore((s) => s.clearSession);

  const isOnline = useIsOnline();

  const [storeHydrated, setStoreHydrated] = useState(
    () => useColectaSessionStore.persist.hasHydrated(),
  );
  const [lastScanned, setLastScanned] = useState<{
    trackingId: string;
    source: ColectaScanSource;
  } | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const lastScannedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Locks the scanner while a backend validation is in flight (prevents double-scan races). */
  const validatingRef = useRef<boolean>(false);
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
      if (scanErrorTimerRef.current !== null) clearTimeout(scanErrorTimerRef.current);
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

  const triggerScanError = useCallback((error: ScanError) => {
    Vibration.vibrate([0, 80, 60, 80]);
    if (scanErrorTimerRef.current !== null) clearTimeout(scanErrorTimerRef.current);
    setScanError(error);
    setLastScanned(null);
    scanErrorTimerRef.current = setTimeout(() => setScanError(null), 4500);
  }, []);

  const onScan = useCallback(
    (raw: string) => {
      if (collectionId == null || clientId === '' || warehouseId === '') return;
      if (validatingRef.current) return;
      if (!isOnline) {
        triggerScanError({
          reason: 'network',
          message: describeInvalidReason('network', {}),
        });
        return;
      }
      const trimmed = raw.trim();
      if (trimmed === '') return;

      validatingRef.current = true;
      setIsValidating(true);
      void (async () => {
        try {
          const result = await validateColectaScan({
            raw: trimmed,
            collectionId,
            businessId: clientId,
            warehouseId,
          });

          if (!result.valid) {
            triggerScanError({
              reason: result.reason,
              message: describeInvalidReason(result.reason, {
                currentStatus: result.currentStatus,
                mlSenderId: result.mlSenderId,
              }),
            });
            return;
          }

          const trackingId = result.trackingId;
          const source = scanSourceFromParse(trimmed);
          const already = useColectaSessionStore
            .getState()
            .items.some((i) => i.trackingId === trackingId);
          if (already) {
            triggerScanFeedback(trackingId, source);
            return;
          }
          if (enqueuedTrackingRef.current.has(trackingId)) {
            triggerScanFeedback(trackingId, source);
            return;
          }
          enqueuedTrackingRef.current.add(trackingId);

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
          if (scanErrorTimerRef.current !== null) clearTimeout(scanErrorTimerRef.current);
          setScanError(null);
          await enqueueEvent({
            type: EventType.COLLECTION_ITEM_ADDED,
            payload: { collectionId, trackingId, raw: trimmed },
          });
          scheduleProcessQueueIfOnline();
        } finally {
          validatingRef.current = false;
          setIsValidating(false);
        }
      })();
    },
    [
      clientId,
      warehouseId,
      collectionId,
      clientName,
      warehouseName,
      isOnline,
      addScannedItem,
      triggerScanFeedback,
      triggerScanError,
      markCollectionStartedEmitted,
      authUser?.id,
      authUser?.name,
    ],
  );

  const onRemoveItem = useCallback(
    (trackingId: string) => {
      if (collectionId == null) return;
      if (!isOnline) {
        triggerScanError({
          reason: 'network',
          message: describeInvalidReason('network', {}),
        });
        return;
      }
      Alert.alert(
        'Eliminar paquete',
        '¿Quitar este paquete de la colecta? La operación se sincronizará con el backend.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                removeScannedItem(trackingId);
                enqueuedTrackingRef.current.delete(trackingId);
                Vibration.vibrate(40);
                await enqueueEvent({
                  type: EventType.COLLECTION_ITEM_REMOVED,
                  payload: { collectionId, trackingId, raw: trackingId },
                });
                scheduleProcessQueueIfOnline();
              })();
            },
          },
        ],
      );
    },
    [collectionId, isOnline, removeScannedItem, triggerScanError],
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
        {(!isOnline || isValidating) && (
          <View style={styles.scannerLockOverlay} pointerEvents="none">
            {isValidating && <ActivityIndicator color="#ffffff" />}
            <Text style={styles.scannerLockText}>
              {!isOnline ? 'Sin conexión' : 'Validando…'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Banner offline (persistente mientras no haya red) ── */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={theme.colors.danger} />
          <Text style={styles.offlineBannerText}>
            Sin conexión. La colecta requiere red para validar paquetes.
          </Text>
        </View>
      )}

      {/* ── Banner de error de scan (transitorio) ── */}
      {scanError !== null && (
        <View style={styles.scanErrorBanner}>
          <Ionicons name="close-circle" size={22} color={theme.colors.danger} />
          <Text style={styles.scanErrorText}>{scanError.message}</Text>
        </View>
      )}

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
          <Pressable
            onLongPress={() => onRemoveItem(item.trackingId)}
            delayLongPress={450}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityHint="Mantené presionado para quitar este paquete de la colecta"
          >
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
            <Ionicons name="ellipsis-vertical" size={14} color={theme.colors.muted} />
          </Pressable>
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
    rowPressed: {
      opacity: 0.7,
      backgroundColor: colors.background,
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
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.45)',
      borderRadius: spacing.radiusMd,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    offlineBannerText: {
      ...typography.captionStrong,
      color: colors.danger,
      flex: 1,
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
