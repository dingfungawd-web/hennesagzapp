ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'install',
  ADD COLUMN IF NOT EXISTS deposit_date date;

CREATE INDEX IF NOT EXISTS orders_order_type_idx ON public.orders (order_type);
CREATE INDEX IF NOT EXISTS orders_deposit_date_idx ON public.orders (deposit_date);