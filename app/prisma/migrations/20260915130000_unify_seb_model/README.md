# Single Seb model

Run `prisma migrate deploy` before deploying the single-model application code.
This data-only migration imports `selectedModel` and its display name when
`sebModel` is null/blank, or persists `openai/gpt-4o-mini` when neither is set.
Existing Seb selections win, including when chat is disabled. Credentials,
provider availability, and chat/report switches are unchanged.

The deprecated columns remain for compatibility/rollback. Runtime generation
never reads them. Older admin clients may submit `selectedModel` as an alias
for the single Seb model; an explicit `sebModel` takes precedence.
Deployments using `db push` must also execute this data migration; schema sync
alone does not import legacy selections. A migrated text-only legacy model is
preserved intentionally; an admin should select an image-capable model for
vision features. Rollback does not require dropping any columns.
