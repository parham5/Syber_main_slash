// Account Settings Page JS
document.addEventListener('DOMContentLoaded', async () => {
    
    // --- Helper: Get CSRF Token ---
    async function getCsrfToken() {
        try {
            const res = await fetch('/csrf-token', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                return data.csrfToken;
            }
        } catch (err) {
            console.error('Failed to get CSRF token:', err);
        }
        return null;
    }

    // --- Helper: Get User Data ---
    async function getUserData() {
        try {
            const sessionRes = await fetch('/session', { credentials: 'include' });
            if (!sessionRes.ok) return null;
            
            const session = await sessionRes.json();
            if (!session.username) return null;
            
            const userRes = await fetch(`/api/user-info/${encodeURIComponent(session.username)}`, { credentials: 'include' });
            if (!userRes.ok) return null;
            
            return await userRes.json();
        } catch (err) {
            console.error('Failed to load user data:', err);
            return null;
        }
    }

    // --- Helper: Upload Image ---
    async function uploadImage(type, file) {
        // type is either 'pfp' or 'banner'
        if (!file) return null;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return null;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('File must be under 5MB');
            return null;
        }

        // Check GIF for premium (only for avatar)
        if (file.type === 'image/gif' && type === 'pfp') {
             const user = await getUserData();
             if (!user?.isPremium) {
                 alert('GIF profile pictures are a Premium feature!');
                 return null;
             }
        }

        const formData = new FormData();
        // The field name must match what multer expects (usually the same as the route param or 'file')
        // In server.js: upload.single("pfp") and upload.single("banner")
        formData.append(type, file); 
        
        // Determine the correct URL
        // Server has: /upload-pfp and /upload-banner
        const uploadUrl = type === 'pfp' ? '/upload-pfp' : '/upload-banner';
        
        const csrfToken = await getCsrfToken();

        try {
            console.log(`Uploading ${type} to ${uploadUrl}`); // Debug log
            
            const res = await fetch(uploadUrl, {
                method: 'POST',
                body: formData,
                credentials: 'include',
                headers: {
                    'X-CSRF-Token': csrfToken 
                }
            });
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error(`Upload failed (${res.status}):`, errorText);
                throw new Error(`Upload failed: ${res.status}`);
            }
            
            const data = await res.json();
            return data; 
        } catch (err) {
            alert(`Failed to upload ${type}: ${err.message}`);
            return null;
        }
    }

    // --- Main Logic ---
    const user = await getUserData();
    
    if (!user) {
        console.warn('No user data found. Ensure you are logged in.');
        return;
    }

    // 1. Update Sidebar
    const sidebarUsername = document.querySelector('.username');
    const sidebarHandle = document.querySelector('.handle');
    const sidebarAvatar = document.querySelector('.avatar');
    
    if (sidebarUsername) sidebarUsername.textContent = user.username;
    if (sidebarHandle) sidebarHandle.textContent = user.username;
    
    if (sidebarAvatar && user.pfp) sidebarAvatar.src = user.pfp;

    // 2. Update Profile Form Fields
    const displayNameInput = document.getElementById('display-name');
    const usernameInput = document.getElementById('username-input');
    const usernameHelper = document.getElementById('username-helper');
    const usernameLock = document.getElementById('username-lock');
    const bioTextarea = document.getElementById('bio');
    const largeAvatar = document.querySelector('.avatar-large');
    const bannerImg = document.querySelector('.banner-image');

    // Set Display Name (Mirrors Username in your DB)
    if (displayNameInput) {
        displayNameInput.value = user.username; 
    }

    // Set Username
    if (usernameInput) {
        usernameInput.value = user.username;
    }

    // Set Bio
    if (bioTextarea) {
        bioTextarea.value = user.about || "";
    }

    // Set Avatar & Banner
    if (largeAvatar && user.pfp) largeAvatar.src = user.pfp;
    if (bannerImg && user.banner) {
        bannerImg.src = user.banner;
        bannerImg.style.display = 'block';
    }

    // 3. Handle Premium Logic for Username
    const isPremium = user.isPremium;
    if (isPremium) {
        usernameInput.disabled = false;
        usernameLock.style.opacity = '0';
        usernameHelper.textContent = "Premium Feature: You can change your username.";
        usernameHelper.classList.remove('text-muted');
    } else {
        usernameInput.disabled = true;
        usernameLock.style.opacity = '1';
        usernameHelper.textContent = "Change your username anytime. Premium users can change this.";
        usernameHelper.classList.add('text-muted');
    }

    // --- Event Listeners ---

    // Upload Banner
    const bannerUpload = document.getElementById('banner-upload');
    const uploadBannerBtn = document.getElementById('upload-banner-btn');
    
    if (uploadBannerBtn && bannerUpload) {
        uploadBannerBtn.addEventListener('click', () => bannerUpload.click());
        
        bannerUpload.addEventListener('change', async (e) => {
            const data = await uploadImage('banner', e.target.files[0]);
            if (data && bannerImg) {
                bannerImg.src = data.banner;
                bannerImg.style.display = 'block';
            }
        });
    }

    // Upload Avatar
    const avatarUpload = document.getElementById('avatar-upload');
    const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
    
    if (uploadAvatarBtn && avatarUpload) {
        uploadAvatarBtn.addEventListener('click', () => avatarUpload.click());
        
        avatarUpload.addEventListener('change', async (e) => {
            const data = await uploadImage('pfp', e.target.files[0]);
            if (data) {
                if (sidebarAvatar) sidebarAvatar.src = data.pfp;
                if (largeAvatar) largeAvatar.src = data.pfp;
            }
        });
    }

    // Save All Changes (Name, Username, Bio)
    const saveBtn = document.getElementById('save-profile-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const newName = displayNameInput.value.trim();
            const newUsername = usernameInput.value.trim();
            const newBio = bioTextarea.value.trim();
            
            let hasError = false;

            // 1. Save Bio
            if (newBio !== (user.about || "")) {
                try {
                    const csrfToken = await getCsrfToken();
                    const bioRes = await fetch('/api/update-about', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                        credentials: 'include',
                        body: JSON.stringify({ aboutMe: newBio })
                    });
                    if (!bioRes.ok) {
                        const errData = await bioRes.json();
                        throw new Error(errData.error || 'Failed to save bio');
                    }
                } catch (err) {
                    alert('Error saving bio: ' + err.message);
                    hasError = true;
                }
            }

            // 2. Save Username
            if (newUsername && newUsername !== user.username) {
                if (!isPremium) {
                    alert('Changing your username requires a Premium account.');
                    usernameInput.value = user.username;
                    return;
                }
                
                if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
                    alert('Username must be 3-20 characters, letters, numbers, and underscores only.');
                    return;
                }

                try {
                    const csrfToken = await getCsrfToken();
                    const usernameRes = await fetch('/api/change-username', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                        credentials: 'include',
                        body: JSON.stringify({ newUsername: newUsername })
                    });
                    
                    if (!usernameRes.ok) {
                        const errData = await usernameRes.json();
                        throw new Error(errData.error || 'Failed to change username');
                    }
                    
                    alert('Profile updated successfully!');
                    window.location.reload(); 
                    return;
                } catch (err) {
                    alert('Error saving username: ' + err.message);
                    hasError = true;
                }
            } else {
                if (!hasError) {
                    alert('Profile updated successfully!');
                }
            }
        });
    }
});