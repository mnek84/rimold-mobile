import { useCallback, useEffect, useMemo, useState } from 'react';

import { messageForShipmentDetailError } from '@core/api/userFacingErrors';
import {
  fetchShipment,
  formatShipmentAddress,
  isFlexShipment,
  shipmentChannelOf,
  type ShipmentDetailJson,
} from '@core/api/shipments';
import { TOAST_DELIVERY } from '@core/feedback/toastMessages';
import { showToast } from '@core/feedback/toastStore';
import { enqueueEvent, useSyncRejectionStore } from '@core/sync';

import { DELIVERY_ACTION_EVENT_MAP } from '../deliveryDetailActions';
import {
  buildShipmentTimeline,
  isDriverActionEnabled,
  type DriverActionKey,
} from '../deliveryStatus';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function useDeliveryShipmentDetail(shipmentIdRaw: string) {
  const shipmentId = shipmentIdRaw.trim();

  const [shipment, setShipment] = useState<ShipmentDetailJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatusCode, setOptimisticStatusCode] = useState<string | null>(null);
  const [deliveredModalOpen, setDeliveredModalOpen] = useState(false);
  const [failedModalOpen, setFailedModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!UUID_V4.test(shipmentId)) {
      setError('ID de envío inválido.');
      setShipment(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShipment(shipmentId);
      setShipment(data);
      setOptimisticStatusCode(null);
    } catch (e) {
      setShipment(null);
      setError(messageForShipmentDetailError(e));
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reconciliación: si el servidor aceptó pero NO aplicó un evento de este
  // envío (Flex, o ya no es del chofer), el optimista se descarta en el acto y
  // se relee el estado real. Sin esto el chofer seguía viendo "Entregado".
  const rejectionSeq = useSyncRejectionStore((s) => s.seq);
  useEffect(() => {
    const last = useSyncRejectionStore.getState().last;
    if (rejectionSeq === 0 || last === null || last.shipmentId !== shipmentId) {
      return;
    }
    setOptimisticStatusCode(null);
    void load();
  }, [rejectionSeq, shipmentId, load]);

  const channel = useMemo(() => shipmentChannelOf(shipment), [shipment]);
  const driverActionsAllowed = channel?.driverActionsAllowed ?? true;

  const effectiveStatusCode = optimisticStatusCode ?? shipment?.status_code ?? null;

  const timelineSteps = useMemo(
    () => buildShipmentTimeline(effectiveStatusCode),
    [effectiveStatusCode],
  );

  const handleStatusAction = useCallback(
    (key: DriverActionKey) => {
      if (!UUID_V4.test(shipmentId)) {
        return;
      }
      if (!isDriverActionEnabled(key, effectiveStatusCode, driverActionsAllowed)) {
        return;
      }
      if (key === 'entregado') {
        setDeliveredModalOpen(true);
        return;
      }
      if (key === 'fallido') {
        setFailedModalOpen(true);
        return;
      }
      const cfg = DELIVERY_ACTION_EVENT_MAP[key];
      const payload = { shipmentId };

      setOptimisticStatusCode((prev) => {
        void enqueueEvent({ type: cfg.eventType, payload })
          .then(() => {
            if (key === 'en_camino') {
              showToast(TOAST_DELIVERY.enCamino);
            }
          })
          .catch(() => {
            setOptimisticStatusCode(prev);
            showToast(TOAST_DELIVERY.sendError);
          });
        return cfg.optimisticCode;
      });
    },
    [effectiveStatusCode, shipmentId, driverActionsAllowed],
  );

  const onDeliveredQueued = useCallback(() => {
    setOptimisticStatusCode('delivered');
  }, []);

  const onFailedQueued = useCallback(() => {
    setOptimisticStatusCode('failed');
  }, []);

  const trackingLabel =
    shipment != null && shipment.tracking != null && shipment.tracking.trim() !== ''
      ? shipment.tracking
      : '—';

  const addressText = formatShipmentAddress(shipment?.destination);

  const deliveryVisitCount =
    shipment?.delivery_visit_count != null && Number.isFinite(Number(shipment.delivery_visit_count))
      ? Math.max(0, Math.floor(Number(shipment.delivery_visit_count)))
      : 0;

  const headerTitle =
    shipment?.tracking != null && shipment.tracking.trim() !== ''
      ? shipment.tracking.trim()
      : 'Entrega';

  return {
    shipmentId,
    shipment,
    loading,
    error,
    /**
     * Flex no vuelve a pedir los datos del receptor: los registra la app de
     * Mercado Libre. Ver {@link isFlexShipment}.
     */
    isFlex: isFlexShipment(shipment),
    /** Clasificación de canal (backend); null mientras carga. */
    channel,
    /** false en Flex: el estado de entrega lo informa Mercado Libre. */
    driverActionsAllowed,
    /** Último estado que informó Mercado Libre (sólo Flex). */
    externalStatus: shipment?.integration_state?.external_status ?? null,
    addressTypeCode: shipment?.destination?.address_type_code ?? null,
    effectiveStatusCode,
    timelineSteps,
    trackingLabel,
    addressText,
    deliveryVisitCount,
    headerTitle,
    handleStatusAction,
    deliveredModal: {
      visible: deliveredModalOpen,
      close: () => setDeliveredModalOpen(false),
      onQueued: onDeliveredQueued,
    },
    failedModal: {
      visible: failedModalOpen,
      close: () => setFailedModalOpen(false),
      onQueued: onFailedQueued,
    },
  };
}
