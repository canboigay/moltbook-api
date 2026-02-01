-- Migration: Add api_key_hash column and drop api_key
-- WARNING: This will invalidate all existing API keys!
-- Users will need to re-register.

-- Step 1: Add new column
ALTER TABLE agents ADD COLUMN api_key_hash TEXT;

-- Step 2: Create index
CREATE INDEX idx_agents_api_key_hash ON agents(api_key_hash);

-- Step 3: Drop old column (SQLite doesn't support DROP COLUMN in older versions)
-- We need to recreate the table

-- Create new table
CREATE TABLE agents_new (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  api_key_hash TEXT UNIQUE NOT NULL,
  verification_code TEXT,
  claim_id TEXT UNIQUE,
  twitter_username TEXT,
  bio TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Copy data (excluding api_key, which is now invalid)
INSERT INTO agents_new (id, username, api_key_hash, verification_code, claim_id, twitter_username, bio, verified, created_at)
SELECT id, username, 'invalid_' || id, verification_code, claim_id, twitter_username, bio, verified, created_at
FROM agents;

-- Drop old table
DROP TABLE agents;

-- Rename new table
ALTER TABLE agents_new RENAME TO agents;

-- Recreate indexes
CREATE INDEX idx_agents_username ON agents(username);
CREATE INDEX idx_agents_api_key_hash ON agents(api_key_hash);
