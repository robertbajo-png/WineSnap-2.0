CREATE OR REPLACE FUNCTION public.trg_wines_recompute_taste()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Cascading account deletion must not recreate a profile for a removed user.
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
      PERFORM public.recompute_taste_profile(OLD.user_id);
    END IF;
    RETURN OLD;
  ELSE
    PERFORM public.recompute_taste_profile(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$$;
