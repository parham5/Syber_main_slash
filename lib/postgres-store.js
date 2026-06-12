const db = require("./db");

function clampLimit(limit, fallback = 50, max = 100) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function encodeCursor(row) {
  if (!row) return null;
  return Buffer.from(JSON.stringify({
    createdAt: row.created_at,
    id: row.id
  })).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    if (!decoded.createdAt || !decoded.id) return null;
    return decoded;
  } catch {
    return null;
  }
}

function toMillis(value) {
  if (!value) return Date.now();
  return new Date(value).getTime();
}

function mapPost(row) {
  return {
    id: Number(row.id),
    username: row.author_username,
    message: row.body || "",
    imageUrl: row.media_url || null,
    isVideo: row.is_video === true,
    parentId: row.parent_id ? Number(row.parent_id) : null,
    retweetOf: row.retweet_of ? Number(row.retweet_of) : null,
    quoteOf: row.quote_of ? Number(row.quote_of) : null,
    isRetweet: row.is_retweet === true,
    isQuote: row.is_quote === true,
    isPinned: row.is_pinned === true,
    pfp: row.user_pfp_url || row.pfp_url || null,
    isPremium: row.is_premium === true,
    views: Number(row.views || 0),
    likes: row.likes || [],
    saves: row.saves || [],
    retweets: row.retweets || [],
    replyCount: Number(row.reply_count || 0),
    quoteCount: Number(row.quote_count || 0),
    timestamp: toMillis(row.created_at),
    quotedPost: row.quoted_id ? {
      id: Number(row.quoted_id),
      username: row.quoted_author_username,
      message: row.quoted_body || "",
      imageUrl: row.quoted_media_url || null,
      isVideo: row.quoted_is_video === true,
      timestamp: toMillis(row.quoted_created_at),
      pfp: row.quoted_user_pfp_url || row.quoted_pfp_url || null
    } : null
  };
}

function mapDirectMessage(row) {
  const metadata = row.metadata || {};
  return {
    id: row.legacy_id || Number(row.id),
    sender: row.sender_username,
    receiver: row.receiver_username,
    message: row.body || "",
    mediaUrl: row.media_url || null,
    isVideo: row.is_video === true,
    mediaName: row.media_name || null,
    status: row.status || "sent",
    reactions: row.reactions || {},
    edited: Boolean(metadata.edited),
    editedAt: metadata.editedAt || null,
    replyTo: metadata.replyTo || null,
    timestamp: toMillis(row.created_at),
    senderPfp: row.sender_pfp_url || null
  };
}

function postSelectSql() {
  return `
    SELECT
      p.*,
      u.pfp_url AS user_pfp_url,
      u.is_premium,
      COALESCE(likes.users, ARRAY[]::text[]) AS likes,
      COALESCE(saves.users, ARRAY[]::text[]) AS saves,
      COALESCE(retweets.users, ARRAY[]::text[]) AS retweets,
      COALESCE(replies.count, 0) AS reply_count,
      COALESCE(quotes.count, 0) AS quote_count,
      qp.id AS quoted_id,
      qp.author_username AS quoted_author_username,
      qp.body AS quoted_body,
      qp.media_url AS quoted_media_url,
      qp.is_video AS quoted_is_video,
      qp.pfp_url AS quoted_pfp_url,
      qp.created_at AS quoted_created_at,
      qu.pfp_url AS quoted_user_pfp_url
    FROM posts p
    LEFT JOIN app_users u ON u.username = p.author_username
    LEFT JOIN LATERAL (
      SELECT array_agg(username ORDER BY created_at ASC) AS users
      FROM post_interactions
      WHERE post_id = p.id AND interaction_type = 'like'
    ) likes ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(username ORDER BY created_at ASC) AS users
      FROM post_interactions
      WHERE post_id = p.id AND interaction_type = 'save'
    ) saves ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(username ORDER BY created_at ASC) AS users
      FROM post_interactions
      WHERE post_id = p.id AND interaction_type = 'retweet'
    ) retweets ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS count FROM posts WHERE parent_id = p.id
    ) replies ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS count FROM posts WHERE quote_of = p.id
    ) quotes ON true
    LEFT JOIN posts qp ON qp.id = p.quote_of
    LEFT JOIN app_users qu ON qu.username = qp.author_username
  `;
}

async function listHomeFeed({ limit = 50, cursor = null } = {}) {
  const pageLimit = clampLimit(limit);
  const decodedCursor = decodeCursor(cursor);
  const params = [pageLimit + 1];
  let cursorWhere = "";

  if (decodedCursor) {
    params.push(decodedCursor.createdAt, decodedCursor.id);
    cursorWhere = "AND (p.created_at, p.id) < ($2::timestamptz, $3::bigint)";
  }

  const result = await db.query(`
    ${postSelectSql()}
    WHERE p.parent_id IS NULL
    ${cursorWhere}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $1
  `, params);

  const rows = result.rows.slice(0, pageLimit);
  return {
    items: rows.map(mapPost),
    pagination: {
      limit: pageLimit,
      hasMore: result.rows.length > pageLimit,
      nextCursor: result.rows.length > pageLimit ? encodeCursor(rows[rows.length - 1]) : null
    }
  };
}

async function listDiscoveryCandidates({ limit = 500 } = {}) {
  const pageLimit = clampLimit(limit, 500, 500);
  const result = await db.query(`
    ${postSelectSql()}
    WHERE p.parent_id IS NULL
      AND p.created_at > now() - interval '14 days'
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $1
  `, [pageLimit]);

  return result.rows.map(mapPost);
}

async function listFollowing(username) {
  const result = await db.query(`
    SELECT following_username
    FROM follows
    WHERE follower_username = $1
  `, [username]);

  return result.rows.map(row => row.following_username);
}

async function listMessages({ limit = 50, cursor = null } = {}) {
  return listHomeFeed({ limit, cursor });
}

async function listFollowingFeed({ username, limit = 50, cursor = null } = {}) {
  const pageLimit = clampLimit(limit);
  const decodedCursor = decodeCursor(cursor);
  const params = [username, pageLimit + 1];
  let cursorWhere = "";

  if (decodedCursor) {
    params.push(decodedCursor.createdAt, decodedCursor.id);
    cursorWhere = "AND (p.created_at, p.id) < ($3::timestamptz, $4::bigint)";
  }

  const result = await db.query(`
    ${postSelectSql()}
    LEFT JOIN follows f
      ON f.following_username = p.author_username
      AND f.follower_username = $1
    WHERE p.parent_id IS NULL
      AND (f.follower_username = $1 OR p.author_username = $1)
      ${cursorWhere}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $2
  `, params);

  const rows = result.rows.slice(0, pageLimit);
  return {
    items: rows.map(mapPost),
    pagination: {
      limit: pageLimit,
      hasMore: result.rows.length > pageLimit,
      nextCursor: result.rows.length > pageLimit ? encodeCursor(rows[rows.length - 1]) : null
    }
  };
}

async function searchPosts({ q, limit = 40, cursor = null } = {}) {
  const query = String(q || "").trim();
  const pageLimit = clampLimit(limit, 40);
  if (!query) return { items: [], pagination: { limit: pageLimit, hasMore: false, nextCursor: null } };

  const decodedCursor = decodeCursor(cursor);
  const params = [query, pageLimit + 1];
  let cursorWhere = "";

  if (decodedCursor) {
    params.push(decodedCursor.createdAt, decodedCursor.id);
    cursorWhere = "AND (p.created_at, p.id) < ($3::timestamptz, $4::bigint)";
  }

  const result = await db.query(`
    ${postSelectSql()}
    WHERE p.parent_id IS NULL
      AND (
        p.search_vector @@ plainto_tsquery('simple', unaccent($1))
        OR p.body ILIKE '%' || $1 || '%'
        OR p.author_username ILIKE '%' || $1 || '%'
      )
      ${cursorWhere}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $2
  `, params);

  const rows = result.rows.slice(0, pageLimit);
  return {
    items: rows.map(mapPost),
    pagination: {
      limit: pageLimit,
      hasMore: result.rows.length > pageLimit,
      nextCursor: result.rows.length > pageLimit ? encodeCursor(rows[rows.length - 1]) : null
    }
  };
}

async function searchUsers({ q, currentUser, limit = 20 } = {}) {
  const query = String(q || "").trim();
  if (!query) return [];
  const result = await db.query(`
    SELECT
      u.username,
      u.pfp_url,
      u.about,
      u.is_premium,
      COALESCE(followers.count, 0) AS followers,
      COALESCE(following.count, 0) AS following,
      COALESCE(posts.count, 0) AS post_count
    FROM app_users u
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS count FROM follows WHERE following_username = u.username
    ) followers ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS count FROM follows WHERE follower_username = u.username
    ) following ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS count FROM posts WHERE author_username = u.username AND parent_id IS NULL
    ) posts ON true
    WHERE u.username <> $2
      AND (u.username ILIKE '%' || $1 || '%' OR u.about ILIKE '%' || $1 || '%')
    ORDER BY (COALESCE(followers.count, 0) + COALESCE(posts.count, 0)) DESC, u.username ASC
    LIMIT $3
  `, [query, currentUser || "", clampLimit(limit, 20, 50)]);

  return result.rows.map(row => ({
    username: row.username,
    pfp: row.pfp_url || null,
    about: row.about || "No bio yet.",
    followers: Number(row.followers || 0),
    following: Number(row.following || 0),
    postCount: Number(row.post_count || 0),
    isPremium: row.is_premium === true
  }));
}

async function userExists(username) {
  const result = await db.query("SELECT 1 FROM app_users WHERE username = $1 LIMIT 1", [username]);
  return result.rowCount > 0;
}

async function markDirectConversationRead({ currentUser, otherUser }) {
  await db.query(`
    UPDATE direct_messages
    SET status = 'read'
    WHERE receiver_username = $1
      AND sender_username = $2
      AND status <> 'read'
  `, [currentUser, otherUser]);
}

async function listDirectHistory({ currentUser, otherUser, limit = 50, cursor = null } = {}) {
  const pageLimit = clampLimit(limit, 50, 200);
  const decodedCursor = decodeCursor(cursor);
  const params = [currentUser, otherUser, pageLimit + 1];
  let cursorWhere = "";

  if (decodedCursor) {
    params.push(decodedCursor.createdAt, decodedCursor.id);
    cursorWhere = "AND (dm.created_at, dm.id) < ($4::timestamptz, $5::bigint)";
  }

  const result = await db.query(`
    SELECT dm.*, sender.pfp_url AS sender_pfp_url
    FROM direct_messages dm
    LEFT JOIN app_users sender ON sender.username = dm.sender_username
    WHERE (
      sender_username = $1 AND receiver_username = $2
    ) OR (
      sender_username = $2 AND receiver_username = $1
    )
    ${cursorWhere}
    ORDER BY dm.created_at DESC, dm.id DESC
    LIMIT $3
  `, params);

  const rows = result.rows.slice(0, pageLimit);
  return {
    items: rows.reverse().map(mapDirectMessage),
    pagination: {
      limit: pageLimit,
      hasMore: result.rows.length > pageLimit,
      nextCursor: result.rows.length > pageLimit ? encodeCursor(rows[rows.length - 1]) : null
    }
  };
}

async function getDirectSummary({ currentUser }) {
  const result = await db.query(`
    WITH user_directs AS (
      SELECT *,
        CASE
          WHEN sender_username = $1 THEN receiver_username
          ELSE sender_username
        END AS other_username
      FROM direct_messages
      WHERE sender_username = $1 OR receiver_username = $1
    ),
    conversations AS (
      SELECT
        other_username,
        MAX(created_at) AS latest_created_at,
        COUNT(*) FILTER (
          WHERE receiver_username = $1
            AND sender_username = other_username
            AND status <> 'read'
        ) AS unread_count
      FROM user_directs
      GROUP BY other_username
    )
    SELECT
      COUNT(*)::int AS conversations,
      COUNT(*) FILTER (WHERE unread_count > 0)::int AS unread_conversations,
      COALESCE(SUM(unread_count), 0)::int AS unread_messages,
      EXTRACT(EPOCH FROM MAX(latest_created_at)) * 1000 AS latest_conversation_at
    FROM conversations
  `, [currentUser]);

  const row = result.rows[0] || {};
  return {
    conversations: Number(row.conversations || 0),
    unreadConversations: Number(row.unread_conversations || 0),
    unreadMessages: Number(row.unread_messages || 0),
    latestConversationAt: Number(row.latest_conversation_at || 0),
    generatedAt: Date.now()
  };
}

async function searchDirectHistory({ currentUser, otherUser, query, limit = 30 }) {
  const pageLimit = clampLimit(limit, 30, 100);
  const result = await db.query(`
    SELECT dm.*, sender.pfp_url AS sender_pfp_url
    FROM direct_messages dm
    LEFT JOIN app_users sender ON sender.username = dm.sender_username
    WHERE (
      (sender_username = $1 AND receiver_username = $2)
      OR (sender_username = $2 AND receiver_username = $1)
    )
      AND (
        body ILIKE '%' || $3 || '%'
        OR COALESCE(media_name, '') ILIKE '%' || $3 || '%'
      )
    ORDER BY dm.created_at DESC, dm.id DESC
    LIMIT $4
  `, [currentUser, otherUser, query, pageLimit]);

  return result.rows.reverse().map(mapDirectMessage);
}

async function editDirectMessage({ currentUser, messageId, body }) {
  const result = await db.query(`
    UPDATE direct_messages
    SET
      body = $3,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('edited', true, 'editedAt', $4::bigint)
    WHERE (legacy_id = $1 OR id::text = $1)
      AND sender_username = $2
    RETURNING *
  `, [String(messageId), currentUser, body, Date.now()]);

  return result.rows[0] ? mapDirectMessage(result.rows[0]) : null;
}

async function createPost({ id, authorUsername, body, mediaUrl = null, isVideo = false, pfpUrl = null, metadata = {} }) {
  return db.transaction(async client => {
    const result = await client.query(`
      INSERT INTO posts (id, author_username, body, media_url, is_video, pfp_url, views, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7::jsonb, now())
      RETURNING *
    `, [id, authorUsername, body, mediaUrl, isVideo, pfpUrl, JSON.stringify(metadata)]);

    if (mediaUrl) {
      await client.query(`
        INSERT INTO media_assets (owner_username, storage_key, public_url, media_kind, metadata)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (public_url) DO NOTHING
      `, [
        authorUsername,
        String(mediaUrl).replace(/^\//, ""),
        mediaUrl,
        isVideo ? "video" : "image",
        JSON.stringify({ source: "post" })
      ]);
    }

    return result.rows[0];
  });
}

module.exports = {
  createPost,
  decodeCursor,
  encodeCursor,
  listMessages,
  listDiscoveryCandidates,
  listDirectHistory,
  getDirectSummary,
  searchDirectHistory,
  editDirectMessage,
  listFollowingFeed,
  listHomeFeed,
  listFollowing,
  markDirectConversationRead,
  mapPost,
  searchPosts,
  searchUsers,
  userExists
};
