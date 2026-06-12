(function () {
  const APP_NAME = "Cybers/ash";
  const THEME_COLOR = "#38d5e8";
  const THEME_CLASSES = [
    "theme-default",
    "theme-discord",
    "theme-amethyst",
    "theme-aurora",
    "theme-sunset",
    "theme-forest",
    "theme-ocean",
    "theme-midnight",
    "theme-fire"
  ];
  const THEME_TOKENS = {
    "theme-default": ["#000000", "#111111", "#1a1a1a", "#333333", "#ffffff", "#888888", "#1d9bf0"],
    "theme-discord": ["#36393f", "#2f3136", "#202225", "#40444b", "#dcddde", "#b9bbbe", "#7289da"],
    "theme-amethyst": ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560", "#a8a8a8", "#e94560"],
    "theme-aurora": ["#0a192f", "#112240", "#233554", "#64ffda", "#ccd6f6", "#8892b0", "#64ffda"],
    "theme-sunset": ["#1a1a1a", "#2d1b1b", "#4a2c2c", "#ff6b6b", "#ffd93d", "#ff8e53", "#ff6b6b"],
    "theme-forest": ["#0d2018", "#1b4332", "#2d6a4f", "#40916c", "#d8f3dc", "#95d5b2", "#52b788"],
    "theme-ocean": ["#0f1c3f", "#1e3a5f", "#2e5c8a", "#00b4d8", "#caf0f8", "#90e0ef", "#00b4d8"],
    "theme-midnight": ["#0f0c29", "#302b63", "#24243e", "#7c3aed", "#e0e7ff", "#a5b4fc", "#8b5cf6"],
    "theme-fire": ["#1a0a0a", "#3d1f1f", "#5c2e2e", "#ff4500", "#fff5e6", "#ffb347", "#ff6347"]
  };
  const GRADIENTS = {
    gradient1: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    gradient2: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    gradient3: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
    gradient4: "linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)",
    gradient5: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)",
    gradient6: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)",
    gradient7: "linear-gradient(135deg, #0f0c29 0%, #302b63 100%)"
  };

  function ensureMeta(name, content) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", name);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
  }

  function ensureLink(rel, href, attrs = {}) {
    let link = document.querySelector(`link[rel="${rel}"][href="${href}"]`);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", rel);
      link.setAttribute("href", href);
      Object.entries(attrs).forEach(([key, value]) => link.setAttribute(key, value));
      document.head.appendChild(link);
    }
  }

  function installMetadata() {
    ensureMeta("application-name", APP_NAME);
    ensureMeta("apple-mobile-web-app-title", APP_NAME);
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("mobile-web-app-capable", "yes");
    ensureMeta("theme-color", THEME_COLOR);
    ensureMeta("description", "A focused social space for slashes, private messages, creator clips, and Nova.");
    ensureLink("manifest", "/app.webmanifest");
    ensureLink("apple-touch-icon", "/title.png");
  }

  function setTokens(target, tokens) {
    if (!target || !tokens) return;
    const [bg, panel, raised, border, text, muted, accent] = tokens;
    const props = {
      "--theme-bg-primary": bg,
      "--theme-bg-secondary": panel,
      "--theme-bg-tertiary": raised,
      "--theme-border": border,
      "--theme-text-primary": text,
      "--theme-text-secondary": muted,
      "--theme-accent": accent,
      "--theme-accent-hover": accent,
      "--ui-bg": bg,
      "--ui-panel": panel,
      "--ui-panel-raised": raised,
      "--ui-line": border,
      "--ui-ink": text,
      "--ui-muted": muted,
      "--ui-cyan": accent,
      "--ui-glow": `${accent}33`
    };
    Object.entries(props).forEach(([key, value]) => target.style.setProperty(key, value));
  }

  function applySlashTheme(settings = {}) {
    const theme = THEME_CLASSES.includes(settings.theme) ? settings.theme : "theme-default";
    const tokens = THEME_TOKENS[theme] || THEME_TOKENS["theme-default"];
    const roots = [document.documentElement, document.body].filter(Boolean);

    roots.forEach(root => {
      root.classList.remove(...THEME_CLASSES);
      root.classList.add(theme);
      setTokens(root, tokens);
    });

    if (settings.backgroundImage) {
      let bg = settings.backgroundImage;
      if (GRADIENTS[bg]) bg = GRADIENTS[bg];
      if (typeof bg === "string" && bg.startsWith("storage/")) bg = `/${bg}`;
      const backgroundValue = bg.startsWith("linear-gradient") || bg.startsWith("url(") ? bg : `url('${bg}')`;
      roots.forEach(root => {
        root.style.backgroundImage = backgroundValue;
        root.style.backgroundSize = "cover";
        root.style.backgroundPosition = "center";
        root.style.backgroundRepeat = "no-repeat";
        root.style.backgroundAttachment = "fixed";
        root.classList.add("has-custom-bg");
      });
    } else {
      roots.forEach(root => {
        root.style.backgroundImage = "";
        root.classList.remove("has-custom-bg");
      });
    }

    try {
      localStorage.setItem("userTheme", theme);
      if (settings.backgroundImage) localStorage.setItem("userBackground", settings.backgroundImage);
      else localStorage.removeItem("userBackground");
    } catch (_) {}
  }

  function applyStoredTheme() {
    try {
      applySlashTheme({
        theme: localStorage.getItem("userTheme") || "theme-default",
        backgroundImage: localStorage.getItem("userBackground") || ""
      });
    } catch (_) {
      applySlashTheme({ theme: "theme-default" });
    }
  }

  async function syncUserTheme() {
    try {
      const sessionRes = await fetch("/session", { credentials: "include" });
      if (!sessionRes.ok) return;
      const session = await sessionRes.json();
      if (!session?.username) return;
      const userRes = await fetch(`/api/user-info/${encodeURIComponent(session.username)}`, { credentials: "include" });
      if (!userRes.ok) return;
      const user = await userRes.json();
      applySlashTheme({
        theme: user.theme || "theme-default",
        backgroundImage: user.backgroundImage || ""
      });
    } catch (_) {}
  }

  function installSkipLink() {
    if (document.querySelector(".app-skip-link")) return;
    const target = document.querySelector("main, .content-area, .container, .auth-card, .right-side, .chat-wrapper, .cyberbites-feed");
    if (!target) return;

    if (!target.id) target.id = "main-content";
    const link = document.createElement("a");
    link.className = "app-skip-link";
    link.href = `#${target.id}`;
    link.textContent = "Skip to content";
    document.body.insertBefore(link, document.body.firstChild);
  }

  function hardenExternalLinks() {
    document.querySelectorAll('a[target="_blank"]').forEach(link => {
      const rel = new Set((link.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
      rel.add("noopener");
      rel.add("noreferrer");
      link.setAttribute("rel", Array.from(rel).join(" "));
    });
  }

  function installNetworkStatus() {
    if (document.querySelector(".app-network-status")) return;
    const status = document.createElement("div");
    status.className = "app-network-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    document.body.appendChild(status);

    const show = message => {
      status.textContent = message;
      status.classList.add("show");
      window.clearTimeout(show.timer);
      show.timer = window.setTimeout(() => status.classList.remove("show"), 2600);
    };

    window.addEventListener("offline", () => show("Connection lost. Offline mode is ready."));
    window.addEventListener("online", () => show("Back online."));
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    navigator.serviceWorker.register("/slash-sw.js").catch(() => {});
  }

  function boot() {
    applyStoredTheme();
    installMetadata();
    installSkipLink();
    hardenExternalLinks();
    installNetworkStatus();
    registerServiceWorker();
    syncUserTheme();
  }

  window.applySlashTheme = applySlashTheme;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
