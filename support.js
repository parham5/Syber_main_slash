        let currentPriority = "normal";
        let csrfToken = "";
        let currentUser = null;
        
        // Gradient definitions (same as premium.html)
        const gradients = {
            'gradient1': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'gradient2': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'gradient3': 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            'gradient4': 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
            'gradient5': 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)',
            'gradient6': 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
            'gradient7': 'linear-gradient(135deg, #0f0c29 0%, #302b63 100%)'
        };

        // Theme applying function
        function applyTheme(themeName) {
            document.body.classList.remove(
                'theme-default', 'theme-discord', 'theme-amethyst',
                'theme-aurora', 'theme-sunset', 'theme-forest',
                'theme-ocean', 'theme-midnight', 'theme-fire'
            );
            if (themeName) {
                document.body.classList.add(themeName);
            }
        }

        // Background applying function
        function applyBackground(bgName, isCustom, customUrl) {
            // Reset background
            document.body.style.background = '';
            document.body.style.backgroundImage = '';
            document.body.classList.remove('has-custom-bg');
            
            if (isCustom && customUrl) {
                document.body.style.backgroundImage = `url('${customUrl}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                document.body.classList.add('has-custom-bg');
            } else if (bgName && bgName !== 'none' && gradients[bgName]) {
                document.body.style.backgroundImage = gradients[bgName];
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
            }
        }

        // Load user's theme and background settings
        async function loadUserSettings() {
            try {
                const sessionRes = await fetch("/session", { credentials: "include" });
                if (!sessionRes.ok) return;
                
                const user = await sessionRes.json();
                const userRes = await fetch(`/api/user-info/${encodeURIComponent(user.username)}`, { 
                    credentials: "include" 
                });
                
                if (userRes.ok) {
                    const userData = await userRes.json();
                    
                    // Apply saved theme
                    if (userData.theme) {
                        applyTheme(userData.theme);
                    }
                    
                    // Apply saved background
                    if (userData.backgroundImage) {
                        if (userData.backgroundImage.startsWith('/backgrounds/') || 
                            userData.backgroundImage.startsWith('storage/backgrounds/') ||
                            userData.backgroundImage.startsWith('storage/')) {
                            // Custom uploaded image
                            let bgUrl = userData.backgroundImage;
                            if (!bgUrl.startsWith('/')) {
                                bgUrl = '/' + bgUrl;
                            }
                            applyBackground(null, true, bgUrl);
                        } else if (userData.backgroundImage.startsWith('gradient')) {
                            applyBackground(userData.backgroundImage, false, null);
                        }
                    }
                }
            } catch (err) {
                console.error("Error loading user settings:", err);
            }
        }

        // Get CSRF token
        fetch("/csrf-token")
            .then(r => r.json())
            .then(d => { 
                csrfToken = d.csrfToken; 
                // Load user settings after getting CSRF token
                loadUserSettings();
            });

        // Check authentication
        function checkAuth() {
            fetch("/session", { credentials: "include" })
                .then(res => {
                    if (!res.ok) throw new Error("Not logged in");
                    return res.json();
                })
                .then(user => {
                    currentUser = user;
                    loadMyTickets();
                })
                .catch(() => {
                    window.location.href = "./index.html";
                });
        }
        
        // Priority button handlers
        document.querySelectorAll('.priority-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentPriority = btn.dataset.priority;
            });
        });
        
        // Handle form submission
        document.getElementById('ticketForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('subject').value.trim();
            const category = document.getElementById('category').value;
            const message = document.getElementById('message').value.trim();
            if (!subject || !category || !message) {
                showNotification('Please fill in all required fields', 'error');
                return;
            }
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
            try {
                const response = await fetch('/api/support/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        subject,
                        category,
                        message,
                        priority: currentPriority
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    showNotification(`✅ ${data.message}`, 'success');
                    document.getElementById('ticketForm').reset();
                    document.querySelector('.priority-btn.normal').click();
                    loadMyTickets();
                } else {
                    showNotification(`❌ Error: ${data.error}`, 'error');
                }
            } catch (error) {
                showNotification('❌ Network error. Please try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Ticket';
            }
        });
        
        // Load user's tickets
        function loadMyTickets() {
            fetch('/api/support/my-tickets', { credentials: "include" })
                .then(res => res.json())
                .then(tickets => {
                    const container = document.getElementById('ticketsList');
                    if (tickets.length === 0) {
                        container.innerHTML = '<div style="text-align:center; color:#a0aec0;">No tickets yet. Create your first ticket above!</div>';
                        return;
                    }
                    container.innerHTML = tickets.map(ticket => `
                        <div class="ticket-card ${ticket.status}" onclick="viewTicket(${ticket.id})">
                            <div class="ticket-header">
                                <span class="ticket-id">${ticket.ticketId}</span>
                                <span class="ticket-status status-${ticket.status}">${formatStatus(ticket.status)}</span>
                            </div>
                            <div class="ticket-subject">${escapeHtml(ticket.subject)}</div>
                            <div class="ticket-preview">${escapeHtml(ticket.message.substring(0, 100))}${ticket.message.length > 100 ? '...' : ''}</div>
                            <div class="ticket-meta">
                                <span>📅 ${formatDate(ticket.createdAt)}</span>
                                <span>⚡ Priority: ${ticket.priority.toUpperCase()}</span>
                                <span>📝 ${ticket.responses.length} response(s)</span>
                            </div>
                        </div>
                    `).join('');
                })
                .catch(err => {
                    console.error('Error loading tickets:', err);
                    document.getElementById('ticketsList').innerHTML = '<div style="text-align:center; color:#f56565;">Error loading tickets</div>';
                });
        }
        
        // View ticket details
        async function viewTicket(ticketId) {
            const modal = document.getElementById('ticketModal');
            const modalContent = document.getElementById('modalContent');
            modal.style.display = 'block';
            modalContent.innerHTML = '<div style="text-align:center;">Loading...</div>';
            try {
                const response = await fetch(`/api/support/ticket/${ticketId}`, {
                    credentials: "include"
                });
                const ticket = await response.json();
                if (!response.ok) {
                    modalContent.innerHTML = `<div style="color:#f56565;">Error: ${ticket.error}</div>`;
                    return;
                }
                const isAdmin = window.location.pathname.includes('admin') || false;
                modalContent.innerHTML = `
                    <h2 style="margin-bottom:20px;">Ticket: ${ticket.ticketId}</h2>
                    <div style="background:var(--theme-bg-tertiary); padding:15px; border-radius:10px; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; margin-bottom:10px;">
                            <span style="color:var(--theme-accent);">From: ${ticket.userId}</span>
                            <span class="ticket-status status-${ticket.status}">${formatStatus(ticket.status)}</span>
                        </div>
                        <div style="margin-bottom:10px;">
                            <strong style="color:var(--theme-text-primary);">Subject:</strong> ${escapeHtml(ticket.subject)}
                        </div>
                        <div style="margin-bottom:10px;">
                            <strong style="color:var(--theme-text-primary);">Category:</strong> ${escapeHtml(ticket.category)}
                        </div>
                        <div style="margin-bottom:10px;">
                            <strong style="color:var(--theme-text-primary);">Priority:</strong> ${ticket.priority.toUpperCase()}
                        </div>
                        <div style="margin-bottom:10px;">
                            <strong style="color:var(--theme-text-primary);">Original Message:</strong>
                            <div style="margin-top:5px; padding:10px; background:var(--theme-bg-primary); border-radius:8px;">
                                ${escapeHtml(ticket.message)}
                            </div>
                        </div>
                    </div>
                    <h3 style="margin-bottom:15px;">💬 Responses</h3>
                    <div class="response-list">
                        ${ticket.responses.map(resp => `
                            <div class="response-item">
                                <div class="response-header">
                                    <span>
                                        ${resp.isAdmin ?
                                            `<span class="admin-badge">👑 Admin: ${escapeHtml(resp.userId)}</span>` :
                                            `<span>📱 User: ${escapeHtml(resp.userId)}</span>`
                                        }
                                    </span>
                                    <span>${formatDate(resp.timestamp)}</span>
                                </div>
                                <div class="response-message">${escapeHtml(resp.message)}</div>
                            </div>
                        `).join('')}
                        ${ticket.responses.length === 0 ? '<div style="text-align:center; color:#a0aec0;">No responses yet</div>' : ''}
                    </div>
                    <div class="response-form">
                        <h4 style="color:var(--theme-text-primary); margin-bottom:10px;">Add Response</h4>
                        <textarea id="responseMessage" placeholder="Type your response here..."></textarea>
                        ${isAdmin ? `
                            <div style="margin-bottom:10px;">
                                <select id="statusSelect" class="status-select">
                                    <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                                    <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                    <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                                    <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
                                </select>
                            </div>
                        ` : ''}
                        <button class="submit-btn" onclick="submitResponse(${ticket.id})" style="width:auto;">Send Response</button>
                    </div>
                `;
            } catch (error) {
                modalContent.innerHTML = '<div style="color:#f56565;">Error loading ticket details</div>';
            }
        }
        
        // Submit response
        async function submitResponse(ticketId) {
            const message = document.getElementById('responseMessage').value.trim();
            const statusSelect = document.getElementById('statusSelect');
            const status = statusSelect ? statusSelect.value : undefined;
            if (!message) {
                showNotification('Please enter a response', 'error');
                return;
            }
            const response = await fetch(`/api/support/ticket/${ticketId}/respond`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({ message, status })
            });
            if (response.ok) {
                showNotification('Response sent successfully!', 'success');
                loadMyTickets();
                viewTicket(ticketId);
            } else {
                const data = await response.json();
                showNotification(`Error: ${data.error}`, 'error');
            }
        }
        
        // Helper functions
        function formatStatus(status) {
            const statusMap = {
                'open': 'Open',
                'in_progress': 'In Progress',
                'resolved': 'Resolved',
                'closed': 'Closed'
            };
            return statusMap[status] || status;
        }
        
        function formatDate(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleString();
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function showNotification(message, type) {
            const area = document.getElementById('notificationArea');
            area.innerHTML = `<div class="${type}-message">${message}</div>`;
            setTimeout(() => {
                area.innerHTML = '';
            }, 5000);
        }
        
        function closeTicketModal() {
            document.getElementById('ticketModal').style.display = 'none';
        }
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('ticketModal');
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        }
        
        // Initialize
        document.addEventListener("DOMContentLoaded", () => {
            checkAuth();
        });

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                // 1. Fetch session data
                const response = await fetch('/session');
                
                if (!response.ok) {
                    console.log("User not logged in");
                    return;
                }
                
                const data = await response.json();
                
                // 2. Check if user exists and has a pfp
                if (data.pfp) {
                    // Ensure path starts with a slash
                    const pfpSrc = data.pfp.startsWith('/') ? data.pfp : '/' + data.pfp;
                    
                    // 3. Update BOTH images
                    const desktopImg = document.getElementById('accountPfp');
                    const mobileImg = document.getElementById('mobileaccountPfp');

                    if (desktopImg) {
                        desktopImg.src = pfpSrc;
                    }
                    
                    if (mobileImg) {
                        mobileImg.src = pfpSrc;
                    }
                } else {
                    // Optional: Set a default avatar if no pfp is uploaded
                    const desktopImg = document.getElementById('accountPfp');
                    const mobileImg = document.getElementById('mobileaccountPfp');
                    const defaultAvatar = '/favicon.ico'; // Ensure you have this file or handle it in CSS

                    if (desktopImg) desktopImg.src = defaultAvatar;
                    if (mobileImg) mobileImg.src = defaultAvatar;
                }
            } catch (error) {
                console.error("Error fetching session:", error);
            }
        });

        




  document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'support.html';
    
    // Get all sidebar links
    const navLinks = document.querySelectorAll('.sidebar a');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Remove old active classes first
      link.classList.remove('active', 'sidebar-item-active');
      
      // Check if this link matches the current page
      // We handle root directory (./) vs specific files (./directs.html)
      if (href === './support.html' && (currentPage === '' || currentPage === 'support.html')) {
        link.classList.add('active', 'sidebar-item-active');
      } else if (href === `./${currentPage}`) {
        link.classList.add('active', 'sidebar-item-active');
      }
    });

    // Mobile Navbar Active State (Optional, but recommended for consistency)
    const mobileLinks = document.querySelectorAll('.mobile-navbar .nav-item');
    mobileLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.remove('active'); // Reset mobile active
      if (href === './support.html' && (currentPage === '' || currentPage === 'support.html')) {
        link.classList.add('active');
      } else if (href === `./${currentPage}`) {
        link.classList.add('active');
      }
    });
  });