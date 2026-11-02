-- Automatic late-checkout / overstay rule settings (2026-11-02).
-- Seeds the house rule in billing_policies. The code falls back to these
-- same defaults when a key row is missing, so an old database still works
-- before this migration runs; the rule is calculated at checkout only
-- (no auto-checkout, no sweep, no background job).
-- Idempotent: safe to re-run. Each row is inserted only when its key is
-- absent, and ids follow the table's manual MAX(id)+1 pattern.
INSERT INTO billing_policies (id, policy_key, policy_value, updated_by)
SELECT COALESCE(MAX(id), 0) + 1, 'LATE_CHECKOUT_ENABLED', '1', NULL FROM billing_policies
WHERE NOT EXISTS (SELECT 1 FROM billing_policies WHERE policy_key = 'LATE_CHECKOUT_ENABLED');
INSERT INTO billing_policies (id, policy_key, policy_value, updated_by)
SELECT COALESCE(MAX(id), 0) + 1, 'LATE_CHECKOUT_GRACE_MINUTES', '60', NULL FROM billing_policies
WHERE NOT EXISTS (SELECT 1 FROM billing_policies WHERE policy_key = 'LATE_CHECKOUT_GRACE_MINUTES');
INSERT INTO billing_policies (id, policy_key, policy_value, updated_by)
SELECT COALESCE(MAX(id), 0) + 1, 'LATE_CHECKOUT_CUTOFF_TIME', '18:00', NULL FROM billing_policies
WHERE NOT EXISTS (SELECT 1 FROM billing_policies WHERE policy_key = 'LATE_CHECKOUT_CUTOFF_TIME');
INSERT INTO billing_policies (id, policy_key, policy_value, updated_by)
SELECT COALESCE(MAX(id), 0) + 1, 'LATE_CHECKOUT_FEE_PERCENT', '50.00', NULL FROM billing_policies
WHERE NOT EXISTS (SELECT 1 FROM billing_policies WHERE policy_key = 'LATE_CHECKOUT_FEE_PERCENT');
