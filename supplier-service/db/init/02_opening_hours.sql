CREATE TABLE public.supplier_opening_hours (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id  bigint NOT NULL
               REFERENCES public."Supplier_Database"(id) ON DELETE RESTRICT,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at     time WITHOUT TIME ZONE,
  closes_at    time WITHOUT TIME ZONE,
  is_closed    boolean NOT NULL DEFAULT false,
  created_at   timestamptz(3) NOT NULL DEFAULT now(),
  updated_at   timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, day_of_week),
  CHECK (
    (is_closed AND opens_at IS NULL AND closes_at IS NULL)
    OR (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL)
  )
);

CREATE INDEX supplier_opening_hours_supplier_id_idx
  ON public.supplier_opening_hours (supplier_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = date_trunc('milliseconds', now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_opening_hours_set_updated_at
  BEFORE UPDATE ON public.supplier_opening_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
