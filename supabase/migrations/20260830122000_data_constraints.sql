BEGIN;

-- Invalid legacy numeric values abort this transaction. Never silently clamp
-- or discard user data: remediate the reported constraint before deploying.
ALTER TABLE public.wines
  DROP CONSTRAINT IF EXISTS wines_profile_ranges_check,
  DROP CONSTRAINT IF EXISTS wines_rating_check,
  DROP CONSTRAINT IF EXISTS wines_vintage_check,
  DROP CONSTRAINT IF EXISTS wines_quantity_check,
  DROP CONSTRAINT IF EXISTS wines_purchase_price_check,
  ADD CONSTRAINT wines_profile_ranges_check CHECK (
    fruit BETWEEN 0 AND 10 AND tannin BETWEEN 0 AND 10 AND acidity BETWEEN 0 AND 10
    AND oak BETWEEN 0 AND 10 AND sweetness BETWEEN 0 AND 10 AND body BETWEEN 0 AND 10
  ),
  ADD CONSTRAINT wines_rating_check CHECK (user_rating BETWEEN 0 AND 5),
  ADD CONSTRAINT wines_vintage_check CHECK (vintage BETWEEN 1700 AND 2200),
  ADD CONSTRAINT wines_quantity_check CHECK (quantity >= 0),
  ADD CONSTRAINT wines_purchase_price_check CHECK (purchase_price >= 0);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_taste_ranges_check,
  DROP CONSTRAINT IF EXISTS profiles_price_range_check,
  ADD CONSTRAINT profiles_taste_ranges_check CHECK (
    body BETWEEN 0 AND 10 AND sweetness BETWEEN 0 AND 10 AND oak BETWEEN 0 AND 10
    AND tannin BETWEEN 0 AND 10 AND acidity BETWEEN 0 AND 10
  ),
  ADD CONSTRAINT profiles_price_range_check CHECK (
    price_min >= 0 AND price_max >= 0 AND (price_min IS NULL OR price_max IS NULL OR price_max >= price_min)
  );

-- Existing names and profile links remain unchanged. The pre-existing
-- case-insensitive unique index applies to both legacy and new names.
CREATE OR REPLACE FUNCTION public.validate_profile_username()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;
  IF NEW.username IS NOT NULL THEN
    NEW.username := lower(trim(NEW.username));
    IF NEW.username !~ '^[a-z0-9][a-z0-9._-]{2,29}$' THEN
      RAISE EXCEPTION 'Username must contain 3-30 letters, digits, dots, underscores or hyphens'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_profile_username() FROM PUBLIC;
CREATE TRIGGER profiles_validate_username BEFORE INSERT OR UPDATE OF username
  ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_profile_username();

ALTER TABLE public.tasting_notes
  DROP CONSTRAINT IF EXISTS tasting_notes_rating_check,
  DROP CONSTRAINT IF EXISTS tasting_notes_profile_ranges_check,
  ADD CONSTRAINT tasting_notes_rating_check CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT tasting_notes_profile_ranges_check CHECK (
    body BETWEEN 0 AND 10 AND tannin BETWEEN 0 AND 10
    AND acidity BETWEEN 0 AND 10 AND sweetness BETWEEN 0 AND 10
  );

ALTER TABLE public.wishlist
  DROP CONSTRAINT IF EXISTS wishlist_prices_check,
  DROP CONSTRAINT IF EXISTS wishlist_priority_check,
  DROP CONSTRAINT IF EXISTS wishlist_vintage_check,
  ADD CONSTRAINT wishlist_prices_check CHECK (
    target_price >= 0 AND current_price >= 0 AND last_checked_price >= 0
  ),
  ADD CONSTRAINT wishlist_priority_check CHECK (priority BETWEEN 0 AND 5),
  ADD CONSTRAINT wishlist_vintage_check CHECK (vintage BETWEEN 1700 AND 2200);

COMMIT;
