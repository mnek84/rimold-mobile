import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type ReturnStackParamList = {
  ReturnOrdersList: undefined;
  ReturnOrderPending: { orderId: string };
  ReturnOrderInProgress: { orderId: string };
};

export type ReturnStackNav<T extends keyof ReturnStackParamList> = NativeStackNavigationProp<
  ReturnStackParamList,
  T
>;

export type ReturnStackRoute<T extends keyof ReturnStackParamList> = RouteProp<
  ReturnStackParamList,
  T
>;
