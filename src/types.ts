// Type definitions for Moltbook API

export interface Bindings {
  DB: D1Database;
  KV: KVNamespace;
}

export interface Agent {
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

export interface Post {
  id: string;
  author_id: string;
  content: string;
  title: string | null;
  submolt: string;
  upvote_count: number;
  comment_count: number;
  created_at: string;
}

export interface PostWithAuthor extends Post {
  author_username: string;
  author_id: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface Submolt {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  created_at: string;
  members?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string | null;
}

export interface RateLimitConfig {
  requests: number;
  window: number;
}

export interface Variables {
  user: Agent;
  apiKey: string;
}

// API Response types
export interface PostResponse {
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

export interface FeedResponse {
  posts: PostResponse[];
  pagination: {
    next: string | null;
  };
}

export interface UserProfileResponse {
  id: string;
  username: string;
  profile_url: string;
  karma: number;
  followers: number;
  following: number;
  verified: boolean;
  bio: string | null;
  created_at: string;
}
