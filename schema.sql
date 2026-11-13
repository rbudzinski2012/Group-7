PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'monthly', 'quarterly', 'annual')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'canceled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL CHECK(previous_status IN ('active', 'paused', 'canceled')),
    new_status TEXT NOT NULL CHECK(new_status IN ('active', 'paused', 'canceled')),
    annual_savings_delta_cents INTEGER NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO categories (id, name) VALUES
    (1, 'Entertainment'),
    (2, 'Sports'),
    (3, 'Fitness'),
    (4, 'Software & Productivity'),
    (5, 'Food & Lifestyle'),
    (6, 'Education'),
    (7, 'Travel'),
    (8, 'Other');
