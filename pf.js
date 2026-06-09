    const API_BASE = ''; 
    
    // Helper to get CSRF token
    async function getCsrfToken() {
      try {
        const res = await fetch('/csrf-token');
        const data = await res.json();
        return data.csrfToken;
      } catch (e) { return ''; }
    }

    // Helper to handle fetch with auth
    async function apiFetch(url, options = {}) {
      try {
        const defaultHeaders = {
          'Content-Type': 'application/json',
          'X-CSRF-Token': await getCsrfToken()
        };
        const config = { ...options, credentials: 'include', headers: { ...defaultHeaders, ...options.headers } };
        const res = await fetch(url, config);
        if (res.status === 401) { window.location.href = '/index.html'; return null; }
        return await res.json();
      } catch (e) { console.error(e); return null; }
    }

    // Helper: Format Date for Modal
    function formatDate(timestamp) {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Helper: Create HTML for buttons
    function createFollowButton(username, isFollowing) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        // SVG for User/Check
        const iconPath = isFollowing 
            ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' 
            : '<path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>';
        
        btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;">${iconPath}</svg> ${isFollowing ? 'Following' : 'Follow'}`;
        
        btn.onclick = async () => {
            const action = isFollowing ? 'unfollow' : 'follow';
            const res = await apiFetch(`/api/${action}/${encodeURIComponent(username)}`, { method: 'POST' });
            if (res) {
                // Toggle state visually immediately
                const newState = !isFollowing;
                btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;">${newState ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' : '<path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>'}</svg> ${newState ? 'Following' : 'Follow'}`;
                
                // Update global stats
                const statValues = document.querySelectorAll('.stat-value');
                if(statValues[0]) statValues[0].textContent = parseInt(statValues[0].textContent) + (newState ? 1 : -1);
            }
        };
        return btn;
    }

    document.addEventListener('DOMContentLoaded', async () => {
    const sessionData = await apiFetch('/session');
    if (!sessionData) return;
    
    const currentUsername = sessionData.username;
    const urlParams = new URLSearchParams(window.location.search);
    const targetUsername = urlParams.get('user') || currentUsername;
    
    const userData = await apiFetch(`/api/user-info/${encodeURIComponent(targetUsername)}`);
    if (!userData) return;

    // 1. Update Profile Info
    document.title = `${userData.username} - Cybers/ash`;
    const bannerImg = document.querySelector('.banner-img');
    bannerImg.src = userData.banner || '';
    bannerImg.style.display = userData.banner ? 'block' : 'none';
    
    document.querySelector('.avatar-img').src = userData.pfp || `./favicon.ico`;
    document.querySelector('.display-name').textContent = targetUsername.replace('/', '');
    document.querySelector('.handle').textContent = targetUsername;
    
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues[0]) statValues[0].textContent = (userData.followers || []).length;
    if (statValues[2]) statValues[2].textContent = (userData.following || []).length;
    
    const bioText = document.getElementById('profileBio');
    if(bioText) bioText.textContent = userData.about || "No bio yet.";

    // 2. Update Modal Info
    const modalTitle = document.getElementById('modalUserName');
    const modalDate = document.getElementById('modalJoinedDate');
    const modalBio = document.getElementById('modalBioFull');
    
    if(modalTitle) modalTitle.textContent = targetUsername.replace('/', '');
    if(modalDate) modalDate.textContent = formatDate(userData.joinedAt || userData.createdAt);
    if(modalBio) modalBio.textContent = userData.about || "This user hasn't written a bio yet.";

    // 3. REBUILD Action Buttons (Synced)
    const container = document.getElementById('actionButtonsContainer');
    container.innerHTML = ''; // Clear loading state
    
    const isOwnProfile = targetUsername === currentUsername;
    
    // Follow Button
    if (!isOwnProfile) {
        const isFollowing = (userData.following || []).includes(currentUsername);
        const followBtn = createFollowButton(targetUsername, isFollowing);
        container.appendChild(followBtn);
    }

    // Message Button
    const msgBtn = document.createElement('button');
    msgBtn.className = 'btn btn-secondary';
    msgBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg> Message`;
    msgBtn.onclick = () => window.location.href = `./directs.html?user=${userData.username}`;
    
    if (!isOwnProfile) {
        container.appendChild(msgBtn);
    }

    // Info Button
    const infoBtn = document.getElementById('moreInfoBtn');
    if (infoBtn) {
        infoBtn.onclick = () => document.getElementById('infoModal').classList.add('active');
        container.appendChild(infoBtn);
    }

    // 4. Render Posts
    const postsData = await apiFetch(`/api/messages/user/${encodeURIComponent(targetUsername)}`);
    const resultsGrid = document.querySelector('.results-grid');
    resultsGrid.innerHTML = '';
    
    if (postsData && postsData.length > 0) {
        postsData.forEach(post => {
        const card = document.createElement('div');
        card.className = 'result-card post-card';
        const imageHtml = post.image
            ? `<div class="post-image-container"><img src="${post.image}" alt="Post image" style="width:100%; border-radius: 12px; margin-bottom: 1rem;"></div>`
            : '';
        const date = new Date(post.timestamp);
        const timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        card.innerHTML = `
            <div class="post-header">
            <img src="${post.pfp || './favicon.ico'}" alt="User" class="post-avatar">
            <div>
                <div class="post-author">${post.username.replace('/', '')}</div>
                <div class="post-time">${timeString}</div>
            </div>
            </div>
            ${imageHtml}
            <div class="post-content">${post.message}</div>
            <div class="post-footer">
            <div class="stat-item">
                <svg viewBox="0 0 24 24"><path d="M21 11.01L3 11v2h18.01v-2zM21 7.01L3 7v2h18.01v-2zM21 15.01L3 15v2h18.01v-2z"></path></svg>
                ${post.likes ? post.likes.length : 0}
            </div>
            <div class="stat-item">
                <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                ${post.likes ? post.likes.length : 0}
            </div>
            </div>
        `;
        resultsGrid.appendChild(card);
        });
    } else {
        resultsGrid.innerHTML = '<p style="color: var(--theme-text-secondary); text-align:center; width:100%;">No posts yet.</p>';
    }
    });
    // ... (Keep your API helpers: getCsrfToken, apiFetch, formatDate, createFollowButton) ...

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get Session Data FIRST (This is ALWAYS the logged-in user)
    const sessionData = await apiFetch('/session');
    if (!sessionData) return;
    
    const currentUsername = sessionData.username;
    const currentPfp = sessionData.pfp || './favicon.ico'; // <-- Get your own PFP here

    // 2. Get URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const targetUsername = urlParams.get('user') || currentUsername;

    // 3. Update Settings Icons IMMEDIATELY with YOUR data
    const settingsIcon = document.getElementById('accountPfp');
    if (settingsIcon) settingsIcon.src = currentPfp;
    
    const mobileSettingsIcon = document.getElementById('mobileaccountPfp');
    if (mobileSettingsIcon) mobileSettingsIcon.src = currentPfp;
    // <-- END OF ADDITION

    // 4. Fetch Target User Data
    const userData = await apiFetch(`/api/user-info/${encodeURIComponent(targetUsername)}`);
    if (!userData) return;

    // 5. Update UI Elements
    document.title = `Cybers/ash - ${userData.username}`;
    const bannerImg = document.querySelector('.banner-img');
    bannerImg.src = userData.banner || '';
    bannerImg.style.display = userData.banner ? 'block' : 'none';
    
    // This updates the MAIN profile picture (which might be someone else)
    document.querySelector('.avatar-img').src = userData.pfp || `./favicon.ico`;
    
    // REMOVE THESE LINES (They were overwriting your settings icon with the target user's pfp)
    // const settingsIcon = document.getElementById('accountPfp');
    // if (settingsIcon) settingsIcon.src = userData.pfp || './favicon.ico';
    // const mobileSettingsIcon = document.getElementById('mobileaccountPfp');
    // if (mobileSettingsIcon) mobileSettingsIcon.src = userData.pfp || './favicon.ico';

    document.querySelector('.display-name').textContent = targetUsername.replace('/', '');
    document.querySelector('.handle').textContent = targetUsername;
    
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues[0]) statValues[0].textContent = (userData.followers || []).length;
    if (statValues[2]) statValues[2].textContent = (userData.following || []).length;
    
    const bioText = document.getElementById('profileBio');
    if(bioText) bioText.textContent = userData.about || "No bio yet.";

    // Modal Info
    const modalTitle = document.getElementById('modalUserName');
    const modalDate = document.getElementById('modalJoinedDate');
    const modalBio = document.getElementById('modalBioFull');
    if(modalTitle) modalTitle.textContent = targetUsername.replace('/', '');
    if(modalDate) modalDate.textContent = formatDate(userData.joinedAt || userData.createdAt);
    if(modalBio) modalBio.textContent = userData.about || "This user hasn't written a bio yet.";

    // Action Buttons
    const container = document.getElementById('actionButtonsContainer');
    container.innerHTML = '';
    const isOwnProfile = targetUsername === currentUsername;
    
    if (!isOwnProfile) {
        const isFollowing = userData.followers ? userData.followers.includes(currentUsername) : false;
        container.appendChild(createFollowButton(targetUsername, isFollowing));
        const msgBtn = document.createElement('button');
        msgBtn.className = 'btn btn-secondary';
        msgBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg> Message`;
        msgBtn.onclick = () => window.location.href = `./directs.html?user=${userData.username}`;
        container.appendChild(msgBtn);
    }
    
    // Info Button
    const infoBtn = document.getElementById('moreInfoBtn');
    if (infoBtn) {
        infoBtn.onclick = () => document.getElementById('infoModal').classList.add('active');
        container.appendChild(infoBtn);
    }

    // Tab Switching Logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const resultsGrid = document.querySelector('.results-grid');
    
    const renderPosts = (posts) => {
        resultsGrid.innerHTML = '';
        if (posts && posts.length > 0) {
            posts.forEach(post => {
                const card = document.createElement('div');
                card.className = 'result-card post-card';
                const imageHtml = post.image
                    ? `<div class="post-image-container"><img src="${post.image}" alt="Post image" style="width:100%; border-radius: 12px; margin-bottom: 1rem;"></div>`
                    : '';
                let timeString = '';
                if (post.timestamp) {
                    const date = new Date(post.timestamp);
                    timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                } else if (post.date) {
                    timeString = post.date;
                }
                card.innerHTML = `
                    <div class="post-header">
                        <img src="${post.pfp || './favicon.ico'}" alt="User" class="post-avatar">
                        <div>
                            <div class="post-author">${post.username || targetUsername.replace('/', '')}</div>
                            <div class="post-time">${timeString}</div>
                        </div>
                    </div>
                    ${imageHtml}
                    <div class="post-content">${post.message || post.content || ''}</div>
                    <div class="post-footer">
                        <div class="stat-item">
                            <svg viewBox="0 0 24 24"><path d="M21 11.01L3 11v2h18.01v-2zM21 7.01L3 7v2h18.01v-2zM21 15.01L3 15v2h18.01v-2z"></path></svg>
                            ${post.likes || post.commentCount || 0}
                        </div>
                        <div class="stat-item">
                            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                            ${post.likesCount || 0}
                        </div>
                    </div>
                `;
                resultsGrid.appendChild(card);
            });
        } else {
            resultsGrid.innerHTML = '<p style="color: var(--theme-text-secondary); text-align:center; width:100%; grid-column: 1/-1;">No items in this category.</p>';
        }
    };

    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tabType = btn.getAttribute('data-tab');
            let data = [];
            try {
                if (tabType === 'slashes') {
                    const postsData = await apiFetch(`/api/messages/user/${encodeURIComponent(targetUsername)}`);
                    data = postsData || [];
                } else if (tabType === 'likes') {
                    const likedData = await apiFetch(`/api/posts/liked-by/${encodeURIComponent(targetUsername)}`);
                    data = likedData || [];
                } else if (tabType === 'saved') {
                    const savedData = await apiFetch(`/api/posts/saved-by/${encodeURIComponent(targetUsername)}`);
                    data = savedData || [];
                }
                renderPosts(data);
            } catch (error) {
                console.error("Error fetching tab data:", error);
                resultsGrid.innerHTML = '<p style="color: var(--theme-text-secondary); text-align:center; width:100%; grid-column: 1/-1;">Failed to load content.</p>';
            }
        });
    });

    const defaultTab = document.querySelector('.tab-btn[data-tab="slashes"]');
    if (defaultTab) {
        const postsData = await apiFetch(`/api/messages/user/${encodeURIComponent(targetUsername)}`);
        renderPosts(postsData || []);
    }
});

// Helper: Format Date for Modal
function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Helper: Create HTML for buttons
function createFollowButton(username, isFollowing) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    
    const iconPath = isFollowing
        ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'
        : '<path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>';
        
    btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;">${iconPath}</svg> ${isFollowing ? 'Following' : 'Follow'}`;
    
    btn.onclick = async () => {
        const action = isFollowing ? 'unfollow' : 'follow';
        const res = await apiFetch(`/api/${action}/${encodeURIComponent(username)}`, { method: 'POST' });
        
        if (res) {
            // Update global state if you have it
            if (typeof currentUserFollowing !== 'undefined') {
                if (isFollowing) {
                    currentUserFollowing = currentUserFollowing.filter(u => u !== username);
                } else {
                    currentUserFollowing.push(username);
                }
            }
            
            // Toggle state visually
            const newState = !isFollowing;
            const newIconPath = newState
                ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'
                : '<path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>';
                
            btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;">${newIconPath}</svg> ${newState ? 'Following' : 'Follow'}`;
            
            // Update global stats
            const statValues = document.querySelectorAll('.stat-value');
            if(statValues[0]) {
                const currentCount = parseInt(statValues[0].textContent.replace('k', '000'));
                statValues[0].textContent = newState ? currentCount + 1 : currentCount - 1;
            }
            
            // Update other buttons in sync
            updateFollowButtons();
        } else {
            alert('Failed to update follow status.');
        }
    };
    return btn;
}

// Helper to update all follow buttons across the page
function updateFollowButtons() {
  document.querySelectorAll('.post-follow-btn, .follow-btn, #profileFollowBtn').forEach(btn => {
    let username = '';
    if (btn.id === 'profileFollowBtn') {
      const urlParams = new URLSearchParams(window.location.search);
      username = urlParams.get('user') || currentUser?.username || '';
    } else {
      username = btn.id.replace('followBtn-', '');
    }

    if (currentUserFollowing && currentUserFollowing.includes(username)) {
      btn.textContent = "Following";
      btn.classList.add("following");
    } else {
      btn.textContent = "Follow";
      btn.classList.remove("following");
    }
  });
}