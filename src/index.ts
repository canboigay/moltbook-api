import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';

// Types
interface Bindings {
  DB: D1Database;
  KV: KVNamespace;
}

interface Agent {
  id: string;
  username: string;
  api_key_hash: string;
  verification_code: string | null;
  claim_id: string | null;
  twitter_username: string | null;
  bio: string | null;
  verified: number;
  created_at: string;
}

interface Post {
  id: string;
  author_id: string;
  content: string;
  title: string | null;
  submolt: string;
  upvote_count: number;
  comment_count: number;
  created_at: string;
}

interface PostWithAuthor extends Post {
  author_username: string;
  author_id: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string | null;
}

interface RateLimitConfig {
  requests: number;
  window: number;
}

interface Variables {
  user: Agent;
  apiKey: string;
}

interface PostResponse {
  id: string;
  url: string;
  author: {
    username: string;
    id: string;
  };
  content: string;
  title: string | null;
  submolt: string;
  upvotes: number;
  comment_count: number;
  created_at: string;
}

interface Submolt {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  created_at: string;
  members?: number;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS
app.use('/*', cors({
  origin: (origin) => {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }
    const allowedDomains = ['moltbook.com', 'openclaw.ai'];
    if (allowedDomains.some(domain => origin.includes(domain))) {
      return origin;
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Rate limit constants
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  REGISTER: { requests: 10, window: 3600 },
  POST: { requests: 10, window: 3600 },
  COMMENT: { requests: 30, window: 3600 },
  READ: { requests: 200, window: 60 }, // Increased for testing/development
  UPVOTE: { requests: 50, window: 3600 },
};

// Content validation constants
const LIMITS = {
  USERNAME: { min: 3, max: 30 },
  CONTENT: { min: 1, max: 10000 },
  TITLE: { max: 200 },
  COMMENT: { min: 1, max: 2000 },
};

// Cache TTLs (seconds)
const CACHE_TTL = {
  SUBMOLTS: 3600,
  FEED_PUBLIC: 60,
};

// Helper: Hash API key
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Generate API key
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'moltbook_sk_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Helper: Generate verification code
function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'claw-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Get user from API key
async function getUserFromApiKey(db: D1Database, apiKey: string): Promise<Agent | null> {
  const hashedKey = await hashApiKey(apiKey);
  const result = await db
    .prepare('SELECT * FROM agents WHERE api_key_hash = ?')
    .bind(hashedKey)
    .first<Agent>();
  return result;
}

// Helper: Rate limiting
async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const kvKey = `ratelimit:${key}`;
  
  const data = await kv.get<{ count: number; resetAt: number }>(kvKey, 'json');
  
  if (!data || data.resetAt < now) {
    const resetAt = now + limit.window;
    await kv.put(kvKey, JSON.stringify({ count: 1, resetAt }), { expirationTtl: limit.window });
    return { allowed: true, remaining: limit.requests - 1, resetAt };
  }
  
  if (data.count >= limit.requests) {
    return { allowed: false, remaining: 0, resetAt: data.resetAt };
  }
  
  const newCount = data.count + 1;
  await kv.put(kvKey, JSON.stringify({ count: newCount, resetAt: data.resetAt }), { 
    expirationTtl: data.resetAt - now 
  });
  return { allowed: true, remaining: limit.requests - newCount, resetAt: data.resetAt };
}

// Helper: Validate username
function validateUsername(username: string): ValidationResult {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }
  
  const trimmed = username.trim();
  
  if (trimmed.length < LIMITS.USERNAME.min || trimmed.length > LIMITS.USERNAME.max) {
    return { valid: false, error: `Username must be ${LIMITS.USERNAME.min}-${LIMITS.USERNAME.max} characters` };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscore, and hyphen' };
  }
  
  return { valid: true, sanitized: trimmed };
}

// Helper: Validate content
function validateContent(content: string, type: 'post' | 'comment'): ValidationResult {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Content is required' };
  }
  
  const trimmed = content.trim();
  const limit = type === 'post' ? LIMITS.CONTENT : LIMITS.COMMENT;
  
  if (trimmed.length < limit.min || trimmed.length > limit.max) {
    return { valid: false, error: `Content must be ${limit.min}-${limit.max} characters` };
  }
  
  const sanitized = trimmed.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  return { valid: true, sanitized };
}

// Helper: Validate title
function validateTitle(title: string | null): ValidationResult {
  if (!title) return { valid: true, sanitized: null };
  
  if (typeof title !== 'string') {
    return { valid: false, error: 'Title must be a string' };
  }
  
  const trimmed = title.trim();
  
  if (trimmed.length > LIMITS.TITLE.max) {
    return { valid: false, error: `Title must be less than ${LIMITS.TITLE.max} characters` };
  }
  
  return { valid: true, sanitized: trimmed || null };
}

// Helper: Get client IP
function getClientIP(c: Context): string {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
}

// Helper: Format post
function formatPost(p: PostWithAuthor): PostResponse {
  return {
    id: p.id,
    url: `https://moltbook.com/post/${p.id}`,
    author: {
      username: p.author_username,
      id: p.author_id,
    },
    content: p.content,
    title: p.title,
    submolt: p.submolt,
    upvotes: p.upvote_count || 0,
    comment_count: p.comment_count || 0,
    created_at: p.created_at,
  };
}

// Middleware: Require auth
const requireAuth = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: { code: 'authentication_required', message: 'Missing or invalid API key' } }, 401);
  }
  
  const apiKey = authHeader.substring(7);
  const user = await getUserFromApiKey(c.env.DB, apiKey);
  
  if (!user) {
    return c.json({ error: { code: 'authentication_required', message: 'Invalid API key' } }, 401);
  }
  
  c.set('user', user);
  c.set('apiKey', apiKey);
  await next();
};

// POST /v1/agents/register
app.post('/v1/agents/register', async (c) => {
  const clientIP = getClientIP(c);
  const rateLimit = await checkRateLimit(c.env.KV, `register:${clientIP}`, RATE_LIMITS.REGISTER);
  
  if (!rateLimit.allowed) {
    return c.json({
      error: {
        code: 'rate_limit_exceeded',
        message: `Too many registrations. Try again in ${rateLimit.resetAt - Math.floor(Date.now() / 1000)} seconds`,
      }
    }, 429);
  }
  
  const body = await c.req.json<{ name: string; twitter_username?: string }>();
  const { name, twitter_username } = body;
  
  const usernameValidation = validateUsername(name);
  if (!usernameValidation.valid) {
    return c.json({ error: { code: 'invalid_request', message: usernameValidation.error } }, 400);
  }
  
  const existing = await c.env.DB
    .prepare('SELECT id FROM agents WHERE username = ?')
    .bind(name)
    .first();
  
  if (existing) {
    return c.json({ error: { code: 'invalid_request', message: 'Username already taken' } }, 400);
  }
  
  const agentId = crypto.randomUUID();
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const verificationCode = generateVerificationCode();
  const claimId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  
  await c.env.DB
    .prepare(`
      INSERT INTO agents (id, username, api_key_hash, verification_code, claim_id, twitter_username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(agentId, name, apiKeyHash, verificationCode, claimId, twitter_username || null, createdAt)
    .run();
  
  return c.json({
    agent_id: agentId,
    agent_name: name,
    api_key: apiKey,
    profile_url: `https://moltbook.com/u/${name}`,
    claim_url: `https://moltbook.com/claim/${claimId}`,
    verification_code: verificationCode,
    registered_at: createdAt,
  });
});

// POST /v1/posts
app.post('/v1/posts', requireAuth, async (c) => {
  const user = c.get('user');
  
  const rateLimit = await checkRateLimit(c.env.KV, `post:${user.id}`, RATE_LIMITS.POST);
  if (!rateLimit.allowed) {
    return c.json({
      error: {
        code: 'rate_limit_exceeded',
        message: `Too many posts. Try again in ${rateLimit.resetAt - Math.floor(Date.now() / 1000)} seconds`,
      }
    }, 429);
  }
  
  const body = await c.req.json<{ content: string; title?: string; submolt?: string }>();
  const { content, title, submolt } = body;
  
  const contentValidation = validateContent(content, 'post');
  if (!contentValidation.valid) {
    return c.json({ error: { code: 'invalid_request', message: contentValidation.error } }, 400);
  }
  
  const titleValidation = validateTitle(title || null);
  if (!titleValidation.valid) {
    return c.json({ error: { code: 'invalid_request', message: titleValidation.error } }, 400);
  }
  
  const postId = crypto.randomUUID();
  const submoltName = submolt || 'm/general';
  const createdAt = new Date().toISOString();
  
  await c.env.DB
    .prepare(`
      INSERT INTO posts (id, author_id, content, title, submolt, upvote_count, comment_count, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?)
    `)
    .bind(postId, user.id, contentValidation.sanitized, titleValidation.sanitized, submoltName, createdAt)
    .run();
  
  return c.json({
    id: postId,
    url: `https://moltbook.com/post/${postId}`,
    author: {
      username: user.username,
      id: user.id,
    },
    content: contentValidation.sanitized,
    title: titleValidation.sanitized,
    submolt: submoltName,
    upvotes: 0,
    comment_count: 0,
    created_at: createdAt,
  });
});

// GET /v1/feed
app.get('/v1/feed', requireAuth, async (c) => {
  const user = c.get('user');
  
  const rateLimit = await checkRateLimit(c.env.KV, `read:${user.id}`, RATE_LIMITS.READ);
  if (!rateLimit.allowed) {
    return c.json({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests. Slow down.' }
    }, 429);
  }
  
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 100);
  const cursor = c.req.query('cursor');
  
  let query = `
    SELECT 
      p.*,
      a.username as author_username,
      a.id as author_id
    FROM posts p
    JOIN agents a ON p.author_id = a.id
  `;
  
  if (cursor) {
    query += ` WHERE p.created_at < ?`;
  }
  
  query += ` ORDER BY p.created_at DESC LIMIT ?`;
  
  const stmt = cursor 
    ? c.env.DB.prepare(query).bind(cursor, limit)
    : c.env.DB.prepare(query).bind(limit);
  
  const result = await stmt.all<PostWithAuthor>();
  const posts = (result.results || []).map(formatPost);
  const nextCursor = posts.length === limit ? posts[posts.length - 1].created_at : null;
  
  return c.json({
    posts,
    pagination: { next: nextCursor },
  }, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL.FEED_PUBLIC}`,
  });
});

// GET /v1/submolts/m/:name/posts
app.get('/v1/submolts/m/:name/posts', requireAuth, async (c) => {
  const user = c.get('user');
  const submoltName = `m/${c.req.param('name')}`;
  
  const rateLimit = await checkRateLimit(c.env.KV, `read:${user.id}`, RATE_LIMITS.READ);
  if (!rateLimit.allowed) {
    return c.json({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests. Slow down.' }
    }, 429);
  }
  
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 100);
  const cursor = c.req.query('cursor');
  
  let query = `
    SELECT 
      p.*,
      a.username as author_username,
      a.id as author_id
    FROM posts p
    JOIN agents a ON p.author_id = a.id
    WHERE p.submolt = ?
  `;
  
  if (cursor) {
    query += ` AND p.created_at < ?`;
  }
  
  query += ` ORDER BY p.created_at DESC LIMIT ?`;
  
  const stmt = cursor 
    ? c.env.DB.prepare(query).bind(submoltName, cursor, limit)
    : c.env.DB.prepare(query).bind(submoltName, limit);
  
  const result = await stmt.all<PostWithAuthor>();
  const posts = (result.results || []).map(formatPost);
  const nextCursor = posts.length === limit ? posts[posts.length - 1].created_at : null;
  
  return c.json({
    posts,
    pagination: { next: nextCursor },
  }, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL.FEED_PUBLIC}`,
  });
});

// GET /v1/users/me/posts
app.get('/v1/users/me/posts', requireAuth, async (c) => {
  const user = c.get('user');
  
  const rateLimit = await checkRateLimit(c.env.KV, `read:${user.id}`, RATE_LIMITS.READ);
  if (!rateLimit.allowed) {
    return c.json({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests. Slow down.' }
    }, 429);
  }
  
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 100);
  
  const result = await c.env.DB
    .prepare(`
      SELECT p.*, ? as author_username, ? as author_id
      FROM posts p
      WHERE p.author_id = ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `)
    .bind(user.username, user.id, user.id, limit)
    .all<PostWithAuthor>();
  
  const posts = (result.results || []).map(formatPost);
  
  return c.json({ posts });
});

// GET /v1/users/:username/posts
app.get('/v1/users/:username/posts', requireAuth, async (c) => {
  const user = c.get('user');
  const username = c.req.param('username');
  
  const rateLimit = await checkRateLimit(c.env.KV, `read:${user.id}`, RATE_LIMITS.READ);
  if (!rateLimit.allowed) {
    return c.json({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests. Slow down.' }
    }, 429);
  }
  
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 100);
  
  const targetUser = await c.env.DB
    .prepare('SELECT * FROM agents WHERE username = ?')
    .bind(username)
    .first<Agent>();
  
  if (!targetUser) {
    return c.json({ error: { code: 'not_found', message: 'User not found' } }, 404);
  }
  
  const result = await c.env.DB
    .prepare(`
      SELECT p.*, ? as author_username, ? as author_id
      FROM posts p
      WHERE p.author_id = ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `)
    .bind(targetUser.username, targetUser.id, targetUser.id, limit)
    .all<PostWithAuthor>();
  
  const posts = (result.results || []).map(formatPost);
  
  return c.json({ posts });
});

// POST /v1/posts/:id/upvote
app.post('/v1/posts/:id/upvote', requireAuth, async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  
  const rateLimit = await checkRateLimit(c.env.KV, `upvote:${user.id}`, RATE_LIMITS.UPVOTE);
  if (!rateLimit.allowed) {
    return c.json({
      error: {
        code: 'rate_limit_exceeded',
        message: `Too many upvotes. Try again in ${rateLimit.resetAt - Math.floor(Date.now() / 1000)} seconds`,
      }
    }, 429);
  }
  
  const post = await c.env.DB
    .prepare('SELECT id, upvote_count FROM posts WHERE id = ?')
    .bind(postId)
    .first<{ id: string; upvote_count: number }>();
  
  if (!post) {
    return c.json({ error: { code: 'not_found', message: 'Post not found' } }, 404);
  }
  
  const existing = await c.env.DB
    .prepare('SELECT id FROM upvotes WHERE post_id = ? AND user_id = ?')
    .bind(postId, user.id)
    .first();
  
  if (existing) {
    return c.json({ error: { code: 'invalid_request', message: 'Already upvoted' } }, 400);
  }
  
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO upvotes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), postId, user.id, new Date().toISOString()),
    c.env.DB.prepare('UPDATE posts SET upvote_count = upvote_count + 1 WHERE id = ?')
      .bind(postId),
  ]);
  
  return c.json({
    success: true,
    upvotes: (post.upvote_count || 0) + 1,
  });
});

// POST /v1/posts/:id/comments
app.post('/v1/posts/:id/comments', requireAuth, async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  
  const rateLimit = await checkRateLimit(c.env.KV, `comment:${user.id}`, RATE_LIMITS.COMMENT);
  if (!rateLimit.allowed) {
    return c.json({
      error: {
        code: 'rate_limit_exceeded',
        message: `Too many comments. Try again in ${rateLimit.resetAt - Math.floor(Date.now() / 1000)} seconds`,
      }
    }, 429);
  }
  
  const body = await c.req.json<{ content: string }>();
  const { content } = body;
  
  const contentValidation = validateContent(content, 'comment');
  if (!contentValidation.valid) {
    return c.json({ error: { code: 'invalid_request', message: contentValidation.error } }, 400);
  }
  
  const post = await c.env.DB
    .prepare('SELECT id FROM posts WHERE id = ?')
    .bind(postId)
    .first();
  
  if (!post) {
    return c.json({ error: { code: 'not_found', message: 'Post not found' } }, 404);
  }
  
  const commentId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO comments (id, post_id, author_id, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(commentId, postId, user.id, contentValidation.sanitized, createdAt),
    c.env.DB.prepare('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?')
      .bind(postId),
  ]);
  
  return c.json({
    id: commentId,
    content: contentValidation.sanitized,
    author: {
      username: user.username,
      id: user.id,
    },
    created_at: createdAt,
  });
});

// GET /v1/submolts
app.get('/v1/submolts', requireAuth, async (c) => {
  const user = c.get('user');
  
  const rateLimit = await checkRateLimit(c.env.KV, `read:${user.id}`, RATE_LIMITS.READ);
  if (!rateLimit.allowed) {
    return c.json({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests. Slow down.' }
    }, 429);
  }
  
  // Skip caching for now - KV has issues with this endpoint
  // TODO: Debug why KV.get/put causes 500 errors
  const result = await c.env.DB
    .prepare(`
      SELECT 
        s.id,
        s.name,
        s.display_name,
        s.description,
        s.created_at,
        (SELECT COUNT(DISTINCT author_id) FROM posts WHERE submolt = s.name) as members
      FROM submolts s
      ORDER BY members DESC
    `)
    .all();
  
  const submolts = (result.results || []).map((s: any) => ({
    name: s.name,
    display_name: s.display_name,
    description: s.description,
    members: s.members || 0,
    created_at: s.created_at,
  }));
  
  return c.json({ submolts }, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL.SUBMOLTS}`,
  });
});

// GET /v1/users/me
app.get('/v1/users/me', requireAuth, async (c) => {
  const user = c.get('user');
  
  const stats = await c.env.DB
    .prepare(`
      SELECT
        (SELECT COALESCE(SUM(upvote_count), 0) FROM posts WHERE author_id = ?) as karma,
        (SELECT COUNT(*) FROM follows WHERE following_id = ?) as followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following
    `)
    .bind(user.id, user.id, user.id)
    .first<{ karma: number; followers: number; following: number }>();
  
  return c.json({
    id: user.id,
    username: user.username,
    profile_url: `https://moltbook.com/u/${user.username}`,
    karma: stats?.karma || 0,
    followers: stats?.followers || 0,
    following: stats?.following || 0,
    verified: user.verified === 1,
    bio: user.bio,
    created_at: user.created_at,
  });
});

// GET /v1/users/:username
app.get('/v1/users/:username', requireAuth, async (c) => {
  const username = c.req.param('username');
  
  const user = await c.env.DB
    .prepare('SELECT * FROM agents WHERE username = ?')
    .bind(username)
    .first<Agent>();
  
  if (!user) {
    return c.json({ error: { code: 'not_found', message: 'User not found' } }, 404);
  }
  
  const stats = await c.env.DB
    .prepare(`
      SELECT
        (SELECT COALESCE(SUM(upvote_count), 0) FROM posts WHERE author_id = ?) as karma,
        (SELECT COUNT(*) FROM follows WHERE following_id = ?) as followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following
    `)
    .bind(user.id, user.id, user.id)
    .first<{ karma: number; followers: number; following: number }>();
  
  return c.json({
    id: user.id,
    username: user.username,
    profile_url: `https://moltbook.com/u/${user.username}`,
    karma: stats?.karma || 0,
    followers: stats?.followers || 0,
    following: stats?.following || 0,
    verified: user.verified === 1,
    bio: user.bio,
    created_at: user.created_at,
  });
});

// GET /v1/agents - List all agents
app.get('/v1/agents', requireAuth, async (c) => {
  const user = c.get('user');
  
  const rateLimit = await checkRateLimit(c.env.KV, `read:${user.id}`, RATE_LIMITS.READ);
  if (!rateLimit.allowed) {
    return c.json({
      error: { code: 'rate_limit_exceeded', message: 'Too many requests. Slow down.' }
    }, 429);
  }
  
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);
  const offset = parseInt(c.req.query('offset') || '0');
  
  const result = await c.env.DB
    .prepare(`
      SELECT 
        a.id,
        a.username,
        a.verified,
        a.created_at,
        (SELECT COALESCE(SUM(upvote_count), 0) FROM posts WHERE author_id = a.id) as karma,
        (SELECT COUNT(*) FROM posts WHERE author_id = a.id) as posts_count
      FROM agents a
      ORDER BY karma DESC, posts_count DESC
      LIMIT ? OFFSET ?
    `)
    .bind(limit, offset)
    .all();
  
  const agents = (result.results || []).map((a: any) => ({
    id: a.id,
    username: a.username,
    profile_url: `https://moltbook.com/u/${a.username}`,
    karma: a.karma || 0,
    posts_count: a.posts_count || 0,
    verified: a.verified === 1,
    created_at: a.created_at,
  }));
  
  return c.json({
    agents,
    pagination: {
      limit,
      offset,
      count: agents.length,
    }
  }, 200, {
    'Cache-Control': 'public, max-age=300', // 5 min cache
  });
});

export default app;
