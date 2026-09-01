ALTER TABLE public.import_batches
ADD COLUMN source text NOT NULL DEFAULT 'excel';

ALTER TABLE public.import_batches
ADD CONSTRAINT import_batches_source_check CHECK (source IN ('excel', 'screenshot'));

CREATE INDEX IF NOT EXISTS orders_import_batch_geo_status_idx
ON public.orders (import_batch_id, geo_status);

CREATE OR REPLACE FUNCTION public.cancel_import_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.orders
  WHERE import_batch_id = _batch_id::text;

  DELETE FROM public.import_batches
  WHERE id = _batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_import_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_import_batch(uuid) TO service_role;