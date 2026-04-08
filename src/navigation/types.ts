import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';

export type MainTabParamList = {
  Colecta: undefined;
  Entregas: undefined;
  Bodega: undefined;
  Ajustes: undefined;
};

export type MainTabNav<T extends keyof MainTabParamList> = BottomTabNavigationProp<
  MainTabParamList,
  T
>;

export type MainTabRoute<T extends keyof MainTabParamList> = RouteProp<MainTabParamList, T>;
