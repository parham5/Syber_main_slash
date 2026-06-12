# Architecture Notes

This project is still an MVP, but new work should follow a few simple boundaries so the codebase can grow without turning every change into a `server.js` edit.

## Current Runtime

- `server.js` is the main Express application.
- `storage/*.json` is still the default source of truth.
- `lib/db.js` and `lib/postgres-store.js` prepare the PostgreSQL path.
- Browser pages are plain HTML/CSS/JS files.
- Shared app behavior lives in `app-enhancements.js` and shared styling lives in `ui-refactor.css`.

## New Backend Code

Prefer this shape for new backend work:

- Request parsing and response helpers: `lib/api-utils.js`
- Database connection and transactions: `lib/db.js`
- PostgreSQL query modules: `lib/*-store.js`
- Feed ranking and discovery scoring: `lib/feed-ranking.js`
- One-off maintenance scripts: `scripts/`
- Database schema and migration docs: `db/postgres/`

Avoid adding large new feature blocks directly into `server.js` unless the feature is tiny. When a feature needs more than a few routes, make a small helper module first.

## API Rules

- Every API error should include a clear `error` string.
- New async endpoints should use `api.asyncHandler(...)`.
- New protected endpoints should use a shared auth guard instead of repeating session checks.
- New list endpoints should support pagination from the first version.
- New writes that touch multiple records should use a transaction when PostgreSQL is enabled.
- New feed behavior should be added to `lib/feed-ranking.js` first, then called from routes.

## Frontend Rules

- Reuse `ui-refactor.css` for shared visual language.
- Keep page-specific JS in the page script, but move repeated utilities into shared files when they appear twice.
- Avoid adding new inline scripts to HTML unless it is a very small bootstrap.
- Keep empty, loading, and error states explicit for every new user-facing flow.

## Verification

Run these before considering a stage complete:

```powershell
npm run check
npm run check:db
npm run check:feed
npm run check:smoke
```

For database migration work:

```powershell
npm run db:export
```
