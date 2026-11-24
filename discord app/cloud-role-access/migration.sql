-- Additive migration applied to the existing Formline D1 database on 2026-11-24.
CREATE TABLE IF NOT EXISTS role_pairs(pair_id TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,poll_hash TEXT NOT NULL,client_hash TEXT NOT NULL,customer_id TEXT,status TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS role_sessions(token_hash TEXT PRIMARY KEY,client_hash TEXT NOT NULL,customer_id TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS role_sessions_customer ON role_sessions(customer_id);
CREATE TABLE IF NOT EXISTS role_redemptions(license_id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','complete','revoked')));
CREATE TABLE IF NOT EXISTS role_rollout(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL,registered INTEGER NOT NULL DEFAULT 0,detail TEXT,updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS role_denials(customer_id TEXT PRIMARY KEY);
INSERT OR IGNORE INTO role_rollout VALUES(1,'pending',0,'Waiting for Discord preflight',0);
