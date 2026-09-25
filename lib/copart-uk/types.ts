/** Raw lot shape from Copart bot / scraper JSON */
export type CopartUkRawLot = {
  lot_id: string;
  title?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  bid?: number | null;
  buy_now?: number | null;
  location?: string | null;
  category?: string | null;
  odometer?: number | null;
  sale_date?: string | null;
  vin?: string | null;
  body_style?: string | null;
  vehicle_type_raw?: string | null;
  vat_on_sale?: boolean;
  url?: string | null;
  color?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drive?: string | null;
  fuel?: string | null;
  primary_damage?: string | null;
  secondary_damage?: string | null;
  keys?: string | null;
  highlights?: string | null;
  estimated_value?: number | null;
  repair_cost?: number | null;
  images?: string[];
};

export type CopartUkSyncResult = {
  fetched: number;
  upserted: number;
  errors: string[];
};
