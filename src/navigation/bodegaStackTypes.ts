import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type CageListParams = {
  mode?: 'transfer';
  transferTracking?: string;
  /**
   * Mover una etiqueta necesita el ENVIO, no solo su codigo: la asignacion se
   * hace por id. Opcional para no romper un deep link viejo.
   */
  transferShipmentId?: string;
  excludeCageId?: string;
  transferFromLabel?: string;
};

export type BodegaStackParamList = {
  BodegaHome: undefined;
  WarehouseEntry: undefined;
  CageSessionGate: undefined;
  CageList: CageListParams | undefined;
  CageWorkspace: { cageId: string; cageName: string };
  AssignShipment: { prefilledTracking?: string } | undefined;
  CloseCageSession: undefined;
  CrossdockManual: undefined;
  CageDepartureGate: { cageId: string; cageName: string; cageSessionId?: string };
};

export type BodegaStackNav<T extends keyof BodegaStackParamList> = NativeStackNavigationProp<
  BodegaStackParamList,
  T
>;

export type BodegaStackRoute<T extends keyof BodegaStackParamList> = RouteProp<BodegaStackParamList, T>;
