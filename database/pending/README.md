# Pending database changes

Files in this directory are versioned review artifacts. They are not executed
automatically and must not be copied into the applied migration sequence until
approval.

## Aroma intensities

`20260914041400_add_tasting_note_aroma_intensities.sql` adds one `JSONB` column
to `public.tasting_notes`. It is additive and does not change existing rows,
grants, owner policies, triggers, or functions.

Before applying, verify that the column is absent:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasting_notes'
  AND column_name = 'aroma_intensities';
```

After approval, apply the checked-in SQL through the normal migration workflow.
Run the query again and verify one row with type `jsonb`, `is_nullable = NO`,
and an empty JSON-object default. Then test one owner-authored note save and
reload. No new grants or policies are needed because this is a column on the
existing owner-restricted table.

Current status: prepared and versioned, not applied to any environment.