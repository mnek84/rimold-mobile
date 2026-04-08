import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type CageListParams = {
  mode?: 'transfer';
  transferTracking?: string;
  excludeCageId?: string;
  transferFromLabel?: string;
};

export type BodegaStackParamList = {
  CageList: CageListParams | undefined;
  CageWorkspace: { cageId: string; cageName: string };
};

export type BodegaStackNav<T extends keyof BodegaStackParamList> = NativeStackNavigationProp<
  BodegaStackParamList,
  T
>;

export type BodegaStackRoute<T extends keyof BodegaStackParamList> = RouteProp<BodegaStackParamList, T>;
