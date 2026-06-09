// security-privacy.js

// Helper to fetch a fresh CSRF token
async function getCsrfToken() {
    try {
        const res = await fetch('/csrf-token');
        if (!res.ok) return null;
        const data = await res.json();
        return data.csrfToken;
    } catch (err) {
        console.error('Failed to get CSRF token:', err);
        return null;
    }
}

// Helper to make a POST request with CSRF
async function csrfPost(url, data) {
    const token = await getCsrfToken();
    if (!token) {
        throw new Error("Security token error");
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        body: JSON.stringify(data),
        credentials: 'include'
    });
    
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${res.status}`);
    }
    
    return res.json();
}

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. UTILITY FUNCTIONS
    // ==========================================

    // Check 2FA Status
    async function checkTwoFactorStatus() {
        try {
            let username = window.currentSessionUsername;
            if (!username) {
                const res = await fetch('/session', { credentials: 'include' });
                if (!res.ok) return false;
                const data = await res.json();
                username = data.username;
                window.currentSessionUsername = username;
            }

            const userRes = await fetch(`/api/user-info/${encodeURIComponent(username)}`, { credentials: 'include' });
            if (!userRes.ok) return false;
            
            const data = await userRes.json();
            return data.twoFactorEnabled;
        } catch (err) {
            console.error("Failed to check 2FA status:", err);
            return false;
        }
    }

    // Generate 2FA QR
    async function generateNewTwoFactor() {
        return await csrfPost('/api/manage-2fa', { action: 'generate' });
    }

    // Verify & Enable 2FA
    async function verifyAndEnableTwoFactor(code) {
        return await csrfPost('/api/manage-2fa', { action: 'verify_and_enable', code: code });
    }

    // Disable 2FA
    async function disableTwoFactor(code) {
        return await csrfPost('/api/manage-2fa', { action: 'disable', code: code });
    }

    // Change Password
    async function changePassword(oldPw, newPw) {
        return await csrfPost('/api/change-password', { oldPassword: oldPw, newPassword: newPw });
    }

    // Save Privacy Settings to Server
    async function savePrivacySettingsToServer(settings) {
        try {
            await csrfPost('/api/user-settings', { privacySettings: settings });
            return true;
        } catch (err) {
            console.error("Failed to save privacy settings:", err);
            return false;
        }
    }

    // ==========================================
    // 2. UI COMPONENTS
    // ==========================================

    const createModal = (title, bodyHTML, footerHTML) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    ${bodyHTML}
                </div>
                <div class="modal-footer">
                    ${footerHTML}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('.close-modal');
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        return overlay;
    };

    const showToast = (msg, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    // ==========================================
    // 3. PASSWORD MODAL
    // ==========================================

    const passwordLink = document.querySelector('a[href="password.html"]');
    if (passwordLink) {
        passwordLink.addEventListener('click', (e) => {
            e.preventDefault();
            openPasswordModal();
        });
    }

    function openPasswordModal() {
        const modal = createModal(
            'Change Password',
            `
            <div class="form-group">
                <label for="currentPw">Current Password</label>
                <input type="password" id="currentPw" class="input-field" placeholder="Enter current password">
            </div>
            <div class="form-group">
                <label for="newPw">New Password</label>
                <input type="password" id="newPw" class="input-field" placeholder="Min 8 chars, 1 Upper, 1 Number">
            </div>
            <div class="form-group">
                <label for="confirmPw">Confirm New Password</label>
                <input type="password" id="confirmPw" class="input-field" placeholder="Confirm new password">
            </div>
            `,
            `
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button id="submitPw" class="btn btn-primary">Update Password</button>
            `
        );

        modal.querySelector('#submitPw').addEventListener('click', async () => {
            const current = modal.querySelector('#currentPw').value;
            const newPw = modal.querySelector('#newPw').value;
            const confirm = modal.querySelector('#confirmPw').value;

            if (!current || !newPw || !confirm) {
                showToast("Please fill in all fields", "error");
                return;
            }
            if (newPw !== confirm) {
                showToast("Passwords do not match", "error");
                return;
            }
            if (newPw.length < 8) {
                showToast("Password must be at least 8 characters", "error");
                return;
            }

            const btn = modal.querySelector('#submitPw');
            btn.textContent = "Updating...";
            btn.disabled = true;

            try {
                await changePassword(current, newPw);
                showToast("Password updated successfully!");
                modal.remove();
            } catch (err) {
                showToast(err.message, "error");
            } finally {
                btn.textContent = "Update Password";
                btn.disabled = false;
            }
        });
    }

    // ==========================================
    // 4. 2FA MODAL
    // ==========================================

    const twoFALink = document.querySelector('a[href="2fa.html"]');
    if (twoFALink) {
        twoFALink.addEventListener('click', (e) => {
            e.preventDefault();
            open2FAModal();
        });
    }

    async function open2FAModal() {
        const isEnabled = await checkTwoFactorStatus();
        if (isEnabled) {
            openDisable2FAModal();
        } else {
            openEnable2FAModal();
        }
    }

    function openEnable2FAModal() {
        const modal = createModal(
            'Enable Two-Factor Authentication',
            `
            <p style="color: #666; margin-bottom: 15px;">
                Scan the QR code below with your authenticator app, then enter the 6-digit code.
            </p>
            <div id="qr-container" style="text-align: center; margin: 20px 0;">
                <p>Generating QR Code...</p>
            </div>
            <div class="form-group">
                <label for="enable2FACode">Enter 6-Digit Code</label>
                <input type="text" id="enable2FACode" class="input-field" placeholder="123456" maxlength="6" style="letter-spacing: 5px; text-align: center; font-size: 1.2em;">
            </div>
            `,
            `
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button id="verifyEnable2FA" class="btn btn-primary">Verify & Enable</button>
            <button id="regenerateQR" class="btn btn-text">Regenerate QR</button>
            `
        );

        generateQR(modal);

        modal.querySelector('#regenerateQR').addEventListener('click', () => generateQR(modal));
        
        modal.querySelector('#verifyEnable2FA').addEventListener('click', async () => {
            const code = modal.querySelector('#enable2FACode').value;
            if (code.length !== 6) {
                showToast("Please enter a valid 6-digit code", "error");
                return;
            }

            const btn = modal.querySelector('#verifyEnable2FA');
            btn.textContent = "Verifying...";
            btn.disabled = true;

            try {
                await verifyAndEnableTwoFactor(code);
                showToast("2FA Enabled Successfully!");
                modal.remove();
                setTimeout(() => location.reload(), 1000);
            } catch (err) {
                showToast(err.message, "error");
            } finally {
                btn.textContent = "Verify & Enable";
                btn.disabled = false;
            }
        });
    }

    function openDisable2FAModal() {
        const modal = createModal(
            'Disable Two-Factor Authentication',
            `
            <p style="color: #d9534f; margin-bottom: 15px;">
                Warning: Disabling 2FA will reduce your account security.
            </p>
            <div class="form-group">
                <label for="disable2FACode">Enter Current 2FA Code</label>
                <input type="text" id="disable2FACode" class="input-field" placeholder="123456" maxlength="6" style="letter-spacing: 5px; text-align: center; font-size: 1.2em;">
            </div>
            `,
            `
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button id="confirmDisable2FA" class="btn btn-danger">Disable 2FA</button>
            `
        );

        modal.querySelector('#confirmDisable2FA').addEventListener('click', async () => {
            const code = modal.querySelector('#disable2FACode').value;
            if (code.length !== 6) {
                showToast("Please enter a valid 6-digit code", "error");
                return;
            }

            const btn = modal.querySelector('#confirmDisable2FA');
            btn.textContent = "Disabling...";
            btn.disabled = true;

            try {
                await disableTwoFactor(code);
                showToast("2FA Disabled Successfully!");
                modal.remove();
                setTimeout(() => location.reload(), 1000);
            } catch (err) {
                showToast(err.message, "error");
            } finally {
                btn.textContent = "Disable 2FA";
                btn.disabled = false;
            }
        });
    }

    async function generateQR(modal) {
        const container = modal.querySelector('#qr-container');
        container.innerHTML = '<p>Generating...</p>';

        try {
            const data = await generateNewTwoFactor();
            if (data.qrCode) {
                container.innerHTML = `
                    <img src="${data.qrCode}" alt="2FA QR Code" style="max-width: 200px; border: 1px solid #ddd; padding: 10px; background: white;">
                    <p style="font-size: 0.9em; color: #888; margin-top: 10px;">
                        Or use this secret: <strong>${data.tempSecret}</strong>
                    </p>
                `;
            } else {
                container.innerHTML = `<p style="color: red;">${data.error || 'Failed to generate QR'}</p>`;
            }
        } catch (err) {
            container.innerHTML = `<p style="color: red;">${err.message}</p>`;
        }
    }

    // ==========================================
    // 5. PRIVACY SETTINGS (Now Server-Synced)
    // ==========================================

    let currentSettings = {};

    // Load settings from server
    async function loadPrivacySettings() {
        try {
            const sessionRes = await fetch('/session', { credentials: 'include' });
            if (!sessionRes.ok) return;
            const session = await sessionRes.json();
            
            const userRes = await fetch(`/api/user-info/${encodeURIComponent(session.username)}`, { credentials: 'include' });
            if (!userRes.ok) return;
            
            const user = await userRes.json();
            currentSettings = user.privacySettings || {
                dmPermission: 'everyone',
                lastSeen: 'everyone',
                readReceipts: 'everyone',
                slashVisibility: 'everyone',
                reslashPermission: 'everyone',
                replyPermission: 'everyone'
            };
        } catch (err) {
            console.error("Failed to load privacy settings:", err);
        }
    }

    // Save settings to server
    const saveSetting = async (key, value) => {
        currentSettings[key] = value;
        // Save to localStorage immediately for responsiveness
        localStorage.setItem('privacySettings', JSON.stringify(currentSettings));
        // Save to server in background
        await savePrivacySettingsToServer(currentSettings);
    };

    // Initialize
    loadPrivacySettings().then(() => {
        // Apply settings to UI
        const setSelectValue = (selector, value) => {
            const select = document.querySelector(selector);
            if (select) select.value = value;
        };

        setSelectValue('#direct-messages select:first-of-type', currentSettings.dmPermission);
        setSelectValue('#direct-messages select:nth-of-type(2)', currentSettings.lastSeen);
        setSelectValue('#direct-messages select:nth-of-type(3)', currentSettings.readReceipts);
        setSelectValue('#slashes select:first-of-type', currentSettings.slashVisibility);
        setSelectValue('#slashes select:nth-of-type(2)', currentSettings.reslashPermission);
        setSelectValue('#slashes select:nth-of-type(3)', currentSettings.replyPermission);

        // Add listeners
        const addSelectListener = (selector, key) => {
            const select = document.querySelector(selector);
            if (select) {
                select.addEventListener('change', (e) => {
                    saveSetting(key, e.target.value);
                });
            }
        };

        addSelectListener('#direct-messages select:first-of-type', 'dmPermission');
        addSelectListener('#direct-messages select:nth-of-type(2)', 'lastSeen');
        addSelectListener('#direct-messages select:nth-of-type(3)', 'readReceipts');
        addSelectListener('#slashes select:first-of-type', 'slashVisibility');
        addSelectListener('#slashes select:nth-of-type(2)', 'reslashPermission');
        addSelectListener('#slashes select:nth-of-type(3)', 'replyPermission');

        // Shadow Mode
        const shadowToggle = document.getElementById('shadowToggle');
        if (shadowToggle) {
            shadowToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const selects = document.querySelectorAll('.privacy-row select, .custom-select');
                    selects.forEach(select => {
                        select.value = 'noone';
                        select.dispatchEvent(new Event('change'));
                    });
                }
            });
        }

        // Logout
        const logoutBtn = document.querySelector('.btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if(confirm("Are you sure you want to sign out?")) {
                    fetch('/logout', { method: 'POST', credentials: 'include' })
                        .then(() => window.location.href = '/')
                        .catch(err => console.error(err));
                }
            });
        }
    });
});