import { useCallback, useEffect, useMemo, useState } from 'react';

import { messageForShipmentDetailError } from '@core/api/userFacingErrors';
import {
  fetchShipment,
  formatShipmentAddress,
  type ShipmentDetailJson,
} from '@core/api/shipments';
import { TOAST_DELIVERY } from '@core/feedback/toastMessages';
import { showToast } from '@core/feedback/toastStore';
import { enqueueEvent } from '@core/sync';

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
      if (!isDriverActionEnabled(key, effectiveStatusCode)) {
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
    [effectiveStatusCode, shipmentId],
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
