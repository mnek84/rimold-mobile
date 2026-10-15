import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { QrScanner } from '@components/QrScanner';
import { ScreenContainer } from '@components/ui';
import {
  assignShipmentsToCage,
  CAGE_SPECIAL_PURPOSE_LABELS,
  fetchWarehouseCages,
  lookupShipmentForAssignment,
  type ShipmentLookupResult,
  type WarehouseCageListItem,
} from '@core/api/cagesWarehouse';
import { listCrossdockingLocations, type CrossdockingLocation } from '@core/api/crossdockAllocate';
import { playScanFeedback, prepareScanAudio } from '@core/feedback/scanFeedback';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';
import { useTheme, type AppTheme } from '@theme';

/**
 * Asignar un bulto a una jaula SIN escanearlo adentro.
 *
 * Es el equivalente móvil del panel de asignación: el operario resuelve la jaula
 * de un bulto que todavía no entró, o de uno que entró y quedó sin clasificar,
 * caminando por el depósito con el lector.
 *
 * La diferencia con "Crossdocking manual" es que acá NO se registra un escaneo.
 * Esa pantalla dice "llevá esto a la jaula 4" y cuenta el bulto como procesado;
 * ésta dice "este bulto VA a la jaula 4" y el conteo de escaneados sigue en
 * cero hasta que alguien lo meta de verdad. Por eso la consulta usa un endpoint
 * de sólo lectura: resolver el envío con `allocate` movería contadores y
 * rompería el par asignado/escaneado en silencio.
 */
export function AssignShipmentScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const locationsQuery = useQuery({
    queryKey: ['crossdocking-locations'],
    queryFn: listCrossdockingLocations,
  });
  const cagesQuery = useQuery({
    queryKey: ['warehouse', 'cages'],
    queryFn: fetchWarehouseCages,
  });

  const [locationId, setLocationId] = useState<string | null>(null);
  const [found, setFound] = useState<ShipmentLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Ref y no estado: el lector dispara el siguiente código antes de que React
  // haya re-renderizado, y el flag todavía sería `false`.
  const scanInFlightRef = useRef(false);

  useEffect(() => {
    prepareScanAudio();
  }, []);

  useEffect(() => {
    if (locationId === null && locationsQuery.data && locationsQuery.data.length > 0) {
      const def =
        locationsQuery.data.find((l: CrossdockingLocation) => l.is_default) ??
        locationsQuery.data[0];
      setLocationId(def.id);
    }
  }, [locationsQuery.data, locationId]);

  const lookupMutation = useMutation({
    mutationFn: (raw: string) =>
      lookupShipmentForAssignment({ raw, crossdocking_location_id: locationId as string }),
    onSuccess: (res) => {
      scanInFlightRef.current = false;
      if (res.found !== true) {
        playScanFeedback('error');
        setError(res.reason === 'invalid_barcode' ? 'Código inválido.' : 'Ese envío no existe.');
        return;
      }
      playScanFeedback('success');
      setError(null);
      setDone(null);
      setFound(res);
    },
    onError: () => {
      scanInFlightRef.current = false;
      playScanFeedback('error');
      setError('No se pudo leer el envío. Probá de nuevo.');
    },
  });

  const assignMutation = useMutation({
    mutationFn: (cageId: string) =>
      assignShipmentsToCage({
        shipment_ids: [found?.shipment?.id as string],
        cage_id: cageId,
        crossdocking_location_id: locationId as string,
        // El bulto puede estar físicamente en otra jaula: si lo está, el backend
        // mueve también el pivot, que es lo que el operario está haciendo.
        force: true,
      }),
    onSuccess: (res, cageId) => {
      if (res.failed_count > 0) {
        playScanFeedback('error');
        setError(res.failed[0]?.message ?? 'No se pudo asignar.');
        return;
      }
      playScanFeedback('success');
      const cage = (cagesQuery.data ?? []).find((c) => c.id === cageId);
      setDone(`${found?.shipment?.tracking ?? 'El envío'} → ${cage?.name ?? 'jaula'}`);
      setFound(null);
    },
    onError: () => {
      playScanFeedback('error');
      setError('No se pudo asignar. Probá de nuevo.');
    },
  });

  const onScan = useCallback(
    (raw: string) => {
      if (scanInFlightRef.current || locationId === null) return;
      const key = normalizeShipmentScanToLookupKey(raw);
      if (key === '') return;
      scanInFlightRef.current = true;
      lookupMutation.mutate(key);
    },
    [locationId, lookupMutation],
  );

  const cages = useMemo(
    () => (cagesQuery.data ?? []).filter((c) => c.active !== false),
    [cagesQuery.data],
  );
  const zoneCages = cages.filter((c) => c.kind !== 'special');
  const specialCages = cages.filter((c) => c.kind === 'special');

  const renderCage = useCallback(
    ({ item }: { item: WarehouseCageListItem }) => {
      const suggested = found?.suggested_cage?.id === item.id;
      return (
        <Pressable
          style={[styles.cageBtn, suggested && styles.cageBtnSuggested]}
          disabled={assignMutation.isPending}
          onPress={() => assignMutation.mutate(item.id)}
        >
          <Text style={styles.cageBtnName}>{item.name}</Text>
          {item.kind === 'special' && item.special_purpose != null ? (
            <Text style={styles.cageBtnMeta}>
              {CAGE_SPECIAL_PURPOSE_LABELS[item.special_purpose]}
            </Text>
          ) : null}
          {suggested ? <Text style={styles.cageBtnSuggestedTag}>sugerida por CP</Text> : null}
        </Pressable>
      );
    },
    [assignMutation, found, styles],
  );

  return (
    <ScreenContainer>
      <Text style={styles.title}>Asignar a jaula</Text>
      <Text style={styles.subtitle}>
        Elegí jaula o chofer sin tener que escanear el bulto adentro.
      </Text>

      {found === null ? (
        <>
          <View style={styles.scannerBox}>
            <QrScanner onScan={onScan} />
          </View>
          {lookupMutation.isPending ? (
            <View style={styles.hintRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.hintText}>Buscando…</Text>
            </View>
          ) : (
            <View style={styles.hintRow}>
              <Ionicons name="scan-outline" size={16} color={theme.colors.muted} />
              <Text style={styles.hintText}>Apuntá al código del paquete</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.tracking}>{found.shipment?.tracking}</Text>
            <Text style={styles.cardMeta}>{found.business?.name ?? '—'}</Text>
            <Text style={styles.cardMeta}>
              CP {found.destination?.postal_code ?? '—'}
              {found.destination?.city != null ? ` · ${found.destination.city}` : ''}
            </Text>

            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Jaula actual</Text>
              <Text style={styles.cardValue}>{found.assigned_cage?.name ?? 'sin asignar'}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Escaneado</Text>
              {/* Las dos cosas por separado: dónde dice el sistema que va, y si
                  el bulto está realmente adentro. */}
              <Text style={styles.cardValue}>
                {found.scanned_into_cage != null
                  ? `sí · ${found.scanned_into_cage.name}`
                  : 'todavía no'}
              </Text>
            </View>
            {found.preassigned_driver != null ? (
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Chofer</Text>
                <Text style={styles.cardValue}>{found.preassigned_driver.name ?? '—'}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Reparto</Text>
          <FlatList
            data={zoneCages}
            keyExtractor={(c) => c.id}
            renderItem={renderCage}
            numColumns={2}
            columnWrapperStyle={styles.cageRow}
            scrollEnabled={false}
          />

          {specialCages.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Especiales</Text>
              <FlatList
                data={specialCages}
                keyExtractor={(c) => c.id}
                renderItem={renderCage}
                numColumns={2}
                columnWrapperStyle={styles.cageRow}
                scrollEnabled={false}
              />
            </>
          ) : null}

          <Pressable style={styles.cancelBtn} onPress={() => setFound(null)}>
            <Text style={styles.cancelBtnText}>Escanear otro</Text>
          </Pressable>
        </>
      )}

      {done !== null ? (
        <View style={styles.okBanner}>
          <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
          <Text style={styles.okText}>{done}</Text>
        </View>
      ) : null}

      {error !== null ? (
        <View style={styles.errBanner}>
          <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
          <Text style={styles.errText}>{error}</Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    title: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
    subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.lg },
    scannerBox: {
      height: 260,
      borderRadius: spacing.radiusLg,
      overflow: 'hidden',
      marginBottom: spacing.md,
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    hintText: { ...typography.caption, color: colors.muted },
    card: {
      padding: spacing.md,
      borderRadius: spacing.radiusLg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: spacing.lg,
      gap: 2,
    },
    tracking: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
    cardMeta: { ...typography.caption, color: colors.muted },
    cardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    cardLabel: { ...typography.caption, color: colors.muted },
    cardValue: { ...typography.caption, color: colors.text },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.text,
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    cageRow: { gap: spacing.sm, marginBottom: spacing.sm },
    cageBtn: {
      flex: 1,
      padding: spacing.md,
      borderRadius: spacing.radiusLg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cageBtnSuggested: { borderColor: colors.primary, borderWidth: 2 },
    cageBtnName: { ...typography.bodyStrong, color: colors.text },
    cageBtnMeta: { ...typography.caption, color: colors.muted },
    cageBtnSuggestedTag: { ...typography.caption, color: colors.primary },
    cancelBtn: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    cancelBtnText: { ...typography.bodyStrong, color: colors.primary },
    okBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: spacing.radiusLg,
      borderWidth: 1,
      borderColor: colors.success,
      marginTop: spacing.sm,
    },
    okText: { ...typography.caption, color: colors.success, flex: 1 },
    errBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: spacing.radiusLg,
      borderWidth: 1,
      borderColor: colors.danger,
      marginTop: spacing.sm,
    },
    errText: { ...typography.caption, color: colors.danger, flex: 1 },
  });
}
