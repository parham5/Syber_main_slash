# Cybers/ash Database & Scale Plan

Stage 8 prepares the project to leave JSON-file storage without breaking the current MVP runtime.

## Target database

Use PostgreSQL first. It fits this app well because we need:

- Transactions for posts, follows, DMs, support tickets, and billing/premium changes.
- Strong indexes for feed pagination, user timelines, DMs, notifications, and full-text search.
- JSONB escape hatches for legacy fields while the product is still moving fast.
- Backups with `pg_dump`, point-in-time recovery later, and straightforward hosting options.

MongoDB could work for early social data, but this project already has many relational edges: users follow users, posts quote posts, posts have interactions, DMs connect two users, groups have members. PostgreSQL keeps those relationships safer.

## Migration flow

1. Create a database.
2. Run `db/postgres/schema.sql`.
3. Run `node scripts/export-json-to-postgres.js`.
4. Import the generated `db/generated/seed.sql`.
5. Compare counts against the summary printed by the script.
6. Install the PostgreSQL client package with `npm install pg`.
7. Set `DATA_BACKEND=postgres` and `DATABASE_URL=postgres://...`.
8. Check `/api/db/status` and `/api/ready`.

Example local commands:

```powershell
createdb cyberslash_dev
psql cyberslash_dev -f db/postgres/schema.sql
node scripts/export-json-to-postgres.js
psql cyberslash_dev -f db/generated/seed.sql
npm install pg
```

## Runtime migration strategy

Do not flip the whole app at once.

1. Keep JSON as source of truth.
2. Use `lib/db.js` for PostgreSQL connections and transaction boundaries.
3. Use `lib/postgres-store.js` as the first query module for feed, search, DMs, and post writes.
4. Add dual-write for low-risk writes such as notifications or views.
5. Move read-heavy endpoints first: search, discovery feed, user profile posts.
6. Move sensitive writes with transactions: signup, password change, post create/delete, DM send.
7. Freeze JSON writes after confidence, then archive the JSON files.

Runtime flags:

```env
DATA_BACKEND=json
DATABASE_URL=postgres://postgres:postgres@localhost:5432/cyberslash_dev
DB_POOL_MAX=10
```

Set `DATA_BACKEND=postgres` only after the schema and seed import are complete. If `pg` is not installed, the app stays safe in JSON mode and reports a clear setup error only when PostgreSQL mode is requested.

## PostgreSQL-enabled endpoints

These endpoints now switch to PostgreSQL when `DATA_BACKEND=postgres` is set:

- `GET /api/messages`
- `GET /api/search`
- `GET /api/feed/discovery`
- `GET /api/feed/following`
- `GET /api/directs/history/:otherUser`

The JSON runtime still supports offset pagination for compatibility. PostgreSQL mode uses cursor headers:

- `X-Page-Limit`
- `X-Has-More`
- `X-Next-Cursor`

Pass the next cursor back with `?cursor=...`.

## Transactions that matter

Use database transactions for:

- Signup: user row, privacy defaults, screen-time defaults.
- Post create: post row, media asset row, hashtag extraction, notification fan-out.
- Retweet/quote: interaction/or post row plus counters/notifications.
- DM send: message row, media asset row, unread state.
- CyberBite upload: media asset, cyberbite row, upload quota increment.
- Account delete: user data, posts, DMs, media ownership updates.

## Index priorities

The schema includes first-pass indexes for:

- Home feed: `posts(created_at DESC, id DESC) WHERE parent_id IS NULL`
- User timeline: `posts(author_username, created_at DESC)`
- Replies: `posts(parent_id, created_at ASC)`
- Search: GIN `search_vector` and trigram body index
- DMs: normalized sender/receiver pair plus `created_at DESC`
- Notifications: recipient/read state plus `created_at DESC`
- CyberBites: created order, author order, full-text search

## Pagination

The current JSON runtime now accepts `limit` and `offset` on key endpoints. PostgreSQL should eventually switch to cursor pagination for feeds:

```sql
WHERE (created_at, id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT $limit
```

Offset is fine for compatibility and admin pages. Cursor pagination is better for feeds and DMs at scale.

## Backups

For local/dev:

```powershell
.\scripts\backup-postgres.ps1
```

For production:

- Nightly logical dumps with 14 to 30 day retention.
- WAL/PITR if hosted PostgreSQL supports it.
- Separate media backup for uploaded files.
- Test restore monthly, not just backup creation.

## File storage separation

Keep database rows for metadata only. Uploaded files should live outside the database:

- Local dev: `storage/uploads`, `storage/pfps`, `storage/banners`, `storage/cyberbites`
- Production: S3-compatible bucket, Cloudflare R2, Backblaze B2, or MinIO

Store these in `media_assets`:

- owner
- public URL
- storage key
- media kind
- MIME type
- size
- duration/dimensions when known

The database should never store raw video/image bytes.
