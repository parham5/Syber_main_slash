let profileState = null;

async function getCsrfToken() {
  try {
    const res = await fetch("/csrf-token", { credentials: "include" });
    const data = await res.json();
    return data.csrfToken || "";
  } catch {
    return "";
  }
}

async function apiFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (options.method && options.method !== "GET") {
    headers["X-CSRF-Token"] = await getCsrfToken();
  }

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers
  });

  if (res.status === 401) {
    window.location.href = "/index.html";
    return null;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCount(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return String(number);
}

function normalizeMediaUrl(post) {
  return post.imageUrl || post.image || null;
}

function mediaHtml(post) {
  const url = normalizeMediaUrl(post);
  if (!url) return "";
  const safeUrl = escapeAttribute(url);
  if (post.isVideo || /\.(mp4|webm|ogg|mov)$/i.test(url)) {
    return `<div class="post-image-container"><video src="${safeUrl}" controls preload="metadata"></video></div>`;
  }
  return `<div class="post-image-container"><img src="${safeUrl}" alt="${escapeAttribute(post.mediaAlt || "Post media")}"></div>`;
}

function quotedPostHtml(post) {
  if (!post.quotedPost) return "";
  const quoted = post.quotedPost;
  const media = quoted.imageUrl ? `<div class="quoted-media">${quoted.isVideo ? "Video" : "Media"}</div>` : "";
  return `
    <div class="quoted-post-card">
      <div class="quoted-author">${escapeHtml(quoted.username)}</div>
      <div class="quoted-text">${escapeHtml(quoted.message || "")}</div>
      ${media}
    </div>
  `;
}

function renderPostCard(post, tab) {
  const avatar = post.pfp || "./favicon.ico";
  const author = post.username || profileState?.user?.username || "";
  const likes = Array.isArray(post.likes) ? post.likes.length : Number(post.likes || 0);
  const saves = Array.isArray(post.saves) ? post.saves.length : Number(post.saves || 0);
  const retweets = Array.isArray(post.retweets) ? post.retweets.length : Number(post.retweets || 0);
  const replies = Number(post.replyCount || 0);
  const pinned = post.isPinned ? `<div class="profile-post-badge">Pinned</div>` : "";
  const replyBadge = post.parentId ? `<div class="profile-post-badge secondary">Reply</div>` : "";
  const originBadge = tab === "likes" ? `<div class="profile-post-badge secondary">Liked</div>` : "";
  const savedBadge = tab === "saved" ? `<div class="profile-post-badge secondary">Saved</div>` : "";
  const highlightBadge = tab === "highlights" ? `<div class="profile-post-badge spotlight">Highlight</div>` : "";

  return `
    <article class="result-card post-card" data-post-id="${escapeAttribute(post.id)}">
      <div class="profile-card-badges">${pinned}${replyBadge}${originBadge}${savedBadge}${highlightBadge}</div>
      <div class="post-header">
        <img src="${escapeAttribute(avatar)}" alt="" class="post-avatar">
        <div>
          <div class="post-author">${escapeHtml(author.replace("/", ""))}</div>
          <div class="post-time">${escapeHtml(formatTime(post.timestamp))}</div>
        </div>
      </div>
      ${mediaHtml(post)}
      <div class="post-content">${escapeHtml(post.message || "")}</div>
      ${post.mediaCaption ? `<div class="profile-media-caption">${escapeHtml(post.mediaCaption)}</div>` : ""}
      ${quotedPostHtml(post)}
      <div class="post-footer">
        <div class="stat-item" title="Likes">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
          ${likes}
        </div>
        <div class="stat-item" title="Replies">
          <svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4H8c-2.76 0-5-2.24-5-5V7h2v3c0 1.66 1.34 3 3 3h6z"></path></svg>
          ${replies}
        </div>
        <div class="stat-item" title="Re-Slashes">
          <svg viewBox="0 0 24 24"><path d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7V7zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11v2z"></path></svg>
          ${retweets}
        </div>
        <div class="stat-item" title="Saves">
          <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"></path></svg>
          ${saves}
        </div>
      </div>
    </article>
  `;
}

function renderEmpty(tab) {
  const labels = {
    posts: "No posts yet.",
    replies: "No replies yet.",
    media: "No media posts yet.",
    highlights: "No standout posts yet.",
    likes: "No liked posts to show.",
    saved: "No saved posts yet."
  };
  return `<div class="profile-empty-state">${labels[tab] || "Nothing here yet."}</div>`;
}

function renderTab(tab) {
  const grid = document.querySelector(".results-grid");
  const items = profileState?.tabs?.[tab] || [];
  grid.innerHTML = items.length ? items.map(post => renderPostCard(post, tab)).join("") : renderEmpty(tab);
}

function renderActivityOverview(activity = {}) {
  const container = document.getElementById("profileActivityOverview");
  if (!container) return;
  const tags = activity.topTags || [];
  container.innerHTML = `
    <div class="activity-metric">
      <strong>${formatCount(activity.totalViews)}</strong>
      <span>Views</span>
    </div>
    <div class="activity-metric">
      <strong>${formatCount(activity.totalLikes)}</strong>
      <span>Likes</span>
    </div>
    <div class="activity-metric">
      <strong>${formatCount(activity.totalReplies)}</strong>
      <span>Replies</span>
    </div>
    <div class="activity-metric">
      <strong>${formatCount(activity.totalMedia)}</strong>
      <span>Media</span>
    </div>
    <div class="activity-tags">
      ${tags.length ? tags.map(item => `<span>#${escapeHtml(item.tag)}</span>`).join("") : "<span>No tags yet</span>"}
    </div>
    <div class="activity-timeline">
      <span>Joined ${escapeHtml(formatDate(activity.joinedAt))}</span>
      <span>${activity.lastPostAt ? `Last active ${escapeHtml(formatTime(activity.lastPostAt))}` : "No posts yet"}</span>
    </div>
  `;
}

function renderPinnedSection(post) {
  const container = document.getElementById("profilePinnedSection");
  if (!container) return;
  if (!post) {
    container.innerHTML = `
      <div class="profile-section-kicker">Pinned</div>
      <div class="profile-feature-empty">No pinned post yet.</div>
    `;
    return;
  }
  container.innerHTML = `
    <div class="profile-section-kicker">Pinned</div>
    <div class="pinned-hero">
      <div class="pinned-copy">
        <strong>${escapeHtml((post.message || "Pinned post").slice(0, 140))}${(post.message || "").length > 140 ? "..." : ""}</strong>
        <span>${formatCount(post.likes?.length || 0)} likes · ${formatCount(post.replyCount || 0)} replies · ${formatTime(post.timestamp)}</span>
      </div>
      ${normalizeMediaUrl(post) ? `<div class="pinned-media">${mediaHtml(post)}</div>` : ""}
    </div>
  `;
}

function renderHighlightsSection(highlights = []) {
  const container = document.getElementById("profileHighlightsSection");
  if (!container) return;
  container.innerHTML = `
    <div class="profile-section-heading">
      <div>
        <div class="profile-section-kicker">Highlights</div>
        <h2>Best profile moments</h2>
      </div>
      <span>${highlights.length} featured</span>
    </div>
    <div class="highlight-strip">
      ${highlights.length ? highlights.map(post => `
        <button class="highlight-card" type="button" data-post-id="${escapeAttribute(post.id)}">
          ${normalizeMediaUrl(post) ? `<div class="highlight-media">${mediaHtml(post)}</div>` : ""}
          <strong>${escapeHtml((post.message || "Post highlight").slice(0, 90))}${(post.message || "").length > 90 ? "..." : ""}</strong>
          <span>${formatCount(post.likes?.length || 0)} likes · ${formatCount(post.views || 0)} views</span>
        </button>
      `).join("") : `<div class="profile-feature-empty">Highlights appear after posts get engagement or media.</div>`}
    </div>
  `;
}

function renderConnectionsPreview(featured = {}) {
  const followers = featured.followersPreview || [];
  const following = featured.followingPreview || [];
  const modalBio = document.getElementById("modalBioFull");
  if (!modalBio) return;
  document.querySelectorAll(".profile-connection-preview").forEach(node => node.remove());
  const preview = [...followers.slice(0, 3), ...following.slice(0, 3)]
    .filter((item, index, list) => list.findIndex(other => other.username === item.username) === index);
  const markup = preview.length
    ? `<div class="profile-connection-preview">${preview.map(item => `
        <a href="./pf.html?user=${encodeURIComponent(item.username)}" title="${escapeAttribute(item.username)}">
          <img src="${escapeAttribute(item.pfp || "./favicon.ico")}" alt="">
        </a>
      `).join("")}</div>`
    : "";
  modalBio.insertAdjacentHTML("afterend", markup);
}

function setActiveTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  renderTab(tab);
}

function renderConnectionRows(connections = []) {
  if (!connections.length) {
    return `<div class="profile-empty-state">No connections to show yet.</div>`;
  }
  return connections.map(item => `
    <a class="connection-row" href="./pf.html?user=${encodeURIComponent(item.username)}">
      <img src="${escapeAttribute(item.pfp || "./favicon.ico")}" alt="">
      <div class="connection-copy">
        <strong>${escapeHtml(item.username.replace("/", ""))}${item.isPremium ? `<span class="premium-dot">Premium</span>` : ""}</strong>
        <span>${escapeHtml(item.about || "No bio yet.")}</span>
      </div>
      <div class="connection-meta">${formatCount(item.followers)} followers</div>
    </a>
  `).join("");
}

async function openConnectionsModal(type) {
  if (!profileState?.user?.username) return;
  const modal = document.getElementById("connectionsModal");
  const title = document.getElementById("connectionsModalTitle");
  const list = document.getElementById("connectionsList");
  if (!modal || !title || !list) return;

  title.textContent = type === "following" ? "Following" : "Followers";
  list.innerHTML = `<div class="profile-empty-state">Loading...</div>`;
  modal.classList.add("active");

  try {
    const data = await apiFetch(`/api/profile/${encodeURIComponent(profileState.user.username)}/connections?type=${type}`);
    list.innerHTML = renderConnectionRows(data.connections || []);
  } catch (error) {
    console.error(error);
    list.innerHTML = `<div class="profile-empty-state">Failed to load connections.</div>`;
  }
}

function updateStats(stats) {
  const set = (name, value) => {
    const el = document.querySelector(`[data-stat="${name}"]`);
    if (el) el.textContent = formatCount(value ?? 0);
  };

  set("followers", stats.followers);
  set("posts", stats.posts);
  set("following", stats.following);
}

function updateActionButtons(user) {
  const container = document.getElementById("actionButtonsContainer");
  container.innerHTML = "";

  if (!user.isOwnProfile) {
    const followBtn = document.createElement("button");
    followBtn.className = "btn btn-primary";
    followBtn.textContent = user.isFollowing ? "Following" : "Follow";
    followBtn.addEventListener("click", async () => {
      const action = user.isFollowing ? "unfollow" : "follow";
      await apiFetch(`/api/${action}/${encodeURIComponent(user.username)}`, { method: "POST" });
      user.isFollowing = !user.isFollowing;
      profileState.stats.followers += user.isFollowing ? 1 : -1;
      updateStats(profileState.stats);
      updateActionButtons(user);
    });
    container.appendChild(followBtn);

    const messageBtn = document.createElement("button");
    messageBtn.className = "btn btn-secondary";
    messageBtn.textContent = "Message";
    messageBtn.addEventListener("click", () => {
      window.location.href = `./directs.html?user=${encodeURIComponent(user.username)}`;
    });
    container.appendChild(messageBtn);
  }

  const infoBtn = document.createElement("button");
  infoBtn.className = "btn btn-secondary";
  infoBtn.textContent = "Info";
  infoBtn.addEventListener("click", () => document.getElementById("infoModal").classList.add("active"));
  container.appendChild(infoBtn);
}

function updateProfileHeader(session, data) {
  const user = data.user;
  const bannerImg = document.querySelector(".banner-img");
  const avatar = document.querySelector(".avatar-img");
  const title = document.querySelector(".display-name");
  const handle = document.querySelector(".handle");
  const bio = document.getElementById("profileBio");

  document.title = `Cybers/ash - ${user.username}`;
  bannerImg.src = user.banner || "./title.png";
  bannerImg.style.display = "block";
  avatar.src = user.pfp || "./favicon.ico";
  title.textContent = user.username.replace("/", "");
  handle.textContent = user.username;
  bio.textContent = user.about || "No bio yet.";

  const ownPfp = session.pfp || "./favicon.ico";
  const desktopSettings = document.getElementById("accountPfp");
  const mobileSettings = document.getElementById("mobileaccountPfp");
  if (desktopSettings) desktopSettings.src = ownPfp;
  if (mobileSettings) mobileSettings.src = ownPfp;

  document.getElementById("modalUserName").textContent = user.username.replace("/", "");
  document.getElementById("modalJoinedDate").textContent = formatDate(user.joinedAt);
  document.getElementById("modalBioFull").textContent = user.about || "This user has not written a bio yet.";
  updateStats(data.stats);
  updateActionButtons(user);
  renderActivityOverview(data.activity);
  renderPinnedSection(data.featured?.pinnedPost);
  renderHighlightsSection(data.featured?.highlights || []);
  profileState.tabs.highlights = data.featured?.highlights || [];
  renderConnectionsPreview(data.featured || {});

  const savedTab = document.querySelector('[data-tab="saved"]');
  if (savedTab) savedTab.hidden = !user.isOwnProfile;
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach(button => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  const close = document.getElementById("closeModal");
  if (close) close.addEventListener("click", () => document.getElementById("infoModal").classList.remove("active"));
  const modal = document.getElementById("infoModal");
  if (modal) {
    modal.addEventListener("click", event => {
      if (event.target === modal) modal.classList.remove("active");
    });
  }

  document.querySelectorAll("[data-connection]").forEach(button => {
    button.addEventListener("click", () => openConnectionsModal(button.dataset.connection));
  });

  const closeConnections = document.getElementById("closeConnectionsModal");
  if (closeConnections) {
    closeConnections.addEventListener("click", () => document.getElementById("connectionsModal").classList.remove("active"));
  }
  const connectionsModal = document.getElementById("connectionsModal");
  if (connectionsModal) {
    connectionsModal.addEventListener("click", event => {
      if (event.target === connectionsModal) connectionsModal.classList.remove("active");
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  bindTabs();

  try {
    const session = await apiFetch("/session");
    if (!session) return;

    const params = new URLSearchParams(window.location.search);
    const targetUsername = params.get("user") || session.username;
    profileState = await apiFetch(`/api/profile/${encodeURIComponent(targetUsername)}`);
    updateProfileHeader(session, profileState);
    setActiveTab("posts");
  } catch (error) {
    console.error(error);
    const grid = document.querySelector(".results-grid");
    if (grid) grid.innerHTML = `<div class="profile-empty-state">Failed to load profile.</div>`;
  }
});
