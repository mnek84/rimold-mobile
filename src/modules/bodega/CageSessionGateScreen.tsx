import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, ScreenContainer } from '@components/ui';
import { fetchActiveCageSession, startCageSession } from '@core/api/cageSessions';
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

export function CageSessionGateScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<BodegaStackNav<'CageSessionGate'>>();
  const qc = useQueryClient();
  const [startError, setStartError] = useState<string | null>(null);

  const sessionQ = useQuery({
    queryKey: ['cage-sessions', 'active'],
    queryFn: fetchActiveCageSession,
    refetchInterval: 4_000,
    staleTime: 0,
  });

  // If an active session shows up (own start or another device's), jump to the
  // dashboard so we don't keep showing the "Iniciar" button.
  useFocusEffect(
    useCallback(() => {
      if (sessionQ.data?.session?.id != null) {
        navigation.navigate('CageList');
      }
    }, [navigation, sessionQ.data?.session?.id]),
  );

  const startMut = useMutation({
    mutationFn: startCageSession,
    onSuccess: async (view) => {
      qc.setQueryData(['cage-sessions', 'active'], view);
      await qc.invalidateQueries({ queryKey: ['warehouse', 'cages'] });
      if (view.session?.id != null) {
        navigation.navigate('CageList');
      }
    },
    onError: (e: unknown) => {
      if (isAxiosError(e) && e.response?.status === 409) {
        setStartError('Ya hay una sesión activa. Refrescá para verla.');
        void qc.invalidateQueries({ queryKey: ['cage-sessions', 'active'] });
        return;
      }
      setStartError(axiosMessage(e, 'No se pudo iniciar la sesión.'));
    },
  });

  if (sessionQ.isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingLabel}>Cargando sesión…</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Sesión de jaulas</Text>
      <Text style={styles.subtitle}>
        Cuando llegan los choferes con la colecta, iniciá una sesión para que el
        equipo pueda escanear los envíos a las jaulas. Al cerrar la sesión se
        asignan choferes a cada jaula y se generan las rutas.
      </Text>

      <Button
        onPress={() => {
          setStartError(null);
          startMut.mutate();
        }}
        loading={startMut.isPending}
        disabled={startMut.isPending}
        style={styles.startBtn}
      >
        Iniciar sesión de jaulas
      </Button>

      {startError !== null ? <Text style={styles.err}>{startError}</Text> : null}

      <Text style={styles.hint}>
        El nombre de la sesión se asigna automáticamente según la hora.
      </Text>
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
      gap: spacing.sm,
    },
    loadingLabel: {
      ...typography.caption,
      color: colors.muted,
    },
    title: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.body,
      color: colors.muted,
      marginBottom: spacing.lg,
    },
    startBtn: {
      marginBottom: spacing.md,
    },
    err: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    hint: {
      ...typography.caption,
      color: colors.muted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
  });
}
