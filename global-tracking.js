// Shared CSRF protection for same-origin unsafe requests.
(function installCsrfFetchGuard() {
    if (window.__csrfFetchGuardInstalled) return;
    window.__csrfFetchGuardInstalled = true;

    const originalFetch = window.fetch.bind(window);
    let csrfToken = "";
    let csrfPromise = null;

    function getUrl(input) {
        if (typeof input === "string") return new URL(input, window.location.origin);
        if (input && input.url) return new URL(input.url, window.location.origin);
        return new URL("/", window.location.origin);
    }

    function getMethod(input, init) {
        return ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    }

    function getCsrfToken() {
        if (csrfToken) return Promise.resolve(csrfToken);
        if (!csrfPromise) {
            csrfPromise = originalFetch("/csrf-token", { credentials: "include" })
                .then(res => res.json())
                .then(data => {
                    csrfToken = data.csrfToken || "";
                    return csrfToken;
                })
                .catch(err => {
                    csrfPromise = null;
                    throw err;
                });
        }
        return csrfPromise;
    }

    window.fetch = async function csrfFetch(input, init = {}) {
        const url = getUrl(input);
        const method = getMethod(input, init);
        const isUnsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
        const isSameOrigin = url.origin === window.location.origin;

        if (!isUnsafe || !isSameOrigin || url.pathname === "/csrf-token") {
            return originalFetch(input, init);
        }

        const headers = new Headers(init.headers || (input && input.headers) || {});
        if (!headers.has("X-CSRF-Token")) {
            headers.set("X-CSRF-Token", await getCsrfToken());
        }

        return originalFetch(input, {
            ...init,
            method,
            credentials: init.credentials || "include",
            headers
        });
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    fetch('/session', { credentials: 'include' })
        .then(res => res.json())
        .then(session => {
            if (session.username) {
                startGlobalTracking(session.username);
            }
        })
        .catch(err => {
            console.log('Not logged in, skipping global tracking');
        });
});

function startGlobalTracking(username) {
    let startTime = Date.now();
    let accumulatedTime = 0;
    let saveInterval;

    // 1. Load existing today's minutes from server to continue from where we left off
    fetch('/api/screen-time', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            const today = new Date().toISOString().split('T')[0];
            const todayData = data.history[today];
            if (todayData) {
                accumulatedTime = todayData.minutes * 60 * 1000; // Convert to ms
            }
            
            // Start periodic saving every 30 seconds
            saveInterval = setInterval(() => {
                const now = Date.now();
                const sessionDuration = now - startTime;
                const totalMs = accumulatedTime + sessionDuration;
                const totalMinutes = Math.floor(totalMs / (1000 * 60));

                saveToServer(username, totalMinutes);
            }, 30000); // Save every 30 seconds

            // 2. Handle Page Visibility (Pause when tab is hidden)
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    // Tab hidden: Calculate time spent so far in this session
                    const now = Date.now();
                    accumulatedTime += (now - startTime);
                    startTime = now; // Reset start time
                } else {
                    // Tab visible: Reset start time to now
                    startTime = Date.now();
                }
            });

            // 3. Handle Page Unload (Save final session time)
            window.addEventListener('beforeunload', () => {
                const now = Date.now();
                accumulatedTime += (now - startTime);
                const totalMinutes = Math.floor(accumulatedTime / (1000 * 60));
                saveToServer(username, totalMinutes);
                clearInterval(saveInterval);
            });
        })
        .catch(err => {
            console.error('Failed to init tracking:', err);
        });
}

function saveToServer(username, totalMinutes) {
    fetch('/api/screen-time/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            todayMinutes: totalMinutes
            // Note: We do NOT send limitEnabled/Hours here, only the usage data
        })
    }).catch(err => console.error('Failed to save tracking data:', err));
}
