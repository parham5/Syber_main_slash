// Shared settings utilities for all settings pages

// Get the correct base path based on current page location
function getBasePath() {
    const path = window.location.pathname;
    if (path.includes('/Account/') || path.includes('/Security and Privacy/') || 
        path.includes('/ScreenTime/') || path.includes('/Notifications/')) {
        return './';
    }
    return '';
}

// Check if current page is a settings page
function isSettingsPage() {
    const path = window.location.pathname;
    return path.includes('/Account/') || 
           path.includes('/Security and Privacy/') ||
           path.includes('/ScreenTime/') ||
           path.includes('/Notifications/') ||
           path.includes('/Display/') ||
           path === '/' || 
           path === '/settings.html';
}

// Get CSRF token
async function getCsrfToken() {
    const response = await fetch('/csrf-token', { credentials: 'include' });
    const data = await response.json();
    return data.csrfToken;
}

// Check if user is premium
async function checkPremiumStatus() {
    try {
        const sessionRes = await fetch('/session', { credentials: 'include' });
        if (!sessionRes.ok) return false;
        const session = await sessionRes.json();
        
        const userRes = await fetch(`/api/user-info/${encodeURIComponent(session.username)}`, { credentials: 'include' });
        const user = await userRes.json();
        return user.isPremium === true;
    } catch {
        return false;
    }
}

// Get current user info
async function getCurrentUser() {
    const sessionRes = await fetch('/session', { credentials: 'include' });
    if (!sessionRes.ok) throw new Error('Not logged in');
    const session = await sessionRes.json();
    const userRes = await fetch(`/api/user-info/${encodeURIComponent(session.username)}`, { credentials: 'include' });
    const userData = await userRes.json();
    return {
        ...userData,
        username: session.username
    };
}

// Get current session username only
async function getCurrentUsername() {
    const sessionRes = await fetch('/session', { credentials: 'include' });
    if (!sessionRes.ok) throw new Error('Not logged in');
    const session = await sessionRes.json();
    return session.username;
}

// Save theme to backend
async function saveTheme(themeName) {
    const token = await getCsrfToken();
    const response = await fetch('/api/user-settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ theme: themeName })
    });
    
    if (response.ok) {
        document.body.classList.remove(
            'theme-default', 'theme-discord', 'theme-amethyst',
            'theme-aurora', 'theme-sunset', 'theme-forest',
            'theme-ocean', 'theme-midnight', 'theme-fire'
        );
        document.body.classList.add(themeName);
        localStorage.setItem('userTheme', themeName);
    }
    return response.ok;
}

// Save background
async function saveBackground(backgroundImage) {
    const token = await getCsrfToken();
    const response = await fetch('/api/user-settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ backgroundImage: backgroundImage })
    });
    
    if (response.ok && backgroundImage && backgroundImage !== 'none') {
        document.body.style.backgroundImage = backgroundImage;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
        localStorage.setItem('userBackground', backgroundImage);
    } else if (backgroundImage === 'none') {
        document.body.style.backgroundImage = '';
        localStorage.removeItem('userBackground');
    }
    return response.ok;
}

// Upload custom background
async function uploadBackground(file) {
    const token = await getCsrfToken();
    const formData = new FormData();
    formData.append('background', file);
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload-background', true);
        xhr.setRequestHeader('X-CSRF-Token', token);
        xhr.withCredentials = true;
        
        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                resolve(data.backgroundImage);
            } else {
                reject(new Error('Upload failed'));
            }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
    });
}

// Update user info (bio, etc)
async function updateUserInfo(data) {
    const token = await getCsrfToken();
    const response = await fetch('/api/update-about', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ aboutMe: data.bio || '' })
    });
    return response.ok;
}

// Upload profile picture
async function uploadProfilePicture(file) {
    const token = await getCsrfToken();
    const formData = new FormData();
    formData.append('pfp', file);
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload-pfp', true);
        xhr.setRequestHeader('X-CSRF-Token', token);
        xhr.withCredentials = true;
        
        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                resolve(data.pfp);
            } else {
                reject(new Error('Upload failed'));
            }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
    });
}

// Upload banner
async function uploadBanner(file) {
    const token = await getCsrfToken();
    const formData = new FormData();
    formData.append('banner', file);
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload-banner', true);
        xhr.setRequestHeader('X-CSRF-Token', token);
        xhr.withCredentials = true;
        
        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                resolve(data.banner);
            } else {
                reject(new Error('Upload failed'));
            }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
    });
}

// Change password
async function changePassword(oldPassword, newPassword) {
    const token = await getCsrfToken();
    const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword })
    });
    
    if (!response.ok) {
        throw new Error('Password change failed');
    }
    return response.json();
}

// Change username (premium)
async function changeUsername(newUsername) {
    const token = await getCsrfToken();
    const response = await fetch('/api/change-username', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ newUsername })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Username change failed');
    }
    return response.json();
}

// Logout
async function logout() {
    const token = await getCsrfToken();
    await fetch('/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': token },
        credentials: 'include'
    });
    window.location.href = '/login.html';
}

// Load screen time from localStorage
function loadScreenTimeSettings() {
    return {
        limitEnabled: localStorage.getItem('screenTimeLimitEnabled') === 'true',
        hours: parseInt(localStorage.getItem('screenTimeLimitHours')) || 0,
        minutes: parseInt(localStorage.getItem('screenTimeLimitMinutes')) || 0
    };
}

// Save screen time settings
function saveScreenTimeSettings(enabled, hours, minutes) {
    localStorage.setItem('screenTimeLimitEnabled', enabled);
    localStorage.setItem('screenTimeLimitHours', hours);
    localStorage.setItem('screenTimeLimitMinutes', minutes);
}

// Get ringtone preference
function getRingtonePreference() {
    return localStorage.getItem('selectedRingtone') || './ringtone/sanguineremix.mp3';
}

// Set ringtone preference
function setRingtonePreference(path) {
    localStorage.setItem('selectedRingtone', path);
}

// Toggle push notifications
function getPushNotificationsEnabled() {
    return localStorage.getItem('pushNotificationsEnabled') !== 'false';
}

function setPushNotificationsEnabled(enabled) {
    localStorage.setItem('pushNotificationsEnabled', enabled);
}

// Load privacy settings
function getPrivacySettings() {
    return {
        dmPermission: localStorage.getItem('dmPermission') || 'everyone',
        lastSeen: localStorage.getItem('lastSeenPrivacy') || 'everyone',
        readReceipts: localStorage.getItem('readReceiptsPrivacy') || 'everyone',
        slashVisibility: localStorage.getItem('slashVisibility') || 'everyone',
        reslashPermission: localStorage.getItem('reslashPermission') || 'everyone',
        replyPermission: localStorage.getItem('replyPermission') || 'everyone'
    };
}

// Save privacy settings
function savePrivacySettings(settings) {
    Object.entries(settings).forEach(([key, value]) => {
        localStorage.setItem(key, value);
    });
}

// Update sidebar user info (for all pages)
async function updateSidebarUserInfo() {
    try {
        const sessionRes = await fetch('/session', { credentials: 'include' });
        if (!sessionRes.ok) return;
        
        const session = await sessionRes.json();
        const username = session.username;
        
        const userRes = await fetch(`/api/user-info/${encodeURIComponent(username)}`, { credentials: 'include' });
        const user = await userRes.json();
        
        const basePath = getBasePath();
        
        // Fix PFP path for settings pages
        let pfpUrl = user.pfp;
        if (pfpUrl && !pfpUrl.startsWith('http')) {
            if (isSettingsPage() && pfpUrl.startsWith('/pfps/')) {
                pfpUrl = basePath + pfpUrl.substring(1);
            } else if (pfpUrl.startsWith('/')) {
                pfpUrl = pfpUrl.substring(1);
            }
        }
        
        // Update all avatar elements
        const avatarElements = document.querySelectorAll('.sidebar .avatar, .avatar, #accountPfp, .avatar-large, .account-modal-pfp');
        avatarElements.forEach(el => {
            if (el && pfpUrl) {
                el.src = pfpUrl;
            }
        });
        
        // Update username elements
        const usernameElements = document.querySelectorAll('.sidebar .username, .username');
        usernameElements.forEach(el => {
            if (el && !el.closest('.post')) {
                el.textContent = username;
            }
        });
        
        const handleElements = document.querySelectorAll('.sidebar .handle, .handle');
        handleElements.forEach(el => {
            if (el && !el.closest('.post')) {
                el.textContent = username;
            }
        });
        
        // Update account button
        const accountBtn = document.getElementById('accountBtn');
        if (accountBtn && pfpUrl) {
            const img = accountBtn.querySelector('img');
            if (img) img.src = pfpUrl;
        }
        
    } catch (err) {
        console.error('Failed to update sidebar user info:', err);
    }
}

// Call this when DOM loads on every page
document.addEventListener('DOMContentLoaded', () => {
    if (!isSettingsPage()) {
        applySavedTheme();
    }
    updateSidebarUserInfo();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateSidebarUserInfo();
    });
} else {
    updateSidebarUserInfo();
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const navItems = document.querySelectorAll('.settings-nav .nav-item');

    if (searchInput && navItems.length > 0) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            navItems.forEach(item => {
                const link = item.querySelector('a');
                // Get the text content of the link (ignoring the SVG if present)
                // We use a regex to strip HTML tags if necessary, or just get the last text node
                const text = link.textContent.trim().toLowerCase();
                
                if (text.includes(searchTerm)) {
                    item.style.display = ''; // Show
                } else {
                    item.style.display = 'none'; // Hide
                }
            });
        });
    }
});