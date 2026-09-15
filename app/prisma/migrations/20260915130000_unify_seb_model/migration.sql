-- Preserve an explicitly configured Seb model. Import the legacy model only
-- when Seb has none, regardless of whether chat is enabled.
UPDATE "GlobalAISettings"
SET "sebModel" = COALESCE(NULLIF(BTRIM("selectedModel"), ''), 'openai/gpt-4o-mini'),
    "sebModelName" = CASE WHEN NULLIF(BTRIM("selectedModel"), '') IS NOT NULL
                          THEN "modelName" ELSE NULL END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE NULLIF(BTRIM("sebModel"), '') IS NULL;
