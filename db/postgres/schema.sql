-- Cybers/ash PostgreSQL schema
-- Target: move the current JSON MVP into a database that can handle feed, search, DMs, media, and creator video scale.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS app_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT,
  pfp_url TEXT,
  banner_url TEXT,
  about TEXT NOT NULL DEFAULT '',
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  two_factor_secret TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  privacy_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  screen_time JSONB NOT NULL DEFAULT '{}'::jsonb,
  cyberbite_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follows (
  follower_username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  following_username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_username, following_username)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGSERIAL PRIMARY KEY,
  owner_username TEXT REFERENCES app_users(username) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video', 'audio', 'file', 'avatar', 'banner')),
  mime_type TEXT,
  original_name TEXT,
  byte_size BIGINT,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC(10, 3),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_public_url ON media_assets(public_url);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_created ON media_assets(owner_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_kind_created ON media_assets(media_kind, created_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT PRIMARY KEY,
  author_username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  is_video BOOLEAN NOT NULL DEFAULT false,
  parent_id BIGINT REFERENCES posts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  retweet_of BIGINT REFERENCES posts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  quote_of BIGINT REFERENCES posts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  is_retweet BOOLEAN NOT NULL DEFAULT false,
  is_quote BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  pfp_url TEXT,
  views BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', unaccent(coalesce(body, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(author_username, ''))), 'B')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_posts_feed_created ON posts(created_at DESC, id DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_parent_created ON posts(parent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_posts_quote_of ON posts(quote_of) WHERE quote_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_retweet_of ON posts(retweet_of) WHERE retweet_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_search_vector ON posts USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_posts_body_trgm ON posts USING GIN(body gin_trgm_ops);

CREATE TABLE IF NOT EXISTS post_interactions (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('like', 'save', 'retweet')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, username, interaction_type)
);

CREATE INDEX IF NOT EXISTS idx_post_interactions_user_type ON post_interactions(username, interaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_interactions_post_type ON post_interactions(post_id, interaction_type);

CREATE TABLE IF NOT EXISTS direct_messages (
  id BIGSERIAL PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  sender_username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  receiver_username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  is_video BOOLEAN NOT NULL DEFAULT false,
  media_name TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_direct_pair_created ON direct_messages(
  LEAST(sender_username, receiver_username),
  GREATEST(sender_username, receiver_username),
  created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_direct_receiver_status ON direct_messages(receiver_username, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_body_trgm ON direct_messages USING GIN (body gin_trgm_ops);

CREATE TABLE IF NOT EXISTS chat_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_username TEXT REFERENCES app_users(username) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, username)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id BIGSERIAL PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_username TEXT REFERENCES app_users(username) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  is_video BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_created ON group_messages(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  actor_username TEXT REFERENCES app_users(username) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created ON notifications(recipient_username, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS cyberbites (
  id BIGINT PRIMARY KEY,
  author_username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  pfp_url TEXT,
  views BIGINT NOT NULL DEFAULT 0,
  file_size BIGINT,
  original_name TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', unaccent(coalesce(caption, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(author_username, ''))), 'B')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_cyberbites_created ON cyberbites(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_cyberbites_author_created ON cyberbites(author_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cyberbites_search_vector ON cyberbites USING GIN(search_vector);

CREATE TABLE IF NOT EXISTS cyberbite_interactions (
  cyberbite_id BIGINT NOT NULL REFERENCES cyberbites(id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('like', 'save')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cyberbite_id, username, interaction_type)
);

CREATE INDEX IF NOT EXISTS idx_cyberbite_interactions_user ON cyberbite_interactions(username, interaction_type, created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  creator_username TEXT REFERENCES app_users(username) ON DELETE SET NULL,
  subject TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created ON support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_creator_created ON support_tickets(creator_username, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_username TEXT REFERENCES app_users(username) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_type_created ON audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON audit_events(actor_username, created_at DESC);

COMMIT;
