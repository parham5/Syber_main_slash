        let csrfToken = "";
        let allTickets = [];
        let currentFilter = "all";
        let allModerationReports = [];
        let currentModerationFilter = "all";
        
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

        // Fetch CSRF Token
        fetch("/csrf-token").then(r=>r.json()).then(d=>{ csrfToken = d.csrfToken; });
        
        // --- Theme Application Logic ---
        function applyTheme(themeName) {
            // Remove all existing theme classes
            document.body.classList.remove(
                'theme-default', 'theme-discord', 'theme-amethyst',
                'theme-aurora', 'theme-sunset', 'theme-forest',
                'theme-ocean', 'theme-midnight', 'theme-fire'
            );
            // Add the selected theme class
            if (themeName) {
                document.body.classList.add(themeName);
            }
        }

        // --- Background Application Logic ---
        function applyBackground(bgValue) {
            console.log("[BG] Applying background:", bgValue);
            
            // Reset background
            document.body.style.background = '';
            document.body.style.backgroundImage = '';
            
            if (!bgValue || bgValue === 'none') {
                document.body.classList.remove('has-custom-bg');
                return;
            }
            
            // Check if it's a custom uploaded image
            if (bgValue.startsWith('/storage/') || bgValue.startsWith('/backgrounds/') || bgValue.startsWith('storage/')) {
                let bgUrl = bgValue;
                if (!bgUrl.startsWith('/')) {
                    bgUrl = '/' + bgUrl;
                }
                document.body.style.backgroundImage = `url('${bgUrl}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                
                document.body.classList.add('has-custom-bg');
            } 
            // Check if it's a gradient
            else if (gradients[bgValue]) {
                document.body.style.backgroundImage = gradients[bgValue];
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                
                document.body.classList.remove('has-custom-bg');
            }
        }

        // --- Admin Auth & Initialization ---
        function checkAdminAuth() {
            fetch("/session", { credentials: "include" })
                .then(res => {
                    if (!res.ok) throw new Error("Not logged in");
                    return res.json();
                })
                .then(user => {
                    // 1. Load User Settings (Theme & Background)
                    return fetch(`/api/user-info/${encodeURIComponent(user.username)}`, { credentials: "include" });
                })
                .then(res => res.json())
                .then(userData => {
                    // Apply Theme if saved
                    if (userData.theme) {
                        applyTheme(userData.theme);
                    }
                    
                    // Apply Background if saved
                    if (userData.backgroundImage) {
                        applyBackground(userData.backgroundImage);
                    }
                    
                    // 2. Check Admin Permissions
                    return fetch("/api/support/stats", { credentials: "include" });
                })
                .then(res => {
                    if (res.status === 403) {
                        window.location.href = "./index.html";
                    }
                    return res.json();
                })
                .then(() => {
                    loadStats();
                    loadAllTickets();
                    loadModerationStats();
                    loadModerationReports();
                })
                .catch(() => {
                    window.location.href = "./index.html";
                });
        }
        
        function loadStats() {
            fetch("/api/support/stats", { credentials: "include" })
                .then(res => res.json())
                .then(stats => {
                    document.getElementById('totalTickets').textContent = stats.total;
                    document.getElementById('openTickets').textContent = stats.open;
                    document.getElementById('inProgressTickets').textContent = stats.inProgress;
                    document.getElementById('resolvedTickets').textContent = stats.resolved;
                });
        }
        
        function loadAllTickets() {
            fetch("/api/support/all-tickets", { credentials: "include" })
                .then(res => res.json())
                .then(tickets => {
                    allTickets = tickets;
                    filterTickets();
                });
        }
        
        function filterTickets() {
            let filtered = allTickets;
            if (currentFilter !== "all") {
                filtered = allTickets.filter(t => t.status === currentFilter);
            }
            renderTicketsTable(filtered);
        }
        
        function renderTicketsTable(tickets) {
            const tbody = document.getElementById('ticketsTableBody');
            
            if (tickets.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No tickets found</td></tr>';
                return;
            }
            
            tbody.innerHTML = tickets.map(ticket => `
                <tr onclick="viewTicket(${ticket.id})">
                    <td style="color:var(--theme-accent);">${ticket.ticketId}</td>
                    <td>${escapeHtml(ticket.userId)}</td>
                    <td>${escapeHtml(ticket.subject.substring(0, 40))}${ticket.subject.length > 40 ? '...' : ''}</td>
                    <td><span class="priority-badge priority-${ticket.priority}">${ticket.priority.toUpperCase()}</span></td>
                    <td><span class="ticket-status status-${ticket.status}">${formatStatus(ticket.status)}</span></td>
                    <td>${formatDate(ticket.createdAt)}</td>
                    <td>${ticket.responses.length}</td>
                </tr>
            `).join('');
        }
        
        function viewTicket(ticketId) {
            const modal = document.getElementById('ticketModal');
            const modalContent = document.getElementById('modalContent');
            
            modal.style.display = 'block';
            modalContent.innerHTML = '<div style="text-align:center;">Loading...</div>';
            
            fetch(`/api/support/ticket/${ticketId}`, { credentials: "include" })
                .then(res => res.json())
                .then(ticket => {
                    modalContent.innerHTML = `
                        <h2 style="color:var(--theme-text-primary); margin-bottom:20px;">Ticket: ${ticket.ticketId}</h2>
                        <div style="background:var(--theme-bg-tertiary); padding:15px; border-radius:10px; margin-bottom:20px; color: var(--theme-text-primary);">
                            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; margin-bottom:10px;">
                                <span style="color:var(--theme-accent);">From: ${escapeHtml(ticket.userId)}</span>
                                <span class="ticket-status status-${ticket.status}">${formatStatus(ticket.status)}</span>
                            </div>
                            <div><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</div>
                            <div><strong>Category:</strong> ${escapeHtml(ticket.category)}</div>
                            <div><strong>Priority:</strong> ${ticket.priority.toUpperCase()}</div>
                            <div><strong>Original Message:</strong><br>${escapeHtml(ticket.message)}</div>
                        </div>
                        
                        <h3 style="color:var(--theme-text-primary);">Responses</h3>
                        <div class="response-list">
                            ${ticket.responses.map(resp => `
                                <div class="response-item" style="background:var(--theme-bg-secondary); padding:10px; margin-bottom:10px; border-radius:5px; color: var(--theme-text-primary);">
                                    <div class="response-header" style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9em; color: var(--theme-text-secondary);">
                                        <span>${resp.isAdmin ? '👑 Admin: ' + escapeHtml(resp.userId) : '📱 User: ' + escapeHtml(resp.userId)}</span>
                                        <span>${formatDate(resp.timestamp)}</span>
                                    </div>
                                    <div>${escapeHtml(resp.message)}</div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="response-form" style="margin-top:20px; padding:15px; background:var(--theme-bg-tertiary); border-radius:10px;">
                            <h4 style="color:var(--theme-text-primary); margin-top:0;">Add Response</h4>
                            <textarea id="responseMessage" placeholder="Type your response..." style="width:100%; padding:10px; margin-bottom:10px; background:var(--theme-bg-primary); color:var(--theme-text-primary); border:1px solid var(--theme-border);"></textarea>
                            <div style="margin-bottom:10px;">
                                <select id="statusSelect" class="status-select" style="padding:8px; background:var(--theme-bg-primary); color:var(--theme-text-primary); border:1px solid var(--theme-border);">
                                    <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                                    <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                    <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                                    <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
                                </select>
                            </div>
                            <button class="submit-btn" onclick="submitResponse(${ticket.id})" style="padding:10px 20px; background:var(--theme-accent); color:#fff; border:none; border-radius:5px; cursor:pointer;">Send Response</button>
                        </div>
                    `;
                });
        }
        
        function submitResponse(ticketId) {
            const message = document.getElementById('responseMessage').value.trim();
            const status = document.getElementById('statusSelect').value;
            
            if (!message) {
                alert('Please enter a response');
                return;
            }
            
            fetch(`/api/support/ticket/${ticketId}/respond`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({ message, status })
            }).then(() => {
                alert('Response sent successfully!');
                loadStats();
                loadAllTickets();
                viewTicket(ticketId);
            });
        }

        function loadModerationStats() {
            fetch("/api/moderation/stats", { credentials: "include" })
                .then(res => res.json())
                .then(stats => {
                    document.getElementById("modTotalReports").textContent = stats.total || 0;
                    document.getElementById("modOpenReports").textContent = stats.open || 0;
                    document.getElementById("modReviewingReports").textContent = stats.reviewing || 0;
                    document.getElementById("modResolvedReports").textContent = stats.resolved || 0;
                })
                .catch(() => {
                    document.getElementById("moderationTableBody").innerHTML = '<tr><td colspan="7" style="text-align:center;">Could not load moderation stats</td></tr>';
                });
        }

        function loadModerationReports() {
            fetch("/api/moderation/reports", { credentials: "include" })
                .then(res => res.json())
                .then(reports => {
                    allModerationReports = Array.isArray(reports) ? reports : [];
                    filterModerationReports();
                })
                .catch(() => {
                    document.getElementById("moderationTableBody").innerHTML = '<tr><td colspan="7" style="text-align:center;">Could not load reports</td></tr>';
                });
        }

        function filterModerationReports() {
            const reports = currentModerationFilter === "all"
                ? allModerationReports
                : allModerationReports.filter(report => (report.status || "open") === currentModerationFilter);
            renderModerationReports(reports);
        }

        function renderModerationReports(reports) {
            const tbody = document.getElementById("moderationTableBody");
            if (!tbody) return;

            if (reports.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No reports found</td></tr>';
                return;
            }

            tbody.innerHTML = reports.map(report => {
                const status = report.status || "open";
                const postText = report.post
                    ? escapeHtml((report.post.message || "Media post").slice(0, 90))
                    : "<em>Post unavailable</em>";
                const details = report.details ? `<div class="report-details">${escapeHtml(report.details)}</div>` : "";

                return `
                    <tr class="moderation-row">
                        <td>
                            <strong>#${report.id}</strong>
                            <div class="report-date">${formatDate(report.createdAt)}</div>
                        </td>
                        <td>
                            <span class="priority-badge reason-${escapeHtml(report.reason || "other")}">${escapeHtml(report.reason || "other")}</span>
                            ${details}
                        </td>
                        <td>${escapeHtml(report.reporter || "unknown")}</td>
                        <td>${escapeHtml(report.author || "unknown")}</td>
                        <td>${postText}</td>
                        <td><span class="ticket-status status-${status}">${formatStatus(status)}</span></td>
                        <td>
                            <div class="moderation-actions">
                                <button onclick="updateModerationReport(${report.id}, 'mark_reviewing')">Review</button>
                                <button onclick="updateModerationReport(${report.id}, 'dismiss')">Dismiss</button>
                                <button onclick="updateModerationReport(${report.id}, 'hide_post')">Hide</button>
                                <button class="danger" onclick="updateModerationReport(${report.id}, 'delete_post')">Delete</button>
                                <button class="danger" onclick="updateModerationReport(${report.id}, 'block_author')">Block Author</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        function updateModerationReport(reportId, action) {
            const destructive = action === "delete_post" || action === "block_author";
            if (destructive && !confirm("This moderation action is destructive. Continue?")) return;
            const note = prompt("Moderator note (optional):", "") || "";

            fetch(`/api/moderation/reports/${reportId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                },
                credentials: "include",
                body: JSON.stringify({ action, note })
            })
                .then(async res => {
                    if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || "Moderation action failed");
                    }
                    return res.json();
                })
                .then(() => {
                    loadModerationStats();
                    loadModerationReports();
                })
                .catch(err => alert(err.message || "Moderation action failed"));
        }
        
        function formatStatus(status) {
            const map = { 'open': 'Open', 'in_progress': 'In Progress', 'reviewing': 'Reviewing', 'resolved': 'Resolved', 'dismissed': 'Dismissed', 'closed': 'Closed' };
            return map[status] || status;
        }
        
        function formatDate(timestamp) {
            return new Date(timestamp).toLocaleString();
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function closeTicketModal() {
            document.getElementById('ticketModal').style.display = 'none';
        }
        
        document.querySelectorAll('.filter-btn:not(.mod-filter)').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn:not(.mod-filter)').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                filterTickets();
            });
        });

        document.querySelectorAll('.mod-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mod-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentModerationFilter = btn.dataset.modFilter || "all";
                filterModerationReports();
            });
        });
        
        window.onclick = function(event) {
            const modal = document.getElementById('ticketModal');
            if (event.target === modal) modal.style.display = 'none';
        }
        
        // Initialize
        checkAdminAuth();

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
    const currentPage = window.location.pathname.split('/').pop() || 'admin-support.html';
    
    // Get all sidebar links
    const navLinks = document.querySelectorAll('.sidebar a');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Remove old active classes first
      link.classList.remove('active', 'sidebar-item-active');
      
      // Check if this link matches the current page
      // We handle root directory (./) vs specific files (./directs.html)
      if (href === './admin-support.html' && (currentPage === '' || currentPage === 'admin-support.html')) {
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
      if (href === './admin-support.html' && (currentPage === '' || currentPage === 'admin-support.html')) {
        link.classList.add('active');
      } else if (href === `./${currentPage}`) {
        link.classList.add('active');
      }
    });
  });
