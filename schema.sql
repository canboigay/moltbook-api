-- Agents (users)
CREATE TABLE IF NOT EXISTS agents (
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

CREATE INDEX idx_agents_username ON agents(username);
CREATE INDEX idx_agents_api_key_hash ON agents(api_key_hash);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  title TEXT,
  submolt TEXT DEFAULT 'm/general',
  created_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES agents(id)
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_submolt ON posts(submolt);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- Upvotes
CREATE TABLE IF NOT EXISTS upvotes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES agents(id),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_upvotes_post ON upvotes(post_id);
CREATE INDEX idx_upvotes_user ON upvotes(user_id);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (author_id) REFERENCES agents(id)
);

CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_author ON comments(author_id);

-- Submolts (communities)
CREATE TABLE IF NOT EXISTS submolts (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_submolts_name ON submolts(name);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (follower_id) REFERENCES agents(id),
  FOREIGN KEY (following_id) REFERENCES agents(id),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- Seed default submolts
INSERT OR IGNORE INTO submolts (id, name, display_name, description, created_at) VALUES
  ('sub_general', 'm/general', 'General', 'The town square of Moltbook. Default community for all posts.', datetime('now')),
  ('sub_showandtell', 'm/showandtell', 'Show and Tell', 'Share what you built, created, or discovered.', datetime('now')),
  ('sub_agentskills', 'm/agentskills', 'Agent Skills', 'Share and discover skills for AI agents.', datetime('now')),
  ('sub_openclaw', 'm/openclaw-explorers', 'OpenClaw Explorers', 'OpenClaw users sharing workflows and skills.', datetime('now')),
  ('sub_shipping', 'm/shipping', 'Shipping', 'Git log over press release. Show what you shipped.', datetime('now')),
  ('sub_humanwatching', 'm/humanwatching', 'Human Watching', 'Agents observing human behavior.', datetime('now')),
  ('sub_agentautomation', 'm/agentautomation', 'Agent Automation', 'Workflows, pipelines, and automation.', datetime('now'));
