import { CommonActions, useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useMemo, useState } from 'react';
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

import { Button, ScreenContainer } from '@components/ui';
import { closeCageSession, fetchActiveCageSession } from '@core/api/cageSessions';
import { fetchDriversForAssignment, type DriverForAssignment } from '@core/api/cagesWarehouse';
import type { BodegaStackNav } from '@navigation/bodegaStackTypes';
import { useTheme, type AppTheme } from '@theme';

function axiosMessage(e: unknown, fallback: string): string {
  if (isAxiosError(e)) {
    const data = e.response?.data;
    if (data !== null && typeof data === 'object' && 'message' in data) {
      const m = (data as { message: unknown }).message;
      if (typeof m === 'string' && m !== '') return m;
    }
  }
  return e instanceof Error && e.message !== '' ? e.message : fallback;
}

export function CloseCageSessionScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<BodegaStackNav<'CloseCageSession'>>();
  const qc = useQueryClient();

  const sessionQ = useQuery({
    queryKey: ['cage-sessions', 'active'],
    queryFn: fetchActiveCageSession,
  });
  const driversQ = useQuery({
    queryKey: ['warehouse', 'drivers-for-assignment'],
    queryFn: fetchDriversForAssignment,
  });

  const session = sessionQ.data?.session ?? null;
  const cages = sessionQ.data?.cages ?? [];
  const cagesWithPackages = cages.filter((c) => c.shipments_count > 0);

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [pickerCageId, setPickerCageId] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  const drivers = driversQ.data ?? [];
  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (q === '') return drivers;
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, driverSearch]);

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.name);
    return map;
  }, [drivers]);

  const closeMut = useMutation({
    mutationFn: () => {
      if (session === null) {
        return Promise.reject(new Error('No hay sesión activa.'));
      }
      return closeCageSession(
        session.id,
        cagesWithPackages.map((c) => ({
          cage_id: c.id,
          driver_id: assignments[c.id] ?? null,
        })),
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cage-sessions'] });
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages'] });
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'CageSessionGate' }],
        }),
      );
    },
    onError: (e: unknown) => {
      setCloseError(axiosMessage(e, 'No se pudo cerrar la sesión.'));
    },
  });

  const onPickDriver = useCallback((cageId: string, driverId: string) => {
    setAssignments((prev) => ({ ...prev, [cageId]: driverId }));
    setPickerCageId(null);
    setDriverSearch('');
  }, []);

  const missingCount = cagesWithPackages.filter((c) => !assignments[c.id]).length;
  const canSubmit =
    session !== null && cagesWithPackages.length > 0 && missingCount === 0 && !closeMut.isPending;

  if (sessionQ.isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (session === null) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Sin sesión activa</Text>
        <Text style={styles.subtitle}>Volvé al inicio del depósito.</Text>
        <Button onPress={() => navigation.navigate('CageSessionGate')} style={styles.startBtn}>
          Volver
        </Button>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Cerrar sesión {session.name}</Text>
      <Text style={styles.subtitle}>
        Asigná un chofer a cada jaula con paquetes. Al confirmar, todas las
        jaulas se cierran y se generan las rutas / lotes Flex correspondientes.
      </Text>

      {cagesWithPackages.length === 0 ? (
        <Text style={styles.empty}>
          No hay jaulas con paquetes. Podés cerrar igualmente.
        </Text>
      ) : null}

      <FlatList
        data={cagesWithPackages}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const driverId = assignments[item.id];
          const driverName = driverId != null ? driverNameById.get(driverId) : null;
          return (
            <View style={styles.cageRow}>
              <View style={styles.cageRowMain}>
                <Text style={styles.cageName}>{item.name}</Text>
                <Text style={styles.cageMeta}>
                  {item.shipments_count} paquete{item.shipments_count === 1 ? '' : 's'}
                  {item.zone ? ` · ${item.zone.name}` : ''}
                </Text>
              </View>
              <Pressable
                style={styles.pickBtn}
                onPress={() => setPickerCageId(item.id)}
                disabled={driversQ.isLoading}
              >
                <Text style={styles.pickBtnLabel}>
                  {driverName ?? 'Elegir chofer'}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />

      {closeError !== null ? <Text style={styles.err}>{closeError}</Text> : null}

      <Button
        onPress={() => {
          setCloseError(null);
          closeMut.mutate();
        }}
        disabled={!canSubmit}
        loading={closeMut.isPending}
        style={styles.confirmBtn}
      >
        {missingCount > 0
          ? `Falta chofer en ${missingCount} jaula${missingCount === 1 ? '' : 's'}`
          : 'Cerrar y planificar'}
      </Button>

      <Modal
        visible={pickerCageId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerCageId(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPickerCageId(null)} />
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>Elegí un chofer</Text>
            <TextInput
              value={driverSearch}
              onChangeText={setDriverSearch}
              placeholder="Buscar por nombre…"
              placeholderTextColor={theme.colors.muted}
              style={styles.search}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {driversQ.isLoading ? (
              <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
            ) : (
              <FlatList
                data={filteredDrivers}
                keyExtractor={(d) => d.id}
                keyboardShouldPersistTaps="handled"
                style={styles.driverList}
                renderItem={({ item }: { item: DriverForAssignment }) => (
                  <Pressable
                    style={styles.driverRow}
                    onPress={() => {
                      if (pickerCageId === null) return;
                      onPickDriver(pickerCageId, item.id);
                    }}
                  >
                    <Text style={styles.driverName}>{item.name}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyList}>
                    {drivers.length === 0 ? 'No hay choferes activos.' : 'Sin resultados.'}
                  </Text>
                }
              />
            )}
            <Pressable style={styles.cancelBtn} onPress={() => setPickerCageId(null)}>
              <Text style={styles.cancelBtnLabel}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      ...typography.body,
      color: colors.muted,
      marginBottom: spacing.lg,
    },
    empty: {
      ...typography.caption,
      color: colors.muted,
      marginBottom: spacing.md,
    },
    listContent: {
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    cageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cageRowMain: { flex: 1, minWidth: 0 },
    cageName: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    cageMeta: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 2,
    },
    pickBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.primary + '66',
      backgroundColor: colors.primary + '11',
    },
    pickBtnLabel: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    err: {
      ...typography.caption,
      color: colors.danger,
      marginVertical: spacing.sm,
      textAlign: 'center',
    },
    confirmBtn: {
      marginTop: spacing.md,
    },
    startBtn: {
      marginTop: spacing.md,
    },
    modalRoot: {
      flex: 1,
      backgroundColor: '#000a',
      justifyContent: 'flex-end',
    },
    backdrop: {
      flex: 1,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: spacing.radiusLg,
      borderTopRightRadius: spacing.radiusLg,
      padding: spacing.lg,
      maxHeight: '88%',
    },
    modalTitle: {
      ...typography.subtitle,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    search: {
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
    loader: {
      marginVertical: spacing.md,
    },
    driverList: {
      flexGrow: 0,
      maxHeight: 320,
    },
    driverRow: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.radiusSm,
    },
    driverName: {
      ...typography.body,
      color: colors.text,
    },
    emptyList: {
      ...typography.caption,
      color: colors.muted,
      paddingVertical: spacing.md,
      textAlign: 'center',
    },
    cancelBtn: {
      padding: spacing.md,
      alignItems: 'center',
    },
    cancelBtnLabel: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
  });
}
