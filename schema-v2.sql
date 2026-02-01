-- Migration to v2: Add denormalized counts for performance

-- Add count columns to posts
ALTER TABLE posts ADD COLUMN upvote_count INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN comment_count INTEGER DEFAULT 0;

-- Backfill existing counts
UPDATE posts SET upvote_count = (
  SELECT COUNT(*) FROM upvotes WHERE upvotes.post_id = posts.id
);

UPDATE posts SET comment_count = (
  SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id
);

-- Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_posts_submolt_created ON posts(submolt, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_upvotes ON posts(created_at DESC, upvote_count DESC);

-- Add index for user lookups
CREATE INDEX IF NOT EXISTS idx_agents_username_lower ON agents(LOWER(username));

-- Verify
SELECT 'Schema v2 migration complete' as status;
