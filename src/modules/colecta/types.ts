export type ColectaWarehouse = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ColectaClient = {
  id: string;
  name: string;
  warehouses: ColectaWarehouse[];
};
