-- Optional acquisition records allocate existing stock; they never add bottles.
CREATE UNIQUE INDEX wines_id_user_id_key ON public.wines(id, user_id);

CREATE TABLE public.collector_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wine_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('drink', 'collect', 'invest')),
  purchased_at date NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
  remaining integer NOT NULL CHECK (remaining >= 0 AND remaining <= quantity),
  bottle_ml integer NOT NULL CHECK (bottle_ml BETWEEN 50 AND 30000),
  unit_cost numeric(12,2) NOT NULL CHECK (unit_cost BETWEEN 0 AND 9999999999.99),
  additional_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (additional_cost BETWEEN 0 AND 9999999999.99),
  currency text NOT NULL CHECK (currency IN ('SEK','EUR','USD','GBP','CHF','DKK','NOK')),
  condition text NOT NULL DEFAULT '' CHECK (length(condition) <= 1000),
  provenance text NOT NULL DEFAULT '' CHECK (length(provenance) <= 1000),
  storage text NOT NULL DEFAULT '' CHECK (length(storage) <= 1000),
  estimate_price numeric(12,2) CHECK (estimate_price BETWEEN 0 AND 9999999999.99),
  estimate_currency text CHECK (estimate_currency IN ('SEK','EUR','USD','GBP','CHF','DKK','NOK')),
  estimate_date date,
  estimate_source text CHECK (length(btrim(estimate_source)) BETWEEN 1 AND 1000),
  estimate_confidence text CHECK (estimate_confidence IN ('low','medium','high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (wine_id, user_id) REFERENCES public.wines(id, user_id) ON DELETE CASCADE,
  CHECK (
    (estimate_price IS NULL AND estimate_currency IS NULL AND estimate_date IS NULL
      AND estimate_source IS NULL AND estimate_confidence IS NULL)
    OR (estimate_price IS NOT NULL AND estimate_currency IS NOT NULL AND estimate_date IS NOT NULL
      AND estimate_source IS NOT NULL AND estimate_confidence IS NOT NULL)
  )
);
CREATE INDEX collector_lots_user_wine_idx ON public.collector_lots(user_id, wine_id);
ALTER TABLE public.collector_lots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collector_lots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collector_lots TO authenticated;
GRANT ALL ON public.collector_lots TO service_role;
CREATE POLICY "Owners manage collector lots" ON public.collector_lots
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE FUNCTION public.validate_collector_allocation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE available integer; allocated bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.wine_id <> OLD.wine_id OR NEW.user_id <> OLD.user_id OR NEW.id <> OLD.id) THEN
    RAISE EXCEPTION 'Collector lot identity cannot change';
  END IF;
  -- Serialise writers on the wine, including simultaneous allocation requests.
  SELECT CASE WHEN consumed_at IS NULL THEN coalesce(quantity, 1) ELSE 0 END
    INTO available FROM public.wines WHERE id = NEW.wine_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wine not available'; END IF;
  SELECT coalesce(sum(remaining), 0) INTO allocated FROM public.collector_lots
    WHERE wine_id = NEW.wine_id AND id <> NEW.id;
  IF allocated + NEW.remaining > available THEN
    RAISE EXCEPTION 'Collector allocation exceeds cellar stock';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER collector_allocation BEFORE INSERT OR UPDATE ON public.collector_lots
  FOR EACH ROW EXECUTE FUNCTION public.validate_collector_allocation();

CREATE FUNCTION public.guard_collector_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE allocated bigint;
BEGIN
  SELECT coalesce(sum(remaining), 0) INTO allocated FROM public.collector_lots WHERE wine_id = NEW.id;
  IF allocated > (CASE WHEN NEW.consumed_at IS NULL THEN coalesce(NEW.quantity, 1) ELSE 0 END) THEN
    RAISE EXCEPTION 'Reduce collector allocations before reducing cellar stock';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_collector_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_collector_allocation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER collector_stock_guard BEFORE UPDATE OF quantity, consumed_at ON public.wines
  FOR EACH ROW EXECUTE FUNCTION public.guard_collector_stock();
