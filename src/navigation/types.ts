import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams, RouteProp } from '@react-navigation/native';

import type { DeliveryStackParamList } from './deliveryStackTypes';

export type MainTabParamList = {
  Colecta: undefined;
  /**
   * Acepta params anidados para que el mapa de paradas pueda abrir el detalle
   * de un envío, que vive en el stack de Entregas y no en el tab del mapa.
   */
  Entregas: NavigatorScreenParams<DeliveryStackParamList> | undefined;
  Devoluciones: undefined;
  RutaMapa: undefined;
  Bodega: undefined;
  Ajustes: undefined;
};

export type MainTabNav<T extends keyof MainTabParamList> = BottomTabNavigationProp<
  MainTabParamList,
  T
>;

export type MainTabRoute<T extends keyof MainTabParamList> = RouteProp<MainTabParamList, T>;
