/**
 * Visual QA harness for the design system. DEV ONLY — reachable from
 * Ajustes when `__DEV__` is true; never shipped in a release build's UI.
 *
 * Renders the real workflow components with synthetic fixtures (no API, no
 * customer data), so both themes can be checked on any device without a
 * backend: Ajustes → "Vista de diseño", then flip Apariencia.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Banner,
  Button,
  Card,
  IconButton,
  Input,
  SegmentedControl,
  StatusBadge,
  type SegmentedOption,
} from '@components/ui';
import type { ShipmentChannel } from '@core/api/channel';
import type { RouteStopView } from '@core/api/routes';
import type { TodayShipmentRow } from '@core/api/shipments';
import { DeliveryListView } from '@modules/delivery/components/DeliveryListView';
import { DeliveryShipmentActions } from '@modules/delivery/components/DeliveryShipmentActions';
import { DeliveryShipmentDetailHeader } from '@modules/delivery/components/DeliveryShipmentDetailHeader';
import { DeliveryShipmentTimeline } from '@modules/delivery/components/DeliveryShipmentTimeline';
import type { TimelineStepUi } from '@modules/delivery/deliveryStatus';
import { RouteActionsSheet } from '@modules/delivery/map/RouteActionsSheet';
import { RouteProgressHeader } from '@modules/delivery/map/RouteProgressHeader';
import { StopListSheet } from '@modules/delivery/map/StopListSheet';
import { StopPreviewCard } from '@modules/delivery/map/StopPreviewCard';
import { IncidentReportSheet } from '@modules/pickups/components/IncidentReportSheet';
import { toneColors, useTheme, type AppTheme, type Palette, type Tone } from '@theme';

export type PreviewScene =
  | 'tokens'
  | 'components'
  | 'route'
  | 'stops'
  | 'routeActions'
  | 'list'
  | 'detail'
  | 'incident';

export const PREVIEW_SCENES: readonly PreviewScene[] = [
  'tokens',
  'components',
  'route',
  'stops',
  'routeActions',
  'list',
  'detail',
  'incident',
];

const SCENE_LABEL: Record<PreviewScene, string> = {
  tokens: 'Tokens',
  components: 'Componentes',
  route: 'Ruta',
  stops: 'Paradas',
  routeActions: 'Acciones',
  list: 'Envíos',
  detail: 'Detalle',
  incident: 'Incidencia',
};

const noop = () => undefined;

// ---------------------------------------------------------------------------
// Synthetic fixtures. Fictional addresses and IDs only.
// ---------------------------------------------------------------------------

const OWN: ShipmentChannel = {
  operator: 'internal',
  operatorLabel: 'Propio',
  origin: 'manual',
  addressType: 'residential',
  addressTypeLabel: 'Residencial',
  statusAuthority: 'internal',
  driverActionsAllowed: true,
  label: 'Propio',
};

const FLEX: ShipmentChannel = {
  operator: 'mercadolibre_flex',
  operatorLabel: 'Flex',
  origin: 'mercadolibre',
  addressType: 'commercial',
  addressTypeLabel: 'Comercial',
  statusAuthority: 'external_provider',
  driverActionsAllowed: false,
  label: 'Flex · Comercial',
};

function stop(partial: Partial<RouteStopView> & Pick<RouteStopView, 'id' | 'sequence'>): RouteStopView {
  return {
    status: 'pending',
    shipmentId: `shp-${partial.id}`,
    tracking: `DEMO-00${partial.sequence}`,
    shipmentStatus: 'out_for_delivery',
    latitude: -34.6,
    longitude: -58.4,
    label: 'Calle Ejemplo 100',
    addressLine2: null,
    reference: null,
    addressTypeCode: 'residential',
    city: 'Ciudad Demo',
    state: 'Provincia Demo',
    postalCode: '1000',
    shipmentCount: 1,
    openCount: 1,
    hasFlex: false,
    channel: OWN,
    ...partial,
  };
}

const STOPS: RouteStopView[] = [
  stop({ id: '1', sequence: 1, status: 'completed', shipmentStatus: 'delivered', label: 'Av. Demostración 1200', openCount: 0 }),
  stop({ id: '2', sequence: 2, status: 'failed', shipmentStatus: 'failed', label: 'Pasaje Ficticio 45', openCount: 0 }),
  stop({
    id: '3',
    sequence: 3,
    label: 'Calle Muestra 3480',
    addressLine2: 'Piso 2 · Depto B',
    reference: 'Portón verde, timbre 2B',
    shipmentCount: 2,
    openCount: 2,
  }),
  stop({ id: '4', sequence: 4, label: 'Bv. Prueba 77', addressTypeCode: 'commercial', hasFlex: true, channel: FLEX }),
  stop({ id: '5', sequence: 5, label: 'Diagonal Ejemplo 910', addressTypeCode: 'store' }),
];

function row(partial: Partial<TodayShipmentRow> & Pick<TodayShipmentRow, 'id'>): TodayShipmentRow {
  return {
    tracking_id: `DEMO-10${partial.id}`,
    address: 'Calle Ejemplo 100, Ciudad Demo',
    status: 'out_for_delivery',
    execution_type: 'internal',
    route_id: 'route-demo',
    flex_batch_id: null,
    delivery_visit_count: 1,
    delivered_at: null,
    channel: OWN,
    latitude: -34.6,
    longitude: -58.4,
    coords_assessment: 'valid',
    ...partial,
  };
}

const ROWS: TodayShipmentRow[] = [
  row({ id: '1', address: 'Calle Muestra 3480, Ciudad Demo' }),
  row({ id: '2', address: 'Bv. Prueba 77, Ciudad Demo', channel: FLEX, execution_type: 'flex' }),
  row({ id: '3', address: 'Diagonal Ejemplo 910, Ciudad Demo', status: 'assigned', delivery_visit_count: 0 }),
  row({ id: '4', address: 'Pasaje Ficticio 45, Ciudad Demo', status: 'failed', delivery_visit_count: 2 }),
  row({
    id: '5',
    address: 'Av. Demostración 1200, Ciudad Demo',
    status: 'delivered',
    delivered_at: new Date().toISOString(),
  }),
];

const TIMELINE: TimelineStepUi[] = [
  { key: 'assigned', title: 'Asignado', state: 'done' },
  { key: 'out', title: 'En camino', state: 'done' },
  { key: 'near', title: 'Cerca del destino', state: 'current' },
  { key: 'delivered', title: 'Entregado', state: 'upcoming' },
];

// ---------------------------------------------------------------------------

export function DesignPreview({
  initialScene = 'tokens',
  showSceneTabs = true,
}: {
  initialScene?: PreviewScene;
  showSceneTabs?: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [scene, setScene] = useState<PreviewScene>(initialScene);

  const sceneOptions = useMemo<SegmentedOption<PreviewScene>[]>(
    () => PREVIEW_SCENES.map((s) => ({ value: s, label: SCENE_LABEL[s] })),
    [],
  );

  return (
    <View style={styles.root}>
      {showSceneTabs ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabs, { paddingTop: insets.top }]}
          contentContainerStyle={styles.tabsContent}
        >
          {/* Split in pages of 4 so each segment stays tappable. */}
          <SegmentedControl options={sceneOptions.slice(0, 4)} value={scene} onChange={setScene} />
          <SegmentedControl options={sceneOptions.slice(4)} value={scene} onChange={setScene} />
        </ScrollView>
      ) : null}
      <View style={styles.scene}>{renderScene(scene, theme, styles, showSceneTabs ? 0 : insets.top)}</View>
    </View>
  );
}

function renderScene(
  scene: PreviewScene,
  theme: AppTheme,
  styles: ReturnType<typeof createStyles>,
  insetTop: number,
) {
  switch (scene) {
    case 'tokens':
      return <TokensScene theme={theme} styles={styles} />;
    case 'components':
      return <ComponentsScene styles={styles} />;
    case 'route':
      return <RouteScene styles={styles} insetTop={insetTop} />;
    case 'stops':
      return (
        <View style={styles.flex}>
          <RouteScene styles={styles} insetTop={insetTop} hideCard />
          <StopListSheet
            visible
            stops={STOPS}
            selectedStopId="3"
            onClose={noop}
            onPressStop={noop}
            onPressNavigate={noop}
            insetTop={insetTop}
            insetBottom={0}
          />
        </View>
      );
    case 'routeActions':
      return (
        <View style={styles.flex}>
          <RouteScene styles={styles} insetTop={insetTop} hideCard />
          <RouteActionsSheet
            visible
            onClose={noop}
            started
            finished={false}
            startedAtLabel="08:12"
            busy={null}
            etaLabel="Fin estimado 14:30"
            error={null}
            onStart={noop}
            onReoptimize={noop}
            onFinish={noop}
            insetBottom={0}
          />
        </View>
      );
    case 'list':
      return (
        <View style={[styles.flex, styles.screenPad, { paddingTop: insetTop + theme.spacing.md }]}>
          <DeliveryListView
            sections={[
              { title: 'En ruta', data: ROWS.slice(0, 2) },
              { title: 'Pendientes', data: ROWS.slice(2, 3) },
              { title: 'Fallidos', data: ROWS.slice(3, 4) },
              { title: 'Entregados', data: ROWS.slice(4) },
            ]}
            loading={false}
            showInitialLoader={false}
            refreshing={false}
            error={null}
            nextShipmentId="1"
            flexBatchId={null}
            pendingCount={3}
            failedCount={1}
            deliveredTodayCount={1}
            onRefresh={noop}
            onPressScan={noop}
            onPressReportFailure={noop}
            onPressShipment={noop}
            channelFilter="all"
            onChangeChannelFilter={noop}
            channelCounts={{ all: 5, own: 4, flex: 1 }}
          />
        </View>
      );
    case 'detail':
      return (
        <ScrollView contentContainerStyle={[styles.pad, { paddingTop: insetTop + theme.spacing.lg }]}>
          <DeliveryShipmentDetailHeader
            trackingLabel="DEMO-101"
            addressText="Calle Muestra 3480, Piso 2 · Depto B, Ciudad Demo"
            statusCode="near_destination"
            deliveryVisitCount={1}
            addressTypeCode="residential"
          />
          <DeliveryShipmentTimeline steps={TIMELINE} />
          <DeliveryShipmentActions effectiveStatusCode="near_destination" onAction={noop} driverActionsAllowed />
        </ScrollView>
      );
    case 'incident':
      return (
        <View style={styles.flex}>
          <RouteScene styles={styles} insetTop={insetTop} hideCard />
          <IncidentReportSheet visible onSubmit={noop} onClose={noop} />
        </View>
      );
    default:
      return null;
  }
}

function RouteScene({
  styles,
  insetTop,
  hideCard = false,
}: {
  styles: ReturnType<typeof createStyles>;
  insetTop: number;
  hideCard?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.flex}>
      <RouteProgressHeader
        visited={2}
        total={5}
        insetTop={insetTop}
        openMapsLabel="Abrir recorrido en Google Maps"
        onPressOpenMaps={noop}
        onPressRefresh={noop}
        refreshing={false}
      />
      {/* The real screen shows react-native-maps here (native only). */}
      <View style={styles.mapPlaceholder}>
        <Ionicons name="map-outline" size={40} color={theme.colors.muted} />
        <Text style={styles.mapPlaceholderText}>Mapa (nativo)</Text>
      </View>
      {hideCard ? null : (
        <StopPreviewCard
          stop={STOPS[2]}
          canNavigate
          onPressNavigate={noop}
          onPressDetail={noop}
          onClose={noop}
          insetBottom={0}
        />
      )}
    </View>
  );
}

const SWATCHES: (keyof Palette)[] = [
  'background',
  'surface',
  'surfaceMuted',
  'text',
  'muted',
  'border',
  'borderStrong',
  'primary',
  'primarySoft',
  'chrome',
  'brand',
  'success',
  'successSoft',
  'danger',
  'dangerSoft',
  'warning',
  'warningSoft',
  'info',
  'infoSoft',
];

function TokensScene({ theme, styles }: { theme: AppTheme; styles: ReturnType<typeof createStyles> }) {
  const { colors, typography, spacing } = theme;
  const [gridWidth, setGridWidth] = useState(0);
  const swatchWidth = Math.floor((gridWidth - spacing.sm * 2) / 3);
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Tokens · {theme.scheme === 'dark' ? 'Oscuro' : 'Claro'}</Text>
      <View style={styles.swatchGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {SWATCHES.map((key) => (
          <View key={key} style={[styles.swatch, { width: swatchWidth }]}>
            <View style={[styles.swatchChip, { backgroundColor: colors[key] }]} />
            <Text style={styles.swatchName}>{key}</Text>
            <Text style={styles.swatchHex}>{colors[key]}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.h2}>Tipografía</Text>
      {(Object.keys(typography) as (keyof typeof typography)[]).map((k) => (
        <Text key={k} style={[typography[k], { color: colors.text }]}>
          {k} · {typography[k].fontSize}/{typography[k].lineHeight}
        </Text>
      ))}
    </ScrollView>
  );
}

const TONES: { tone: Tone; label: string; icon: 'time-outline' | 'navigate-outline' | 'checkmark-circle' | 'close-circle' | 'warning-outline' | 'information-circle-outline' }[] = [
  { tone: 'neutral', label: 'Pendiente', icon: 'time-outline' },
  { tone: 'primary', label: 'En camino', icon: 'navigate-outline' },
  { tone: 'success', label: 'Entregado', icon: 'checkmark-circle' },
  { tone: 'danger', label: 'No entregado', icon: 'close-circle' },
  { tone: 'warning', label: 'Revisar', icon: 'warning-outline' },
  { tone: 'info', label: 'Sincronizando', icon: 'information-circle-outline' },
];

function ComponentsScene({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const theme = useTheme();
  const [seg, setSeg] = useState<'all' | 'own' | 'flex'>('all');
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.h2}>Botones</Text>
      <Button size="lg" icon="navigate">
        Ir a la próxima parada
      </Button>
      <View style={styles.row}>
        <Button variant="success" icon="checkmark" style={styles.flex}>
          Entregado
        </Button>
        <Button variant="danger" icon="close" style={styles.flex}>
          No entregado
        </Button>
      </View>
      <View style={styles.row}>
        <Button variant="secondary" style={styles.flex}>
          Secundario
        </Button>
        <Button variant="outline" style={styles.flex}>
          Contorno
        </Button>
        <Button variant="ghost" style={styles.flex}>
          Cancelar
        </Button>
      </View>
      <View style={styles.row}>
        <Button disabled style={styles.flex}>
          Deshabilitado
        </Button>
        <Button loading style={styles.flex}>
          Cargando
        </Button>
      </View>
      <View style={styles.row}>
        <IconButton icon="locate" variant="surface" accessibilityLabel="Centrar" />
        <IconButton icon="list" variant="primary" size={56} accessibilityLabel="Lista" />
        <IconButton icon="call-outline" accessibilityLabel="Llamar" />
      </View>

      <Text style={styles.h2}>Estados</Text>
      <View style={styles.wrap}>
        {TONES.map((t) => (
          <StatusBadge key={t.tone} tone={t.tone} label={t.label} icon={t.icon} />
        ))}
      </View>
      <View style={styles.wrap}>
        {TONES.map((t) => (
          <StatusBadge key={t.tone} tone={t.tone} label={t.label} icon={t.icon} emphasis="solid" />
        ))}
      </View>

      <Text style={styles.h2}>Avisos</Text>
      <Banner tone="info" title="Sin conexión" message="Los cambios se guardan y se envían al volver la señal." />
      <Banner tone="warning" title="Misma jaula" message="El paquete ya estaba asignado a esta jaula." />
      <Banner tone="danger" title="No se pudo sincronizar" message="3 eventos pendientes." />
      <Banner tone="success" title="Paquete escaneado" message="2 de 3 bultos." />

      <Text style={styles.h2}>Formulario</Text>
      <SegmentedControl
        options={[
          { value: 'all', label: 'Todos' },
          { value: 'own', label: 'Propios' },
          { value: 'flex', label: 'Flex' },
        ]}
        value={seg}
        onChange={setSeg}
      />
      <Input label="Nombre de quien recibe" placeholder="Nombre y apellido" />
      <Input label="DNI" placeholder="Documento" error="Ingresá un DNI válido" />

      <Text style={styles.h2}>Tarjeta</Text>
      <Card>
        <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>Calle Muestra 3480</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>2 envíos · Residencial</Text>
        <View style={[styles.progressTrack, { marginTop: theme.spacing.md }]}>
          <View style={[styles.progressFill, { backgroundColor: toneColors(theme, 'brand').solid }]} />
        </View>
        <Text style={[theme.typography.micro, { color: theme.colors.muted, marginTop: theme.spacing.xs }]}>
          2 de 5 paradas
        </Text>
      </Card>
    </ScrollView>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    tabs: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    tabsContent: { gap: spacing.sm, padding: spacing.sm },
    scene: { flex: 1 },
    pad: { padding: spacing.lg, gap: spacing.md },
    // Mirrors ScreenContainer's content padding, which the real list screen sits in.
    screenPad: { paddingHorizontal: spacing.lg },
    row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    h1: { ...typography.title, color: colors.text },
    h2: { ...typography.subtitle, color: colors.text, marginTop: spacing.md },
    swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch: { gap: spacing.xxs },
    swatchChip: { height: 44, borderRadius: spacing.radiusMd, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
    swatchName: { ...typography.micro, color: colors.text },
    swatchHex: { ...typography.micro, fontWeight: '400', color: colors.muted },
    mapPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceMuted,
    },
    mapPlaceholderText: { ...typography.caption, color: colors.muted },
    progressTrack: { height: 8, borderRadius: spacing.radiusPill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
    progressFill: { width: '40%', height: '100%', borderRadius: spacing.radiusPill },
  });
}
