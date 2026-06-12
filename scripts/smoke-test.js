const { spawn } = require("child_process");

const PORT = process.env.SMOKE_PORT || "3999";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = 15000;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      await wait(400);
    }
  }
  throw new Error("Server did not become healthy in time.");
}

async function assertJson(path, expectedStatus = 200) {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`);
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}. Body: ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${path} did not return JSON. Body: ${body}`);
  }
}

async function assertText(path, expectedStatus = 200) {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`);
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}. Body: ${body.slice(0, 200)}`);
  }
  return body;
}

async function run() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT,
      HOST: "127.0.0.1",
      LOG_REQUESTS: "false",
      DATA_BACKEND: "json"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk.toString(); });
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });

  try {
    await waitForServer();

    const health = await assertJson("/api/health");
    if (health.ok !== true || health.service !== "cyberslash") {
      throw new Error(`/api/health returned unexpected payload: ${JSON.stringify(health)}`);
    }

    const ready = await assertJson("/api/ready");
    if (ready.ok !== true) {
      throw new Error(`/api/ready returned unexpected payload: ${JSON.stringify(ready)}`);
    }

    const dbStatus = await assertJson("/api/db/status");
    if (dbStatus.ok !== true || dbStatus.backend !== "json") {
      throw new Error(`/api/db/status returned unexpected payload: ${JSON.stringify(dbStatus)}`);
    }

    const discovery = await assertJson("/api/feed/discovery");
    if (!Array.isArray(discovery.feed)) {
      throw new Error(`/api/feed/discovery returned unexpected payload: ${JSON.stringify(discovery)}`);
    }

    const profile = await assertJson("/api/profile/%2Fadmin_1");
    if (!profile.user || !profile.stats || !profile.tabs || !Array.isArray(profile.tabs.posts)) {
      throw new Error(`/api/profile returned unexpected payload: ${JSON.stringify(profile)}`);
    }

    await assertJson("/api/notifications/summary", 401);

    await assertJson("/api/unknown-smoke-route", 404);
    const offline = await assertText("/offline.html");
    if (!offline.toLowerCase().includes("offline")) {
      throw new Error("/offline.html did not look like the offline page.");
    }

    console.log("[OK] Smoke test passed.");
  } finally {
    child.kill("SIGTERM");
    await wait(500);
    if (!child.killed) child.kill("SIGKILL");
  }

  if (stderr.trim()) {
    console.warn("[WARN] Server stderr during smoke test:");
    console.warn(stderr.trim());
  }
  if (process.env.SMOKE_VERBOSE === "true" && stdout.trim()) {
    console.log(stdout.trim());
  }
}

run().catch(error => {
  console.error("[FAIL] Smoke test failed.");
  console.error(error.message);
  process.exit(1);
});
