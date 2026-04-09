import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { QrScanner } from '@components/QrScanner';
import { Button, ScreenContainer } from '@components/ui';
import {
  closeWarehouseCage,
  fetchDriversForAssignment,
  fetchWarehouseCageDetail,
  scanPackageIntoCage,
  type DriverForAssignment,
  type WarehouseCageShipment,
} from '@core/api/cagesWarehouse';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';
import type { BodegaStackParamList } from '@navigation/bodegaStackTypes';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

type Props = NativeStackScreenProps<BodegaStackParamList, 'CageWorkspace'>;

type ScanErrorRow = { id: string; code: string; message: string };

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

export function CageWorkspaceScreen({ navigation, route }: Props) {
  const { cageId, cageName } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const qc = useQueryClient();

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanErrors, setScanErrors] = useState<ScanErrorRow[]>([]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['warehouse', 'cages', 'detail', cageId],
    queryFn: () => fetchWarehouseCageDetail(cageId),
  });

  const driversQuery = useQuery({
    queryKey: ['warehouse', 'drivers-for-assignment'],
    queryFn: fetchDriversForAssignment,
    enabled: closeOpen,
  });

  const scanMutation = useMutation({
    mutationFn: (tracking: string) => scanPackageIntoCage(cageId, tracking),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages'] });
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages', 'detail', cageId] });
    },
    onError: (e, tracking) => {
      const msg = axiosMessage(e, 'No se pudo agregar el paquete.');
      setScanErrors((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          code: tracking,
          message: msg,
        },
        ...prev,
      ]);
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

  const shipments: WarehouseCageShipment[] = detailQuery.data?.shipments ?? [];
  const okCount = shipments.length;

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
      const t = resolveTrackingFromScanRaw(raw);
      if (t === '') return;
      setScannerOpen(false);
      scanMutation.mutate(t);
    },
    [scanMutation],
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

  return (
    <ScreenContainer scroll keyboardAvoiding>
      <Text style={styles.cageLabel}>Jaula</Text>
      <Text style={styles.cageName}>{cageName}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, styles.statOk]}>{okCount}</Text>
          <Text style={styles.statLabel}>OK en jaula</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, styles.statBad]}>{scanErrors.length}</Text>
          <Text style={styles.statLabel}>Errores de escaneo</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Agregar paquete</Text>
      <Pressable
        style={[styles.qrPrimaryBtn, scanMutation.isPending && styles.qrPrimaryBtnDisabled]}
        onPress={() => setScannerOpen(true)}
        disabled={scanMutation.isPending}
      >
        <Ionicons name="qr-code-outline" size={32} color="#fff" style={styles.qrPrimaryIcon} />
        <View style={styles.qrPrimaryTextWrap}>
          <Text style={styles.qrPrimaryTitle}>Escanear QR</Text>
          <Text style={styles.qrPrimarySub}>Apuntá al código del paquete</Text>
        </View>
      </Pressable>
      {scanMutation.isPending ? (
        <Text style={styles.scanPendingLabel}>Registrando paquete…</Text>
      ) : null}

      {scanErrors.length > 0 ? (
        <View style={styles.errorsBlock}>
          <Text style={styles.errorsTitle}>Últimos rechazos</Text>
          {scanErrors.slice(0, 6).map((row) => (
            <Text key={row.id} style={styles.errorLine} numberOfLines={2}>
              <Text style={styles.errorCode}>{row.code}</Text> — {row.message}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.listHeaderRow}>
        <Text style={styles.sectionLabel}>Paquetes en esta jaula</Text>
        {detailQuery.isFetching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>
      {detailQuery.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : shipments.length === 0 ? (
        <Text style={styles.emptyList}>Todavía no hay paquetes. Escaneá el primero.</Text>
      ) : (
        <View style={styles.shipList}>
          {shipments.map((item) => (
            <View key={item.id} style={styles.shipRow}>
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
          ))}
        </View>
      )}

      <View style={styles.footer}>
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
        >
          {okCount === 0 ? 'Cerrar jaula' : 'Cerrar jaula y asignar conductor'}
        </Button>
        {closeError !== null && !closeOpen ? <Text style={styles.footerCloseErr}>{closeError}</Text> : null}
      </View>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.modalWrap}>
          <Text style={styles.modalTitle}>Apuntá al QR del paquete</Text>
          <QrScanner onScan={onQrScanned} containerStyle={styles.scannerBox} />
          <Pressable style={styles.modalClose} onPress={() => setScannerOpen(false)}>
            <Text style={styles.modalCloseLabel}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>

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
    statsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    statBox: {
      flex: 1,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: borderSubtle,
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
      marginBottom: spacing.sm,
    },
    qrPrimaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.primary,
      marginBottom: spacing.md,
    },
    qrPrimaryBtnDisabled: {
      opacity: 0.65,
    },
    qrPrimaryIcon: {
      opacity: 0.95,
    },
    qrPrimaryTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    qrPrimaryTitle: {
      ...typography.subtitle,
      color: '#fff',
    },
    qrPrimarySub: {
      ...typography.caption,
      color: '#ffffffcc',
      marginTop: 4,
    },
    scanPendingLabel: {
      ...typography.caption,
      color: colors.muted,
      marginBottom: spacing.md,
    },
    errorsBlock: {
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.danger + '44',
    },
    errorsTitle: {
      ...typography.captionStrong,
      color: colors.danger,
      marginBottom: spacing.xs,
    },
    errorLine: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 4,
    },
    errorCode: {
      ...typography.captionStrong,
      color: colors.text,
    },
    listHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    shipList: {
      marginBottom: spacing.md,
    },
    shipRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: borderSubtle,
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
    footer: {
      marginTop: 'auto',
      paddingTop: spacing.md,
    },
    footerCloseErr: {
      ...typography.caption,
      color: colors.danger,
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    modalWrap: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: spacing.xxl,
      paddingHorizontal: spacing.md,
    },
    modalTitle: {
      ...typography.subtitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    scannerBox: {
      flex: 1,
      minHeight: 320,
    },
    modalClose: {
      padding: spacing.lg,
      alignItems: 'center',
    },
    modalCloseLabel: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
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
      borderColor: borderSubtle,
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
      color: '#fff',
    },
  });
}
