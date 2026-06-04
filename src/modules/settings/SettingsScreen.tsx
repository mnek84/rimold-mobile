import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ScreenContainer } from '@components/ui';
import { refreshSessionUser } from '@core/api/auth';
import {
  getInstalledVersionCode,
  getInstalledVersionName,
  isAndroidAppUpdateSupported,
  useAppUpdateStore,
} from '@core/app-update';
import { showToast } from '@core/feedback/toastStore';
import { getUserRoles, type AuthRole } from '@core/auth/types';
import { queryClient } from '@core/query/queryClient';
import { processQueue, useSyncStatusStore } from '@core/sync';
import type { MainTabParamList } from '@navigation/types';
import { useAuthStore } from '@store/useAuthStore';
import { useTheme, type AppTheme } from '@theme';

type Props = BottomTabScreenProps<MainTabParamList, 'Ajustes'>;

type IonName = ComponentProps<typeof Ionicons>['name'];

function roleLabel(role: AuthRole): string {
  switch (role) {
    case 'DRIVER':
      return 'Conductor';
    case 'WAREHOUSE':
      return 'Bodega';
    default:
      return role;
  }
}

function rolesLabel(roles: AuthRole[]): string {
  return roles.map((role) => roleLabel(role)).join(' + ');
}

function SectionHeader({
  icon,
  title,
  iconColor,
  styles,
}: {
  icon: IonName;
  title: string;
  iconColor: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export function SettingsScreen(_props: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  const pendingCount = useSyncStatusStore((s) => s.pendingCount);
  const lastSyncAt = useSyncStatusStore((s) => s.lastSyncAt);
  const isSyncing = useSyncStatusStore((s) => s.isSyncing);
  const [forceSyncBusy, setForceSyncBusy] = useState(false);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);
  const appUpdateStatus = useAppUpdateStore((s) => s.status);
  const checkForUpdate = useAppUpdateStore((s) => s.checkForUpdate);

  const installedVersionName = getInstalledVersionName();
  const installedVersionCode = getInstalledVersionCode();
  const showAppUpdateSection = isAndroidAppUpdateSupported();

  const lastSuccessfulSyncLabel =
    lastSyncAt != null
      ? new Date(lastSyncAt).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '—';

  useFocusEffect(
    useCallback(() => {
      void useSyncStatusStore.getState().refresh();
      const intervalId = setInterval(() => {
        void useSyncStatusStore.getState().refresh();
      }, 5000);

      if (token === null || token === '') {
        return () => clearInterval(intervalId);
      }
      let cancelled = false;
      void (async () => {
        try {
          const next = await refreshSessionUser();
          if (!cancelled) setSession(token, next);
        } catch {
          /* offline or session invalid — keep cached user */
        }
      })();
      return () => {
        cancelled = true;
        clearInterval(intervalId);
      };
    }, [setSession, token]),
  );

  const onForceSync = useCallback(() => {
    setForceSyncBusy(true);
    void (async () => {
      try {
        await processQueue();
      } finally {
        await useSyncStatusStore.getState().refresh();
        setForceSyncBusy(false);
      }
    })();
  }, []);

  const onCheckForUpdates = useCallback(() => {
    setUpdateCheckBusy(true);
    void (async () => {
      try {
        await checkForUpdate({ force: true });
        const { status, lastError } = useAppUpdateStore.getState();
        if (status === 'up_to_date') {
          showToast('Ya tenés la última versión instalada.');
        } else if (status === 'error' && lastError != null) {
          showToast(lastError);
        }
      } finally {
        setUpdateCheckBusy(false);
      }
    })();
  }, [checkForUpdate]);

  const displayName =
    user?.name != null && user.name !== '' ? user.name : 'Sin nombre registrado';

  const onLogout = useCallback(() => {
    queryClient.clear();
    clearSession();
  }, [clearSession]);

  if (user === null) {
    return null;
  }

  const iconAccent = theme.colors.primary;

  return (
    <ScreenContainer scroll contentContainerStyle={styles.screenContent}>
      <Text style={styles.screenTitle}>Ajustes</Text>
      <Text style={styles.screenSubtitle}>Tu cuenta y preferencias</Text>

      <Card>
        <SectionHeader
          icon="person-outline"
          title="Perfil"
          iconColor={iconAccent}
          styles={styles}
        />
        <View style={styles.profileBody}>
          <Text style={styles.fieldLabel}>Nombre</Text>
          <Text style={styles.fieldValue}>{displayName}</Text>
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Rol</Text>
          <Text style={styles.fieldValueSecondary}>{rolesLabel(getUserRoles(user))}</Text>
        </View>
      </Card>

      <Card>
        <SectionHeader
          icon="log-out-outline"
          title="Acciones"
          iconColor={iconAccent}
          styles={styles}
        />
        <Button variant="danger" size="lg" onPress={onLogout}>
          Cerrar sesión
        </Button>
      </Card>

      {showAppUpdateSection && (
        <Card>
          <SectionHeader
            icon="phone-portrait-outline"
            title="Aplicación"
            iconColor={iconAccent}
            styles={styles}
          />
          <View style={styles.syncRows}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Versión instalada</Text>
              <Text style={styles.rowValue}>
                {installedVersionName} (build {installedVersionCode})
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            size="md"
            loading={updateCheckBusy || appUpdateStatus === 'checking'}
            disabled={appUpdateStatus === 'downloading' || appUpdateStatus === 'installing'}
            onPress={onCheckForUpdates}
            style={styles.forceSyncBtn}
          >
            Buscar actualizaciones
          </Button>
        </Card>
      )}

      <Card>
        <SectionHeader
          icon="sync-outline"
          title="Estado de sincronización"
          iconColor={iconAccent}
          styles={styles}
        />
        <View style={styles.syncRows}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Eventos pendientes</Text>
            <Text style={styles.rowValue}>{pendingCount}</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Sincronización en curso</Text>
            <View style={styles.syncStateRight}>
              {isSyncing ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.syncStateText} numberOfLines={2}>
                    Sincronizando…
                  </Text>
                </>
              ) : (
                <Text style={styles.rowValue}>—</Text>
              )}
            </View>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Última sincronización exitosa</Text>
            <Text style={styles.rowValue}>{lastSuccessfulSyncLabel}</Text>
          </View>
        </View>
        <Button
          variant="outline"
          size="md"
          loading={forceSyncBusy}
          disabled={isSyncing}
          onPress={onForceSync}
          style={styles.forceSyncBtn}
        >
          Sincronizar ahora
        </Button>
      </Card>
    </ScreenContainer>
  );
}

export function settingsTabBarIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="settings-outline" size={size} color={color} />;
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    screenContent: {
      gap: spacing.xl,
      paddingBottom: spacing.xxl + spacing.md,
    },
    screenTitle: {
      ...typography.title,
      color: colors.text,
    },
    screenSubtitle: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sectionIconWrap: {
      width: 40,
      height: 40,
      borderRadius: spacing.radiusMd,
      backgroundColor: `${colors.primary}22`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      ...typography.subtitle,
      color: colors.text,
      flex: 1,
    },
    profileBody: {
      gap: spacing.xs,
    },
    fieldLabel: {
      ...typography.captionStrong,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fieldLabelSpaced: {
      marginTop: spacing.md,
    },
    fieldValue: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    fieldValueSecondary: {
      ...typography.body,
      color: colors.muted,
    },
    syncRows: {
      gap: 0,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
    rowLabel: {
      ...typography.body,
      color: colors.muted,
      flexShrink: 0,
      maxWidth: '52%',
    },
    rowValue: {
      ...typography.bodyStrong,
      color: colors.text,
      textAlign: 'right',
      flex: 1,
    },
    syncStateRight: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    syncStateText: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    forceSyncBtn: {
      marginTop: spacing.md,
    },
  });
}
