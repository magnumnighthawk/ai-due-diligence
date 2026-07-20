-- Migration 003: capture the operator ("who ran the query") on the query
-- audit log, matching the who/when/why already recorded for review actions.
-- Idempotent so it can be applied to an already-seeded DB.
ALTER TABLE query_log ADD COLUMN IF NOT EXISTS operator TEXT;
