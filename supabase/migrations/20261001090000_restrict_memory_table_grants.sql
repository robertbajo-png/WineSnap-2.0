-- Override platform default grants with the intended client capabilities.
REVOKE ALL ON public.taste_signals, public.derived_preferences
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.taste_signals, public.derived_preferences TO authenticated;
GRANT ALL ON public.taste_signals, public.derived_preferences TO service_role;

REVOKE ALL ON public.recommendation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.recommendation_events TO authenticated;
GRANT ALL ON public.recommendation_events TO service_role;

REVOKE ALL ON public.restaurant_scans FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_scans TO authenticated;
GRANT ALL ON public.restaurant_scans TO service_role;
