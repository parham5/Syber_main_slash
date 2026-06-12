let pool = null;

function postgresRequested() {
  return (process.env.DATA_BACKEND || "json").toLowerCase() === "postgres";
}

function loadPg() {
  try {
    return require("pg");
  } catch (error) {
    const hint = "PostgreSQL mode needs the pg package. Run npm install pg before setting DATA_BACKEND=postgres.";
    const wrapped = new Error(hint);
    wrapped.cause = error;
    throw wrapped;
  }
}

function getPool() {
  if (!postgresRequested()) return null;
  if (pool) return pool;

  const { Pool } = loadPg();
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number.parseInt(process.env.DB_POOL_MAX || "10", 10),
    idleTimeoutMillis: Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS || "30000", 10),
    connectionTimeoutMillis: Number.parseInt(process.env.DB_CONNECT_TIMEOUT_MS || "5000", 10)
  });

  return pool;
}

async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) throw new Error("PostgreSQL is not enabled. Set DATA_BACKEND=postgres and DATABASE_URL.");
  return activePool.query(text, params);
}

async function transaction(callback) {
  const activePool = getPool();
  if (!activePool) throw new Error("PostgreSQL is not enabled. Set DATA_BACKEND=postgres and DATABASE_URL.");

  const client = await activePool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function checkConnection() {
  if (!postgresRequested()) {
    return { enabled: false, ok: true, backend: "json" };
  }

  try {
    const result = await query("SELECT now() AS now");
    return { enabled: true, ok: true, backend: "postgres", now: result.rows[0].now };
  } catch (error) {
    return { enabled: true, ok: false, backend: "postgres", error: error.message };
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  checkConnection,
  closePool,
  getPool,
  postgresRequested,
  query,
  transaction
};
