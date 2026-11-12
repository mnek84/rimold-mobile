import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { Button, Input, ScreenContainer } from '@components/ui';
import { authorizeCageDeparture } from '@core/api/cageDeparture';
import { isWarehouseSupervisor } from '@core/auth/types';
import { useCageDepartureAuthorization } from '@modules/bodega/hooks/useCageDepartureAuthorization';
import type { BodegaStackNav, BodegaStackRoute } from '@navigation/bodegaStackTypes';
import { useAuthStore } from '@store/useAuthStore';
import { useTheme, type AppTheme } from '@theme';

/**
 * Gate del chofer antes de iniciar recorrido.
 *
 * Dos condiciones, no una: el supervisor tiene que autorizar la salida Y la
 * jaula tiene que estar completa. Si quedan bultos asignados que nadie escaneó,
 * la pantalla muestra CUÁLES — "te falta 1 de 30" sin decir cuál no manda a
 * nadie a buscar nada, y el chofer termina yendo a preguntar al supervisor en
 * vez de ir a buscar el paquete.
 *
 * El override vive acá mismo: un supervisor que esté al lado autoriza desde esta
 * pantalla, deja el motivo, y la del chofer se desbloquea sola por el evento de
 * Reverb que el hook ya escucha.
 */
export function CageDepartureGateScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<BodegaStackNav<'CageDepartureGate'>>();
  const route = useRoute<BodegaStackRoute<'CageDepartureGate'>>();
  const { cageId, cageName, cageSessionId } = route.params;
  const qc = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const canOverride = isWarehouseSupervisor(user);

  const { data, isLoading, live } = useCageDepartureAuthorization(cageId, cageSessionId);
  const authorized = data?.authorized === true;
  const blocked = data?.blocked === true;
  const missing = data?.missing ?? 0;
  const missingList = data?.missing_shipments ?? [];

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const authorizeMutation = useMutation({
    mutationFn: () =>
      authorizeCageDeparture({
        cageId,
        cageSessionId: cageSessionId ?? null,
        reasonCode: 'count_mismatch',
        note: reason.trim(),
      }),
    onSuccess: async () => {
      setOverrideOpen(false);
      setReason('');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['cage-departure', cageId] });
    },
    onError: () => setError('No se pudo autorizar. Probá de nuevo.'),
  });

  const canStart = authorized && !blocked;

  return (
    <ScreenContainer>
      <Text style={styles.title}>Salida de {cageName}</Text>
      <Text style={styles.subtitle}>
        Esperando autorización del supervisor para iniciar el recorrido.
      </Text>

      {!isLoading && (data?.assigned ?? 0) > 0 ? (
        <View style={styles.countBox}>
          <Text style={styles.countValue}>
            {data?.scanned ?? 0} / {data?.assigned ?? 0}
          </Text>
          <Text style={styles.countLabel}>
            escaneados{missing > 0 ? ` · falta ${missing}` : ''}
          </Text>
        </View>
      ) : null}

      {missingList.length > 0 ? (
        <View style={styles.missingBox}>
          <View style={styles.missingTitleRow}>
            <Ionicons name="alert-circle" size={20} color={theme.colors.danger} />
            <Text style={styles.missingTitle}>Falta escanear</Text>
          </View>
          {missingList.map((m) => (
            <Text key={m.id} style={styles.missingItem}>
              {m.tracking}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.statusBox}>
        {isLoading ? (
          <>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.statusText}>Consultando estado…</Text>
          </>
        ) : canStart ? (
          <>
            <Ionicons name="checkmark-circle" size={44} color={theme.colors.success} />
            <Text style={[styles.statusText, styles.statusOk]}>
              Autorizado — podés iniciar viaje.
            </Text>
            {data?.authorized_at ? (
              <Text style={styles.statusMeta}>
                Autorizado a las {new Date(data.authorized_at).toLocaleTimeString()}
              </Text>
            ) : null}
            {/* Quién autorizó y por qué queda a la vista: es la mitad del valor
                de haber pedido un motivo. */}
            {data?.override?.authorized_by != null ? (
              <Text style={styles.statusMeta}>
                Salida incompleta autorizada por {data.override.authorized_by}
                {data.override.note != null && data.override.note !== ''
                  ? ` · ${data.override.note}`
                  : ''}
              </Text>
            ) : null}
          </>
        ) : blocked ? (
          <>
            <Ionicons name="lock-closed" size={44} color={theme.colors.danger} />
            <Text style={[styles.statusText, styles.statusBad]}>
              No podés salir: faltan {missing} bulto{missing === 1 ? '' : 's'} por escanear.
            </Text>
            <Text style={styles.statusMeta}>
              {canOverride
                ? 'Si no aparecen, podés autorizar la salida dejando el motivo.'
                : 'Pedile al supervisor que autorice la salida.'}
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.statusText}>Esperando OK del supervisor.</Text>
            <Text style={styles.statusMeta}>
              {live ? 'Conectado en vivo — llegará al toque.' : 'Reintentando cada 30s…'}
            </Text>
          </>
        )}
      </View>

      <Button size="lg" icon="play" disabled={!canStart} onPress={() => navigation.goBack()}>
        Iniciar recorrido
      </Button>

      {blocked && canOverride ? (
        <Button
          variant="outline"
          icon="shield-checkmark-outline"
          fullWidth
          style={styles.secondaryCta}
          onPress={() => setOverrideOpen(true)}
        >
          Autorizar salida igual
        </Button>
      ) : null}

      <Modal visible={overrideOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Autorizar salida incompleta</Text>
            <Text style={styles.modalBody}>
              Faltan {missing} bulto{missing === 1 ? '' : 's'}. Dejá el motivo: sin eso, el
              faltante queda sin dueño y la próxima vez nadie sabe qué pasó.
            </Text>

            <Input
              style={styles.input}
              placeholder="Motivo"
              accessibilityLabel="Motivo"
              value={reason}
              onChangeText={setReason}
              multiline
            />

            {error !== null ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <Button
                variant="secondary"
                style={styles.modalAction}
                onPress={() => {
                  setOverrideOpen(false);
                  setError(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                style={styles.modalAction}
                disabled={reason.trim() === '' || authorizeMutation.isPending}
                loading={authorizeMutation.isPending}
                onPress={() => authorizeMutation.mutate()}
              >
                Autorizar
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
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
    countBox: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusCard,
      backgroundColor: colors.surface,
      marginBottom: spacing.sm,
    },
    countValue: {
      ...typography.display,
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    countLabel: {
      ...typography.caption,
      color: colors.muted,
    },
    missingBox: {
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
      borderRadius: spacing.radiusCard,
      marginBottom: spacing.lg,
      gap: spacing.xxs,
    },
    missingTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    missingTitle: {
      ...typography.bodyStrong,
      color: colors.danger,
    },
    missingItem: {
      ...typography.caption,
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    statusBox: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusCard,
      backgroundColor: colors.surface,
      marginBottom: spacing.lg,
    },
    statusText: {
      ...typography.bodyStrong,
      color: colors.text,
      textAlign: 'center',
    },
    statusOk: {
      color: colors.success,
    },
    statusBad: {
      color: colors.danger,
    },
    statusMeta: {
      ...typography.caption,
      color: colors.muted,
      textAlign: 'center',
    },
    secondaryCta: {
      marginTop: spacing.sm,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    modalTitle: {
      ...typography.subtitle,
      color: colors.text,
    },
    modalBody: {
      ...typography.caption,
      color: colors.muted,
    },
    input: {
      minHeight: 72,
      textAlignVertical: 'top',
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    modalAction: {
      flex: 1,
    },
  });
}
