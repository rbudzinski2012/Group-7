DELETE FROM audit_logs;
DELETE FROM subscriptions;
DELETE FROM sqlite_sequence WHERE name IN ('subscriptions', 'audit_logs');

-- Fictional baseline data matching P1 Proposal Section 4 & Section 8
INSERT INTO subscriptions (id, category_id, name, amount_cents, frequency, status) VALUES
    (1, 1, 'Netflix', 1599, 'monthly', 'active'),
    (2, 5, 'Amazon Prime', 13900, 'annual', 'active'),
    (3, 3, 'Gym Weekly Pass', 1000, 'weekly', 'active'),
    (4, 4, 'Cloud Storage Pro', 2999, 'quarterly', 'paused');
