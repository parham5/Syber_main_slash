document.addEventListener('DOMContentLoaded', function() {
    async function getCsrfToken() {
        try {
            const response = await fetch('/csrf-token', { credentials: 'include' });
            const data = await response.json();
            return data.csrfToken || '';
        } catch {
            return '';
        }
    }
    
    // --- 1. Ringtone Preview Logic ---
    const ringtoneSelector = document.getElementById('ringtoneSelector');
    let audio = new Audio();
    
    // Function to play the selected ringtone
    function playRingtone() {
        const selectedValue = ringtoneSelector.value;
        
        // STOP current audio
        audio.pause();
        audio.currentTime = 0;
        
        // Set new source and play
        audio.src = selectedValue;
        
        // SAVE the selection to localStorage so index.html can find it later
        localStorage.setItem('selectedRingtone', selectedValue);
        
        audio.play().catch(error => {
            console.error("Audio playback failed:", error);
        });
    }

    // Listen for changes in the dropdown
    if (ringtoneSelector) {
        ringtoneSelector.addEventListener('change', playRingtone);
        
        // Optional: If you want to play the currently saved ringtone on page load
        const savedRingtone = localStorage.getItem('selectedRingtone');
        if (savedRingtone) {
            ringtoneSelector.value = savedRingtone;
        }
    }

    // --- 2. Push Notification Toggle Logic ---
    const pushToggle = document.querySelector('.toggle-switch input[type="checkbox"]');
    
    if (pushToggle) {
        fetch('/api/notifications/preferences', { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(prefs => {
                if (prefs) pushToggle.checked = prefs.notificationsEnabled !== false;
            })
            .catch(() => {});

        pushToggle.addEventListener('change', async function() {
            const isEnabled = this.checked;
            
            try {
                const response = await fetch('/api/notifications/preferences', {
                    method: 'PUT',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': await getCsrfToken()
                    },
                    body: JSON.stringify({
                        notificationsEnabled: isEnabled 
                    })
                });

                if (response.ok) {
                    console.log("Notification setting saved.");
                } else {
                    console.error("Failed to save notification setting.");
                    this.checked = !isEnabled;
                }
            } catch (error) {
                console.error("Error saving notification setting:", error);
                this.checked = !isEnabled;
            }
        });
    }

    // --- 3. Load User Profile Info ---
    async function loadUserProfile() {
        try {
            const response = await fetch('/session');
            
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login.html'; 
                    return;
                }
                return;
            }

            const data = await response.json();
            const { username, pfp } = data;

            const usernameSpan = document.querySelector('.username');
            const handleSpan = document.querySelector('.handle');
            const avatarImg = document.querySelector('.avatar');

            if (usernameSpan) usernameSpan.textContent = username;
            if (handleSpan) handleSpan.textContent = username;
            if (avatarImg) {
                if (pfp) {
                    avatarImg.src = pfp;
                } else {
                    avatarImg.src = './pictures/user.png'; 
                }
            }

        } catch (error) {
            console.error('Failed to load user profile:', error);
        }
    }

    loadUserProfile();

    // --- 4. Logout Functionality ---
    const logoutBtn = document.querySelector('.btn-logout');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            if (confirm('Are you sure you want to sign out?')) {
                try {
                    const response = await fetch('/logout', {
                        method: 'POST'
                    });
                    
                    if (response.ok) {
                        window.location.href = '/';
                    } else {
                        alert('Failed to log out. Please try again.');
                    }
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Network error during logout.');
                }
            }
        });
    }
});
