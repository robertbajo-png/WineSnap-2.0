# Step 3: Ask WineSnap

Ask WineSnap is a private, authenticated sommelier chat that combines four separate inputs:

- wine facts for the optional current wine;
- explicit profile choices and the computed taste profile;
- evidence-backed `derived_preferences` from Wine Memory;
- recent wines in the user's own cellar.

The model receives these as bounded context data. It cannot write preferences, change the cellar,
or perform purchases or sharing actions. Conversation writes are server-only and each successful
question/answer pair is stored atomically by `store_ai_exchange`; failed AI requests do not leave
partial history.

## Staging acceptance checks

1. Apply migrations through `20260925090000_add_ask_winesnap.sql` in a disposable Supabase project.
2. Run `supabase/tests/step1_security.sql`, `step2_wine_memory.sql`, and
   `step3_ask_winesnap.sql`.
3. Deploy `ask-winesnap` with JWT verification enabled.
4. Confirm anonymous requests and expired JWTs receive `401`.
5. Ask from `/ask` and from a wine detail page; verify only the latter receives that wine as context.
6. Confirm a user cannot open, read, or delete another user's conversations or messages.
7. Force a gateway timeout and verify no partial question or empty conversation is stored.
8. Send more than 20 requests in five minutes and verify the shared atomic quota returns `429`.
9. Confirm a new user receives an honest cold-start answer without invented preferences.
10. Check Swedish and English responses, conversation history, deletion, mobile layout, and keyboard
    submission.

Production migration and Edge Function deployment remain intentionally separate from this code
change and require an authenticated Supabase release step.
