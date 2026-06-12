let currentSessionUsername = "";
let chatTargetUser = "";
let currentGroupId = "";
let currentGroupData = null;
let csrfToken = "";
let messageInterval = null;
let groupMessageInterval = null;
let onlineUsers = new Set();
let isPremium = false;
let shouldScrollToBottom = true;
let pfpCache = {};
let totalUnreadCount = 0;
let dmMessageCache = [];
let chatSearchQuery = "";
let activeDmReply = null;
let chatSearchRequestId = 0;
let chatSearchTimer = null;
let slashSocket = null;
let realtimeConnected = false;
let dmTypingTimer = null;
let groupTypingTimer = null;
let remoteTypingTimers = new Map();

// Global variables for menu tracking
let contextMenuTargetId = null;
let contextMenuTargetType = null; // 'dm' or 'group'

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeJsString(value) {
    return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isActiveDmMessage(msg) {
    return chatTargetUser && !msg.groupId && (
        (msg.sender === currentSessionUsername && msg.receiver === chatTargetUser) ||
        (msg.sender === chatTargetUser && msg.receiver === currentSessionUsername)
    );
}

function scheduleFallbackPolling() {
    if (realtimeConnected) return;
    if (chatTargetUser && !messageInterval) messageInterval = setInterval(loadMessages, 2000);
    if (currentGroupId && !groupMessageInterval) {
        groupMessageInterval = setInterval(() => {
            loadGroupMessages();
            updateGroupMemberCount();
        }, 2000);
    }
}

function clearChatPolling() {
    if (messageInterval) {
        clearInterval(messageInterval);
        messageInterval = null;
    }
    if (groupMessageInterval) {
        clearInterval(groupMessageInterval);
        groupMessageInterval = null;
    }
}

function joinActiveRealtimeRoom() {
    if (!slashSocket?.connected) return;
    if (chatTargetUser) slashSocket.emit("chat:join", { user: chatTargetUser });
    if (currentGroupId) slashSocket.emit("chat:join", { groupId: currentGroupId });
}

function showTypingIndicator(elementId, text, key) {
    const indicator = document.getElementById(elementId);
    if (!indicator) return;
    indicator.textContent = text;
    if (remoteTypingTimers.has(key)) clearTimeout(remoteTypingTimers.get(key));
    remoteTypingTimers.set(key, setTimeout(() => {
        indicator.textContent = "";
        remoteTypingTimers.delete(key);
    }, 2600));
}

function emitTyping(target, groupId, isTyping) {
    if (!slashSocket?.connected) return;
    slashSocket.emit("chat:typing", { target, groupId, isTyping });
}

function installTypingEmitter(inputId, getPayload) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("input", () => {
        const payload = getPayload();
        if (!payload) return;
        emitTyping(payload.target, payload.groupId, true);
        const timerName = payload.groupId ? "group" : "dm";
        if (timerName === "group" && groupTypingTimer) clearTimeout(groupTypingTimer);
        if (timerName === "dm" && dmTypingTimer) clearTimeout(dmTypingTimer);
        const timer = setTimeout(() => emitTyping(payload.target, payload.groupId, false), 1200);
        if (timerName === "group") groupTypingTimer = timer;
        else dmTypingTimer = timer;
    });
}

function initRealtime() {
    if (slashSocket || typeof io !== "function") {
        scheduleFallbackPolling();
        return;
    }

    slashSocket = io({ withCredentials: true });

    slashSocket.on("connect", () => {
        realtimeConnected = true;
        clearChatPolling();
        joinActiveRealtimeRoom();
        slashSocket.emit("presence:ping");
    });

    slashSocket.on("disconnect", () => {
        realtimeConnected = false;
        scheduleFallbackPolling();
    });

    slashSocket.on("presence:update", payload => {
        onlineUsers = new Set(Array.isArray(payload?.users) ? payload.users : []);
        updateGroupMemberCount();
        if (!chatTargetUser && !currentGroupId) {
            loadDmList();
            loadGroupList();
        }
    });

    slashSocket.on("dm:message", msg => {
        if (isActiveDmMessage(msg)) {
            shouldScrollToBottom = true;
            loadMessages();
            fetch("/api/directs/read", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
                credentials: "include",
                body: JSON.stringify({ otherUser: chatTargetUser })
            }).catch(() => {});
        } else {
            loadDmList();
        }
    });

    slashSocket.on("group:message", msg => {
        if (msg.groupId === currentGroupId) {
            shouldScrollToBottom = true;
            loadGroupMessages();
        } else {
            loadGroupList();
        }
    });

    slashSocket.on("message:reaction", msg => {
        if (msg.groupId && msg.groupId === currentGroupId) loadGroupMessages();
        else if (isActiveDmMessage(msg)) loadMessages();
    });

    slashSocket.on("message:edited", msg => {
        if (msg.groupId && msg.groupId === currentGroupId) loadGroupMessages();
        else if (isActiveDmMessage(msg)) loadMessages();
    });

    slashSocket.on("message:deleted", msg => {
        if (msg.groupId && msg.groupId === currentGroupId) loadGroupMessages();
        else if (isActiveDmMessage(msg)) loadMessages();
        else loadDmList();
    });

    slashSocket.on("dm:read", payload => {
        if (!chatTargetUser || payload?.reader !== chatTargetUser) return;
        dmMessageCache = dmMessageCache.map(msg => (
            msg.sender === currentSessionUsername && msg.receiver === chatTargetUser
                ? { ...msg, status: "read" }
                : msg
        ));
        renderDmMessages(dmMessageCache);
    });

    slashSocket.on("chat:typing", payload => {
        if (!payload?.isTyping || payload.user === currentSessionUsername) return;
        if (payload.groupId && payload.groupId === currentGroupId) {
            showTypingIndicator("groupTypingIndicator", `${payload.user} is typing...`, `group:${payload.groupId}:${payload.user}`);
        } else if (payload.user === chatTargetUser) {
            showTypingIndicator("dmTypingIndicator", `${payload.user} is typing...`, `dm:${payload.user}`);
        }
    });

    slashSocket.on("connect_error", () => {
        realtimeConnected = false;
        scheduleFallbackPolling();
    });
}

// 1. Context Menu (Right Click)
document.addEventListener('contextmenu', function(e) {
    const bubble = e.target.closest('.bubble');
    if (bubble) {
        e.preventDefault(); // Stop default browser menu
        
        // Fix: Ensure we grab the ID regardless of whether it's DM or Group
        contextMenuTargetId = bubble.dataset.messageId;
        contextMenuTargetType = bubble.dataset.type; // 'dm' or 'group'
        
        const menu = document.getElementById('contextMenu');
        menu.style.display = 'block';
        
        // Position menu
        let x = e.pageX;
        let y = e.pageY;
        
        // Keep menu on screen
        if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
        if (y + 100 > window.innerHeight) y = window.innerHeight - 110;
        
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }
});

// Close menu when clicking anywhere else
document.addEventListener('click', function(e) {
    const menu = document.getElementById('contextMenu');
    const picker = document.getElementById('emojiPicker');
    
    // Close Context Menu
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
    
    // Close Emoji Picker
    if (picker.style.display === 'grid' && !picker.contains(e.target) && !e.target.closest('.reaction-bar')) {
        picker.style.display = 'none';
    }
});

// Handle Menu Actions
document.querySelectorAll('#contextMenu .menu-item').forEach(item => {
    item.addEventListener('click', async function(e) {
        e.stopPropagation();
        const action = this.dataset.action;
        document.getElementById('contextMenu').style.display = 'none';
        
        if (action === 'delete') {
            if(!confirm("Delete this message?")) return;
            await deleteMessage(contextMenuTargetId, contextMenuTargetType);
        } else if (action === 'reply') {
            handleReply(contextMenuTargetType);
        } else if (action === 'forward') {
            alert("Forward feature coming soon!");
        } else if (action === 'edit') {
            openEditModal(contextMenuTargetId, contextMenuTargetType);
        }
    });
});

// --- NEW REPLY LOGIC ---
function handleReply(type) {
    const inputId = type === 'group' ? 'groupDmInput' : 'dmInput';
    const input = document.getElementById(inputId);
    
    // Find the bubble in the DOM to get sender and text
    const bubble = document.querySelector(`.bubble[data-message-id="${contextMenuTargetId}"][data-type="${type}"]`);
    if (!bubble) return;

    let senderName = type === 'dm' ? chatTargetUser : 'User';
    let originalText = bubble.innerText.trim();
    
    // Clean up the text to remove timestamp/status icons if they are in the DOM
    const metaSpan = bubble.querySelector('.message-meta');
    if (metaSpan) originalText = originalText.replace(metaSpan.innerText, '').trim();
    
    // Remove the sender name from the start if it exists in the text
    // (In groups, sender name is usually a separate div, but let's be safe)
    if (type === 'group') {
        const senderDiv = bubble.querySelector('.sender-name');
        if (senderDiv) {
             senderName = senderDiv.innerText.replace('@', '');
             // We reconstruct the text manually to be safe
             originalText = bubble.innerText.replace(senderDiv.innerText, '').replace(metaSpan ? metaSpan.innerText : '', '').trim();
        }
    }

    if (type === 'dm') {
        const message = dmMessageCache.find(item => String(item.id) === String(contextMenuTargetId));
        activeDmReply = {
            id: contextMenuTargetId,
            sender: message?.sender || senderName,
            message: message?.message || originalText,
            mediaName: message?.mediaName || null
        };
        updateDmReplyPreview();
    } else {
        input.value = `@${senderName} `;
    }
    input.focus();
}

function updateDmReplyPreview() {
    const preview = document.getElementById("dmReplyPreview");
    if (!preview) return;

    if (!activeDmReply) {
        preview.hidden = true;
        preview.innerHTML = "";
        return;
    }

    const text = activeDmReply.message || activeDmReply.mediaName || "Attachment";
    preview.hidden = false;
    preview.innerHTML = `
        <div class="dm-reply-preview-content">
            <span class="dm-reply-label">Replying to ${escapeHtml(activeDmReply.sender)}</span>
            <span class="dm-reply-text">${escapeHtml(text)}</span>
        </div>
        <button type="button" class="dm-reply-cancel" onclick="clearDmReply()" aria-label="Cancel reply">x</button>
    `;
}

function clearDmReply() {
    activeDmReply = null;
    updateDmReplyPreview();
}

// --- NEW EDIT LOGIC ---
function openEditModal(messageId, type) {
    const modal = document.getElementById('editModal');
    const textarea = document.getElementById('editMessageText');
    
    // Find the bubble to extract current text
    const bubble = document.querySelector(`.bubble[data-message-id="${messageId}"][data-type="${type}"]`);
    if (!bubble) return;

    let text = bubble.innerText.trim();
    
    // Remove timestamp
    const meta = bubble.querySelector('.message-meta');
    if (meta) text = text.replace(meta.innerText, '').trim();
    
    // Remove sender name if present (Groups)
    const senderNameDiv = bubble.querySelector('.sender-name');
    if (senderNameDiv) text = text.replace(senderNameDiv.innerText, '').trim();

    textarea.value = text;
    modal.classList.add('active');
    
    // Store current ID and Type for saving
    modal.dataset.messageId = messageId;
    modal.dataset.type = type;
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

async function saveEditMessage() {
    const modal = document.getElementById('editModal');
    const newText = document.getElementById('editMessageText').value.trim();
    const messageId = modal.dataset.messageId;
    const type = modal.dataset.type;

    if (!newText) return alert("Message cannot be empty");

    try {
        const response = await fetch(`/api/directs/edit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken
            },
            credentials: "include",
            body: JSON.stringify({
                messageId: messageId,
                newMessage: newText,
                type: type // 'dm' or 'group'
            })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || "Edit failed");
        }
        
        closeEditModal();
        if (type === 'dm') loadMessages();
        else loadGroupMessages();
        
    } catch (err) {
        console.error("Edit failed", err);
        alert(err.message || "Failed to edit message.");
    }
}

// 2. Reaction Bar Clicks
document.addEventListener('click', async function(e) {
    const btn = e.target.closest('.reaction-bar button:not(.reaction-trigger)');
    if (btn) {
        const messageId = btn.dataset.messageId;
        const emoji = btn.dataset.emoji;
        const type = btn.dataset.type;
        
        const bar = btn.closest('.reaction-bar');
        // Check if badge already exists to toggle off
        const badge = bar.nextElementSibling?.querySelector(`.reaction-badge[data-emoji="${emoji}"]`);
        
        if (badge) {
            // Remove reaction
            badge.remove();
            await reactMessage(messageId, emoji, 'remove', type);
        } else {
            // Add reaction
            const badgeHtml = `<div class="reaction-badge" data-emoji="${emoji}" onclick="removeReaction('${messageId}', '${emoji}', '${type}')">${emoji} 1</div>`;
            bar.insertAdjacentHTML('afterend', badgeHtml);
            await reactMessage(messageId, emoji, 'add', type);
        }
    }
});

// 3. Emoji Picker Trigger
document.addEventListener('click', function(e) {
    const trigger = e.target.closest('.reaction-trigger');
    if (trigger) {
        const picker = document.getElementById('emojiPicker');
        const rect = trigger.getBoundingClientRect();
        
        picker.style.display = 'grid';
        picker.style.left = `${rect.left}px`;
        picker.style.top = `${rect.bottom + 5}px`;
        
        const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉', '🤔', '👀', '🙏', '💯'];
        picker.innerHTML = commonEmojis.map(emoji =>
            `<button type="button" data-emoji="${emoji}" data-message-id="${trigger.dataset.messageId}" data-type="${trigger.dataset.type}">${emoji}</button>`
        ).join('');
        
        picker.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const emoji = btn.dataset.emoji;
                const messageId = btn.dataset.messageId;
                const type = btn.dataset.type;
                
                await reactMessage(messageId, emoji, 'add', type);
                picker.style.display = 'none';
                
                // Refresh UI
                if(type === 'dm') loadMessages();
                else loadGroupMessages();
            });
        });
    }
});

// Helper: Remove reaction when clicking the badge
window.removeReaction = async function(messageId, emoji, type) {
    await reactMessage(messageId, emoji, 'remove', type);
    // Update UI immediately without full reload
    // Note: The selector logic here might need adjustment depending on how badges are nested
    const badges = document.querySelectorAll(`.reaction-badge[data-emoji="${emoji}"]`);
    badges.forEach(badge => {
        if(badge.getAttribute('onclick').includes(messageId)) {
            badge.remove();
        }
    });
};

// API Call for Reaction
async function reactMessage(messageId, emoji, action, type) {
    try {
        await fetch("/api/directs/react", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
            credentials: "include",
            body: JSON.stringify({ messageId, emoji, action, type })
        });
    } catch (err) {
        console.error("Reaction failed", err);
    }
}

// API Call for Delete
async function deleteMessage(messageId, type) {
   try {
       await fetch(`/api/directs/${messageId}`, {
           method: "DELETE",
           headers: { "X-CSRF-Token": csrfToken },
           credentials: "include"
       });
       if(type === 'dm') loadMessages();
       else loadGroupMessages();
   } catch(e) {
       console.error("Delete failed", e);
       alert("Could not delete message.");
   }
}

// Get URL Params
const urlParams = new URLSearchParams(window.location.search);
const targetUserParam = urlParams.get('user');
const targetGroupParam = urlParams.get('group');

// ... inside your <script> tag ...

// Global variable to track unread counts for the badge


function loadDmList() {
    document.getElementById("userListView").style.display = "flex";
    document.getElementById("chatInterfaceView").style.display = "none";
    document.getElementById("groupChatInterfaceView").style.display = "none";
    
    const listContainer = document.getElementById("dmList");
    
    // Fetch list of users and their latest messages
    fetch("/api/directs/list", { credentials: "include" })
        .then(res => res.json())
        .then(users => {
            if (!Array.isArray(users)) {
                users = [];
            }
            listContainer.innerHTML = "";
            
            if (users.length === 0) {
                listContainer.innerHTML = "<div class='dm-empty-state'>No Users Available In Direct Messages, Start Chatting!</div>";
                updateBadge(0);
                return;
            }

            // Sort users: Unread first, then by last message time (newest first)
            users.sort((a, b) => {
                // If one has unread and other doesn't, unread comes first
                if (a.hasUnread && !b.hasUnread) return -1;
                if (!a.hasUnread && b.hasUnread) return 1;
                
                // If both have same unread status, sort by timestamp (newest first)
                // Assuming the API returns a 'lastMessageTimestamp' or similar. 
                // If not, we can use the 'lastMessage' object's timestamp if available.
                // For this implementation, let's assume the API provides 'lastMessageTimestamp' 
                // or we fallback to sorting by the object itself if needed.
                // Since we don't know the exact API response structure, I will assume standard object sort.
                // Let's rely on the 'hasUnread' flag for priority.
                
                // If you have timestamps in the API response:
                // return (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0);
                
                // Fallback: No specific time sort if API doesn't provide it, just keep order
                return 0;
            });

            users.forEach(u => {
                const div = document.createElement("div");
                div.className = `dm-list-item ${u.hasUnread ? 'unread' : ''}`;
                
                // Extract last message details if available
                const lastMsg = u.lastMessage || "";
                const lastMsgSender = u.lastMessageSender || "";
                const lastMsgTime = u.lastMessageTime || "";
                const hasUnread = u.hasUnread || false;

                div.innerHTML = `
                    <img src="${u.pfp || 'favicon.ico'}" alt="${u.username}">
                    <div class="dm-list-content">
                        <div class="dm-list-username">${u.username} ${hasUnread ? '<span style="color:#667eea;font-size:0.8rem;">●</span>' : ''}</div>
                        <div class="dm-list-meta">
                            <div>
                                ${lastMsgSender ? `<span class="dm-list-sender">${lastMsgSender}:</span>` : ''}
                                <span class="dm-list-preview">${lastMsg || 'No messages yet'}</span>
                            </div>
                            <span class="dm-list-time">${lastMsgTime}</span>
                        </div>
                    </div>
                `;
                
                div.onclick = () => window.location.href = `./directs.html?user=${encodeURIComponent(u.username)}`;
                listContainer.appendChild(div);
            });

            // Update Badge
            totalUnreadCount = users.filter(u => u.hasUnread).length;
            updateBadge(totalUnreadCount);
        })
        .catch(err => {
            console.error("Error loading DM list:", err);
            listContainer.innerHTML = "<div class='dm-empty-state'>Error loading messages.</div>";
        });
}

// Helper to update the badge text and visibility
function updateBadge(count) {
    const badge = document.getElementById('dm-badge');
    if (!badge) return;
    
    if (count > 0) {
        badge.style.display = 'inline-flex';
        if (count > 999) {
            badge.textContent = '999+';
        } else {
            badge.textContent = count;
        }
    } else {
        badge.style.display = 'none';
    }
}

// Make the badge clickable to switch tabs if on groups view
document.getElementById('dm-badge')?.addEventListener('click', function(e) {
    e.stopPropagation();
    switchDmTab('dms');
});

// ... keep the rest of your functions ...

// Modify checkAuth to ensure loadDmList is called correctly if no params
// In your existing checkAuth function, ensure it calls loadDmList if no params
// Here is the updated DOMContentLoaded logic to integrate with the new features:

document.addEventListener("DOMContentLoaded", () => {
    fetch("/csrf-token").then(r=>r.json()).then(d=> { csrfToken = d.csrfToken; });
    checkAuth().then(() => {
        initRealtime();
        installTypingEmitter("dmInput", () => chatTargetUser ? { target: chatTargetUser } : null);
        installTypingEmitter("groupDmInput", () => currentGroupId ? { groupId: currentGroupId } : null);
        // Start heartbeat for online status
        setInterval(sendHeartbeat, 30000);
        sendHeartbeat();
        if (targetGroupParam) {
            loadGroupChat(targetGroupParam);
        } else if (targetUserParam) {
            checkUserAndLoad(targetUserParam);
        } else {
            loadDmList(); // This now handles sorting and badges
            loadGroupList();
        }
    });
});

// ... rest of your code ...
function sendHeartbeat() {
    fetch("/api/heartbeat", {
        method: "POST",
        credentials: "include"
    }).catch(() => {});
}

function checkAuth() {
  return fetch("/session", { credentials: "include" })
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
      currentSessionUsername = user.username;
      // Load the user's theme settings
      loadUserTheme(currentSessionUsername);
    })
    .catch(() => {
      window.location.href = "./index.html";
    });
}

function switchDmTab(tab) {
    // Update Tab Buttons UI
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    // Find the button that was clicked or matches the tab
    const buttons = document.querySelectorAll('.tab-btn');
    if (tab === 'dms') buttons[0].classList.add('active');
    else buttons[1].classList.add('active');

    const dmsSection = document.getElementById('dmList');
    const groupsSection = document.getElementById('groupsSection');

    if (tab === 'dms') {
        if (dmsSection) dmsSection.style.display = "block";
        if (groupsSection) groupsSection.style.display = "none";
        loadDmList(); // Ensure DMs are refreshed
    } else {
        if (dmsSection) dmsSection.style.display = "none";
        if (groupsSection) groupsSection.style.display = "block";
        updateGroupCreateAccess();
        loadGroupList(); // Ensure Groups are refreshed
    }
}

function canCreateGroups() {
    const username = currentSessionUsername || "";
    return isPremium === true || /^\/admin\d*$/i.test(username) || username === "/cyberslash";
}

function updateGroupCreateAccess() {
    const createBtn = document.getElementById("createGroupBtn");
    const hint = document.getElementById("groupCreateHint");
    const allowed = canCreateGroups();
    if (createBtn) createBtn.style.display = allowed ? "inline-flex" : "none";
    if (hint) {
        hint.textContent = allowed
            ? "Create a private space for selected members."
            : "Group creation is reserved for premium members.";
    }
}

// --- LIST VIEW LOGIC ---
function loadDmList() {
    document.getElementById("userListView").style.display = "flex";
    document.getElementById("chatInterfaceView").style.display = "none";
    document.getElementById("groupChatInterfaceView").style.display = "none";
    
    const listContainer = document.getElementById("dmListContainer") || document.getElementById("dmList");
    
    // Fetch list of users and their latest messages
    fetch("/api/directs/list", { credentials: "include" })
        .then(res => res.json())
        .then(users => {
            if (!Array.isArray(users)) {
                users = [];
            }
            listContainer.innerHTML = "";
            
            if (users.length === 0) {
                listContainer.innerHTML = "<div class='dm-empty-state'>No Users Available In Direct Messages, Start Chatting!</div>";
                updateBadge(0);
                return;
            }

            // Sort users: Unread first, then by last message time (newest first)
            users.sort((a, b) => {
                // If one has unread and other doesn't, unread comes first
                if (a.hasUnread && !b.hasUnread) return -1;
                if (!a.hasUnread && b.hasUnread) return 1;
                
                // If both have same unread status, sort by timestamp (newest first)
                // Assuming the API returns a 'lastMessageTimestamp' or similar. 
                // If not, we can use the 'lastMessage' object's timestamp if available.
                // For this implementation, let's assume the API provides 'lastMessageTimestamp' 
                // or we fallback to sorting by the object itself if needed.
                // Since we don't know the exact API response structure, I will assume standard object sort.
                // Let's rely on the 'hasUnread' flag for priority.
                
                // If you have timestamps in the API response:
                // return (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0);
                
                // Fallback: No specific time sort if API doesn't provide it, just keep order
                return 0;
            });

            users.forEach(u => {
                const div = document.createElement("div");
                div.className = `dm-list-item ${u.hasUnread ? 'unread' : ''}`;
                
                // Extract last message details if available
                const lastMsg = u.lastMessage || "";
                const lastMsgSender = u.lastMessageSender || "";
                const lastMsgTime = u.lastMessageTime || "";
                const hasUnread = u.hasUnread || false;

                div.innerHTML = `
                    <img src="${u.pfp || 'favicon.ico'}" alt="${u.username}">
                    <div class="dm-list-content">
                        <div class="dm-list-username">${u.username} ${hasUnread ? '<span style="color:#667eea;font-size:0.8rem;">●</span>' : ''}</div>
                        <div class="dm-list-meta">
                            <div>
                                ${lastMsgSender ? `<span class="dm-list-sender">${lastMsgSender}:</span>` : ''}
                                <span class="dm-list-preview">${lastMsg || 'No messages yet'}</span>
                            </div>
                            <span class="dm-list-time">${lastMsgTime}</span>
                        </div>
                    </div>
                `;
                
                div.onclick = () => window.location.href = `./directs.html?user=${encodeURIComponent(u.username)}`;
                listContainer.appendChild(div);
            });

            // Update Badge
            totalUnreadCount = users.filter(u => u.hasUnread).length;
            updateBadge(totalUnreadCount);
        })
        .catch(err => {
            console.error("Error loading DM list:", err);
            listContainer.innerHTML = "<div class='dm-empty-state'>Error loading messages.</div>";
        });
}

function updateBadge(count) {
    const badge = document.getElementById('dm-badge');
    if (!badge) return;
    
    if (count > 0) {
        badge.style.display = 'inline-flex';
        if (count > 999) {
            badge.textContent = '999+';
        } else {
            badge.textContent = count;
        }
    } else {
        badge.style.display = 'none';
    }
}

document.getElementById('dm-badge')?.addEventListener('click', function(e) {
    e.stopPropagation();
    switchDmTab('dms');
});

// --- GROUP LIST LOGIC ---
function loadGroupList() {
    const listContainer = document.getElementById("groupList");
    if (!listContainer) return;
    fetch("/api/groups/list", { credentials: "include" })
        .then(res => res.json())
        .then(groups => {
            if (!Array.isArray(groups)) groups = [];
            listContainer.innerHTML = "";
            if (groups.length === 0) {
                listContainer.innerHTML = `<div class='dm-empty-state'>${canCreateGroups() ? "No groups yet. Create your first group." : "No groups yet. Premium members can create groups."}</div>`;
            } else {
                groups.forEach(g => {
                    const div = document.createElement("div");
                    div.className = "group-list-item";
                    const safeName = escapeHtml(g.name || "Group");
                    const members = Array.isArray(g.members) ? g.members : [];
                    const initial = (g.name || "G").charAt(0).toUpperCase();
                    
                    // Count online members
                    const onlineCount = members.filter(m => onlineUsers.has(m.username)).length;
                    
                    div.innerHTML = `
                        <div class="group-avatar">
                            ${initial}
                            ${onlineCount > 0 ? '<div class="online-dot"></div>' : ''}
                        </div>
                        <div class="group-info">
                            <div class="group-name">${safeName}</div>
                            <div class="group-members-count">${members.length} members</div>
                            ${onlineCount > 0 ? `<div class="online-count">${onlineCount} online</div>` : ''}
                        </div>
                    `;
                    div.onclick = () => window.location.href = `./directs.html?group=${g.id}`;
                    listContainer.appendChild(div);
                });
            }
        });
}

// --- CREATE GROUP ---
function openCreateGroupModal() {
    if (!canCreateGroups()) {
        alert("Only premium members can create groups.");
        return;
    }
    document.getElementById("createGroupModal").classList.add("active");
    loadUsersForGroupCreation();
}

function closeCreateGroupModal() {
    document.getElementById("createGroupModal").classList.remove("active");
}

function loadUsersForGroupCreation() {
    fetch("/api/users/all", { credentials: "include" })
        .then(res => res.json())
        .then(users => {
            const container = document.getElementById("memberSelectList");
            container.innerHTML = users
                .filter(u => u.username !== currentSessionUsername)
                .map(u => `
                    <label class="member-option">
                        <input type="checkbox" value="${u.username}" data-pfp="${u.pfp || ''}">
                        <img src="${u.pfp || 'favicon.ico'}" style="width:25px;height:25px;border-radius:50%;">
                        <span style="color:white;">${u.username}</span>
                    </label>
                `).join('');
        });
}

function createGroup() {
    if (!canCreateGroups()) {
        alert("Only premium members can create groups.");
        return;
    }
    const name = document.getElementById("groupNameInput").value.trim();
    if (!name) {
        alert("Please enter a group name");
        return;
    }
    
    const selectedMembers = Array.from(document.querySelectorAll('#memberSelectList input:checked'))
        .map(input => input.value);
    
    if (selectedMembers.length === 0) {
        alert("Please select at least one member");
        return;
    }
    
    if (selectedMembers.length > 9) {
        alert("Maximum 9 members allowed (plus you = 10)");
        return;
    }
    
    fetch("/api/groups/create", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        credentials: "include",
        body: JSON.stringify({
            name: name,
            members: selectedMembers
        })
    })
    .then(res => res.json())
    .then(data => {
        closeCreateGroupModal();
        loadGroupList();
        window.location.href = `./directs.html?group=${data.groupId}`;
    })
    .catch(err => {
        console.error("Error creating group:", err);
        alert("Failed to create group");
    });
}

// --- GROUP CHAT LOGIC ---
function loadGroupChat(groupId) {
    if (groupMessageInterval) clearInterval(groupMessageInterval);
    document.getElementById("userListView").style.display = "none";
    document.getElementById("chatInterfaceView").style.display = "none";
    document.getElementById("groupChatInterfaceView").style.display = "flex";
    
    currentGroupId = groupId;
    joinActiveRealtimeRoom();
    
    fetch(`/api/groups/${groupId}`, { credentials: "include" })
        .then(res => {
            if (!res.ok) throw new Error("Group not found");
            return res.json();
        })
        .then(group => {
            currentGroupData = group;
            document.getElementById("groupHeaderName").textContent = group.name;
            document.getElementById("groupHeaderAvatar").textContent = group.name.charAt(0).toUpperCase();
            
            updateGroupMemberCount();
            
            loadGroupMessages();
            if (!realtimeConnected) {
                groupMessageInterval = setInterval(() => {
                    loadGroupMessages();
                    updateGroupMemberCount();
                }, 2000);
            }
        })
        .catch(err => {
            console.error("Error loading group:", err);
            window.location.href = "./directs.html";
        });
}

function updateGroupMemberCount() {
    if (!currentGroupId) return;
    fetch(`/api/groups/${currentGroupId}`, { credentials: "include" })
        .then(res => res.json())
        .then(group => {
            currentGroupData = group;
            const totalMembers = group.members.length;
            const onlineCount = group.members.filter(m => onlineUsers.has(m.username)).length;
            
            document.getElementById("groupMemberCount").textContent = `${totalMembers} members`;
            document.getElementById("groupOnlineCount").textContent = onlineCount > 0 ? `• ${onlineCount} online` : '';
        });
}

function loadGroupMessages() {
    fetch(`/api/groups/${currentGroupId}/messages`, { credentials: "include" })
        .then(res => res.json())
        .then(msgs => {
            const chatBox = document.getElementById("groupChatMessages");
            chatBox.innerHTML = "";
            
            msgs.forEach(msg => {
                const isMe = msg.sender === currentSessionUsername;
                const row = document.createElement("div");
                row.className = `message-row ${isMe ? 'self' : 'other'}`;
                
                const date = new Date(msg.timestamp);
                const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                let reactionsHtml = '';
                if (msg.reactions) {
                    Object.entries(msg.reactions).forEach(([emoji, users]) => {
                        if(users.length > 0) {
                            const safeEmoji = escapeHtml(emoji);
                            const safeEmojiAttr = escapeAttribute(emoji);
                            const safeEmojiJs = escapeJsString(emoji);
                            reactionsHtml += `<div class="reaction-badge" data-emoji="${safeEmojiAttr}" onclick="removeReaction('${msg.id}', '${safeEmojiJs}', 'group')">
                                ${safeEmoji} ${users.length}
                            </div>`;
                        }
                    });
                }
                // Sender Name for Group (Only show if not me)
                const senderName = isMe ? '' :
                    `<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
                        <span style="color:#667eea;font-size:0.75rem;font-weight:bold;">${escapeHtml(msg.sender)}</span>
                     </div>`;
                row.innerHTML = `
                    <img src="${escapeAttribute(msg.senderPfp || 'favicon.ico')}" style="width:30px;height:30px;border-radius:50%;margin:0 10px;">
                    <div class="bubble" data-message-id="${msg.id}" data-type="group">
                        ${senderName}
                        ${escapeHtml(msg.message)}
                        <div class="message-meta">
                            <span>${timeString}</span>
                        </div>
                        ${reactionsHtml ? `<div class="active-reactions">${reactionsHtml}</div>` : ''}
                    </div>
                    <div class="reaction-bar">
                        <button class="reaction-trigger" data-message-id="${msg.id}" data-type="group">+</button>
                        <button data-message-id="${msg.id}" data-type="group" data-emoji="👍">👍</button>
                        <button data-message-id="${msg.id}" data-type="group" data-emoji="❤️">❤️</button>
                        <button data-message-id="${msg.id}" data-type="group" data-emoji="😂">😂</button>
                        <button data-message-id="${msg.id}" data-type="group" data-emoji="🔥">🔥</button>
                    </div>
                `;
                chatBox.appendChild(row);
            });
            
            const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100;
            if (shouldScrollToBottom || isAtBottom) {
                chatBox.scrollTop = chatBox.scrollHeight;
                shouldScrollToBottom = false;
            }
        });
}

// Add scroll event listeners to detect when user scrolls up
document.getElementById("chatMessages").addEventListener("scroll", function() {
    const chatBox = document.getElementById("chatMessages");
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100;
    if (!isAtBottom) {
        shouldScrollToBottom = false;
    }
});
document.getElementById("groupChatMessages").addEventListener("scroll", function() {
    const chatBox = document.getElementById("groupChatMessages");
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100;
    if (!isAtBottom) {
        shouldScrollToBottom = false;
    }
});

function sendGroupDm() {
    const input = document.getElementById("groupDmInput");
    const text = input.value.trim();
    if (!text) return;
    
    fetch("/api/groups/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        credentials: "include",
        body: JSON.stringify({
            groupId: currentGroupId,
            message: text
        })
    })
    .then(res => res.json())
    .then(newMsg => {
        if (newMsg) {
            input.value = "";
            shouldScrollToBottom = true; // Force scroll after sending
            if (!realtimeConnected) loadGroupMessages();
        }
    });
}

// Group settings
function openGroupSettings() {
    document.getElementById("groupSettingsModal").classList.add("active");
    loadGroupMembers();
}

function closeGroupSettings() {
    document.getElementById("groupSettingsModal").classList.remove("active");
}

function loadGroupMembers() {
    fetch(`/api/groups/${currentGroupId}`, { credentials: "include" })
        .then(res => res.json())
        .then(group => {
            currentGroupData = group;
            const isCreator = group.createdBy === currentSessionUsername;
            const container = document.getElementById("groupMembersList");
            
            container.innerHTML = group.members.map(m => {
                const isOnline = onlineUsers.has(m.username);
                const isMe = m.username === currentSessionUsername;
                const isMemberCreator = m.username === group.createdBy;
                
                let removeBtn = '';
                if (isCreator && !isMe) {
                    removeBtn = `<button class="remove-member-btn" onclick="removeMember('${m.username}')">Remove</button>`;
                }
                
                return `
                    <div class="group-member-badge">
                        <div class="group-member-info">
                            <img src="${m.pfp || 'favicon.ico'}">
                            <div>
                                <span class="group-member-name">${m.username}</span>
                                ${isMe ? '<span class="group-member-you">(You)</span>' : ''}
                                ${isMemberCreator ? '<span class="group-member-creator">👑 Creator</span>' : ''}
                            </div>
                        </div>
                        <span class="${isOnline ? 'online-indicator' : 'offline-indicator'}"></span>
                        ${removeBtn}
                    </div>
                `;
            }).join('');
        });
}

function removeMember(memberUsername) {
    if (!confirm(`Are you sure you want to remove ${memberUsername} from the group?`)) return;
    
    fetch(`/api/groups/${currentGroupId}/remove`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        credentials: "include",
        body: JSON.stringify({ memberUsername: memberUsername })
    })
    .then(res => res.json())
    .then(data => {
        loadGroupMembers();
        updateGroupMemberCount();
    })
    .catch(err => {
        console.error("Error removing member:", err);
        alert("Failed to remove member");
    });
}

function leaveGroup() {
    if (!confirm("Are you sure you want to leave this group?")) return;
    
    fetch(`/api/groups/${currentGroupId}/leave`, {
        method: "POST",
        headers: {
            "X-CSRF-Token": csrfToken
        },
        credentials: "include"
    })
    .then(res => res.json())
    .then(data => {
        closeGroupSettings();
        window.location.href = "./directs.html";
    });
}

// --- CHAT INTERFACE LOGIC (for DMs) ---
async function checkUserAndLoad(username) {
    try {
        const response = await fetch(`/api/check-user/${encodeURIComponent(username)}`);
        const data = await response.json();
        if (!data.exists) {
            alert(`User "${username}" does not exist.`);
            window.location.href = './directs.html';
            return;
        }
        loadChatInterface(username);
    } catch (error) {
        console.error('Error checking user:', error);
        alert('Error loading user. Please try again.');
        window.location.href = './directs.html';
    }
}

function loadChatInterface(otherUser) {
    if (messageInterval) clearInterval(messageInterval);
    
    document.getElementById("userListView").style.display = "none";
    document.getElementById("chatInterfaceView").style.display = "flex";
    document.getElementById("groupChatInterfaceView").style.display = "none";
    
    chatTargetUser = decodeURIComponent(otherUser);
    currentGroupId = "";
    joinActiveRealtimeRoom();
    chatSearchQuery = "";
    clearDmReply();
    document.getElementById("chatHeaderUsername").textContent = chatTargetUser;
    const searchInput = document.getElementById("chatSearchInput");
    const searchStatus = document.getElementById("chatSearchStatus");
    if (searchInput) searchInput.value = "";
    if (searchStatus) searchStatus.textContent = "";
    
    // Cache the other user's pfp
    fetch(`/api/user-info/${encodeURIComponent(chatTargetUser)}`)
        .then(r => r.json())
        .then(u => {
            document.getElementById("chatHeaderPfp").src = u.pfp || "favicon.ico";
            pfpCache[chatTargetUser] = u.pfp || "favicon.ico";
        })
        .catch(() => {
            document.getElementById("chatHeaderPfp").src = "favicon.ico";
        })
        .finally(() => {
            // Load messages after pfp is cached
            loadMessages();
            if (!realtimeConnected) messageInterval = setInterval(loadMessages, 2000);
        });
    
    // Cache your own pfp
    fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`)
        .then(r => r.json())
        .then(u => {
            pfpCache[currentSessionUsername] = u.pfp || "favicon.ico";
        })
        .catch(() => {});

    // Apply user's background to chat
    fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`)
        .then(r => r.json())
        .then(userData => {
        if (userData.backgroundImage) {
            let bgUrl = userData.backgroundImage;
            if (!bgUrl.startsWith('/')) bgUrl = '/' + bgUrl;
            document.documentElement.style.setProperty('--chat-bg-image', `url('${bgUrl}')`);
        } else {
            document.documentElement.style.setProperty('--chat-bg-image', 'none');
        }
        });
}

function renderMessageMedia(msg) {
    if (!msg.mediaUrl) return "";
    const safeUrl = escapeAttribute(msg.mediaUrl);
    const safeName = escapeHtml(msg.mediaName || "Attachment");
    if (msg.isVideo) {
        return `<video class="chat-media" src="${safeUrl}" controls preload="metadata"></video>`;
    }
    return `<img class="chat-media" src="${safeUrl}" alt="${safeName}" onclick="event.stopPropagation(); window.open('${safeUrl}', '_blank')">`;
}

function renderReplyQuote(msg) {
    if (!msg.replyTo) return "";
    const label = msg.replyTo.sender ? `@${msg.replyTo.sender}` : "Original message";
    const text = msg.replyTo.message || msg.replyTo.mediaName || "Attachment";
    return `
        <div class="message-reply-preview">
            <span class="message-reply-sender">${escapeHtml(label)}</span>
            <span class="message-reply-text">${escapeHtml(text)}</span>
        </div>
    `;
}

function messageMatchesSearch(msg) {
    if (!chatSearchQuery) return true;
    const haystack = `${msg.message || ""} ${msg.mediaName || ""}`.toLowerCase();
    return haystack.includes(chatSearchQuery);
}

function renderDmMessages(msgs) {
    const chatBox = document.getElementById("chatMessages");
    if (!chatBox) return;

    chatBox.innerHTML = "";
    const visibleMessages = msgs.filter(messageMatchesSearch);

    if (visibleMessages.length === 0) {
        chatBox.innerHTML = `<div class="chat-empty-state">${chatSearchQuery ? "No messages match your search." : "No messages yet."}</div>`;
        return;
    }

    visibleMessages.forEach(msg => {
        const isMe = msg.sender === currentSessionUsername;
        const row = document.createElement("div");
        row.className = `message-row ${isMe ? 'self' : 'other'}`;
        
        const date = new Date(msg.timestamp);
        const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let statusIcon = '';
        if (isMe) {
            if (msg.status === 'read') statusIcon = '<span class="status-icon status-read">Read</span>';
            else if (msg.status === 'delivered') statusIcon = '<span class="status-icon status-delivered">Delivered</span>';
            else statusIcon = '<span class="status-icon status-sent">Sent</span>';
        }

        let reactionsHtml = '';
        if (msg.reactions) {
            Object.entries(msg.reactions).forEach(([emoji, users]) => {
                if(users.length > 0) {
                    const safeEmoji = escapeHtml(emoji);
                    const safeEmojiAttr = escapeAttribute(emoji);
                    const safeEmojiJs = escapeJsString(emoji);
                    reactionsHtml += `<div class="reaction-badge" data-emoji="${safeEmojiAttr}" onclick="removeReaction('${msg.id}', '${safeEmojiJs}', 'dm')">
                        ${safeEmoji} ${users.length}
                    </div>`;
                }
            });
        }

        const messageText = msg.message ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : "";
        const editedLabel = msg.edited ? '<span class="message-edited">edited</span>' : "";
        row.innerHTML = `
            <img src="${escapeAttribute(isMe ? (pfpCache[currentSessionUsername] || "favicon.ico") : (pfpCache[chatTargetUser] || "favicon.ico"))}"
                 style="width:30px;height:30px;border-radius:50%;margin:0 10px;">
            <div class="bubble" data-message-id="${msg.id}" data-type="dm">
                ${renderReplyQuote(msg)}
                ${messageText}
                ${renderMessageMedia(msg)}
                <div class="message-meta">
                    <span>${timeString}</span>
                    ${editedLabel}
                    ${statusIcon}
                </div>
                ${reactionsHtml ? `<div class="active-reactions">${reactionsHtml}</div>` : ''}
            </div>
            <div class="reaction-bar">
                <button class="reaction-trigger" data-message-id="${msg.id}" data-type="dm">+</button>
                <button data-message-id="${msg.id}" data-type="dm" data-emoji="👍">👍</button>
                <button data-message-id="${msg.id}" data-type="dm" data-emoji="❤️">❤️</button>
                <button data-message-id="${msg.id}" data-type="dm" data-emoji="😂">😂</button>
                <button data-message-id="${msg.id}" data-type="dm" data-emoji="🔥">🔥</button>
            </div>
        `;
        chatBox.appendChild(row);
    });
    
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100;
    if (shouldScrollToBottom || isAtBottom) {
        chatBox.scrollTop = chatBox.scrollHeight;
        shouldScrollToBottom = false;
    }
}

function loadMessages() {
    fetch(`/api/directs/history/${encodeURIComponent(chatTargetUser)}`, { credentials: "include" })
        .then(res => {
            if (res.status === 404) {
                alert('User no longer exists');
                window.location.href = './directs.html';
                return;
            }
            return res.json();
        })
        .then(msgs => {
            if (!msgs) return;
            dmMessageCache = Array.isArray(msgs) ? msgs : [];
            if (chatSearchQuery.length >= 2) {
                searchCurrentChat(chatSearchQuery);
            } else {
                renderDmMessages(dmMessageCache);
            }
            return;
            const chatBox = document.getElementById("chatMessages");
            chatBox.innerHTML = "";
            
            msgs.forEach(msg => {
                const isMe = msg.sender === currentSessionUsername;
                const row = document.createElement("div");
                row.className = `message-row ${isMe ? 'self' : 'other'}`;
                
                // Date Formatting
                const date = new Date(msg.timestamp);
                const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                // Status Icon
                let statusIcon = '';
                if (isMe) {
                    if (msg.status === 'read') statusIcon = '<span class="status-icon status-read">✓✓</span>';
                    else if (msg.status === 'delivered') statusIcon = '<span class="status-icon status-delivered">✓✓</span>';
                    else statusIcon = '<span class="status-icon status-sent">✓</span>';
                }
                // Render Reactions
                let reactionsHtml = '';
                if (msg.reactions) {
                    Object.entries(msg.reactions).forEach(([emoji, users]) => {
                        if(users.length > 0) {
                            const safeEmoji = escapeHtml(emoji);
                            const safeEmojiAttr = escapeAttribute(emoji);
                            const safeEmojiJs = escapeJsString(emoji);
                            reactionsHtml += `<div class="reaction-badge" data-emoji="${safeEmojiAttr}" onclick="removeReaction('${msg.id}', '${safeEmojiJs}', 'dm')">
                                ${safeEmoji} ${users.length}
                            </div>`;
                        }
                    });
                }
                row.innerHTML = `
                    <img src="${escapeAttribute(isMe ? (pfpCache[currentSessionUsername] || "favicon.ico") : (pfpCache[chatTargetUser] || "favicon.ico"))}"
                         style="width:30px;height:30px;border-radius:50%;margin:0 10px;">
                    <div class="bubble" data-message-id="${msg.id}" data-type="dm">
                        ${escapeHtml(msg.message)}
                        <div class="message-meta">
                            <span>${timeString}</span>
                            ${statusIcon}
                        </div>
                        ${reactionsHtml ? `<div class="active-reactions">${reactionsHtml}</div>` : ''}
                    </div>
                    <div class="reaction-bar">
                        <button class="reaction-trigger" data-message-id="${msg.id}" data-type="dm">+</button>
                        <button data-message-id="${msg.id}" data-type="dm" data-emoji="👍">👍</button>
                        <button data-message-id="${msg.id}" data-type="dm" data-emoji="❤️">❤️</button>
                        <button data-message-id="${msg.id}" data-type="dm" data-emoji="😂">😂</button>
                        <button data-message-id="${msg.id}" data-type="dm" data-emoji="🔥">🔥</button>
                    </div>
                `;
                chatBox.appendChild(row);
            });
            
            // Scroll logic
            const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100;
            if (shouldScrollToBottom || isAtBottom) {
                chatBox.scrollTop = chatBox.scrollHeight;
                shouldScrollToBottom = false;
            }
        });
}

function sendDm() {
    const input = document.getElementById("dmInput");
    const mediaInput = document.getElementById("dmMediaInput");
    const mediaName = document.getElementById("dmMediaName");
    const text = input.value.trim();
    const selectedFile = mediaInput?.files?.[0] || null;
    if (!text && !selectedFile) return;

    const formData = new FormData();
    formData.append("receiver", chatTargetUser);
    formData.append("message", text);
    if (activeDmReply?.id) formData.append("replyTo", activeDmReply.id);
    if (selectedFile) formData.append("media", selectedFile);
    
    fetch("/api/directs/send", {
        method: "POST",
        headers: {
            "X-CSRF-Token": csrfToken
        },
        credentials: "include",
        body: formData
    })
    .then(res => {
        if (res.status === 404) {
            alert('User not found');
            window.location.href = './directs.html';
            return;
        }
        return res.json();
    })
    .then(newMsg => {
        if (newMsg) {
            input.value = "";
            if (mediaInput) mediaInput.value = "";
            if (mediaName) mediaName.textContent = "";
            clearDmReply();
            shouldScrollToBottom = true; // Force scroll after sending
            if (!realtimeConnected) loadMessages();
        }
    });
}

// Search functionality
let searchTimeout = null;
document.getElementById("userSearchInput").addEventListener("input", function(e) {
    const query = e.target.value.trim();
    if (searchTimeout) clearTimeout(searchTimeout);
    if (query.length === 0) {
        document.getElementById("searchResults").style.display = "none";
        return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 300);
});
document.getElementById("userSearchInput").addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
        if (searchTimeout) clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length > 0) performSearch(query);
    }
});

const chatSearchInput = document.getElementById("chatSearchInput");
if (chatSearchInput) {
    chatSearchInput.addEventListener("input", function(e) {
        chatSearchQuery = e.target.value.trim().toLowerCase();
        const status = document.getElementById("chatSearchStatus");
        if (chatSearchTimer) clearTimeout(chatSearchTimer);
        if (!chatSearchQuery) {
            if (status) status.textContent = "";
            renderDmMessages(dmMessageCache);
            return;
        }
        if (chatSearchQuery.length < 2) {
            if (status) status.textContent = "Type at least 2 characters";
            renderDmMessages(dmMessageCache);
            return;
        }
        if (status) status.textContent = "Searching...";
        chatSearchTimer = setTimeout(() => searchCurrentChat(chatSearchQuery), 250);
    });
}

async function searchCurrentChat(query) {
    if (!chatTargetUser || query.length < 2) return;
    const requestId = ++chatSearchRequestId;
    const status = document.getElementById("chatSearchStatus");

    try {
        const response = await fetch(`/api/directs/search/${encodeURIComponent(chatTargetUser)}?q=${encodeURIComponent(query)}&limit=60`, {
            credentials: "include"
        });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json();
        if (requestId !== chatSearchRequestId || query !== chatSearchQuery) return;

        renderDmMessages(Array.isArray(data.results) ? data.results : []);
        if (status) {
            status.textContent = data.count === 1 ? "1 result" : `${data.count || 0} results`;
        }
    } catch (error) {
        console.error("Chat search failed", error);
        if (status) status.textContent = "Search unavailable";
    }
}

const dmMediaInput = document.getElementById("dmMediaInput");
if (dmMediaInput) {
    dmMediaInput.addEventListener("change", function(e) {
        const mediaName = document.getElementById("dmMediaName");
        const file = e.target.files && e.target.files[0];
        if (mediaName) {
            mediaName.textContent = file ? file.name : "";
        }
    });
}

function searchUsers() {
    const query = document.getElementById("userSearchInput").value.trim();
    if (query.length > 0) performSearch(query);
}
function performSearch(query) {
    fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        credentials: "include"
    })
    .then(res => res.json())
    .then(users => {
        const resultsContainer = document.getElementById("searchResults");
        if (users.length === 0) {
            resultsContainer.innerHTML = '<div class="dm-empty-state">No users found</div>';
        } else {
            resultsContainer.innerHTML = users.map(u => `
                <div class="search-result-item">
                    <img src="${u.pfp || 'favicon.ico'}" alt="pfp">
                    <div class="search-result-info">
                        <div class="search-result-username">${u.username}</div>
                        <div class="search-result-about">${u.about || 'No bio yet.'}</div>
                    </div>
                    <button class="search-start-chat" onclick="startChat('${u.username}')">Chat</button>
                </div>
            `).join('');
        }
        resultsContainer.style.display = "block";
    });
}
function startChat(username) {
    window.location.href = `./directs.html?user=${encodeURIComponent(username)}`;
}

// Clean up intervals
window.addEventListener('beforeunload', () => {
    if (messageInterval) clearInterval(messageInterval);
    if (groupMessageInterval) clearInterval(groupMessageInterval);
});

/* --- THEME SYSTEM JS --- */
const gradients = {
    'gradient1': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'gradient2': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'gradient3': 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    'gradient4': 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    'gradient5': 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)',
    'gradient6': 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
    'gradient7': 'linear-gradient(135deg, #0f0c29 0%, #302b63 100%)'
};

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

function applyBackground(bgName, isCustom, customUrl) {
    document.body.style.background = '';
    document.body.style.backgroundImage = '';
    document.body.style.backgroundAttachment = '';
    
    if (isCustom && customUrl) {
        document.body.style.backgroundImage = `url('${customUrl}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
        updateTransparency(true);
    } else if (bgName && bgName !== 'none' && gradients[bgName]) {
        document.body.style.backgroundImage = gradients[bgName];
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
        updateTransparency(false);
    } else {
        updateTransparency(false);
    }
}

function updateTransparency(isCustomBg) {
    if (isCustomBg) {
        document.body.classList.add('has-custom-bg');
    } else {
        document.body.classList.remove('has-custom-bg');
    }
}

function loadUserTheme(username) {
    fetch(`/api/user-info/${encodeURIComponent(username)}`, { credentials: "include" })
        .then(res => res.json())
        .then(userData => {
            if (userData.theme) {
                applyTheme(userData.theme);
            }
            if (userData.backgroundImage) {
                if (userData.backgroundImage.startsWith('/backgrounds/') || 
                    userData.backgroundImage.startsWith('storage/backgrounds/') ||
                    userData.backgroundImage.startsWith('storage/')) {
                    let bgUrl = userData.backgroundImage;
                    if (!bgUrl.startsWith('/')) bgUrl = '/' + bgUrl;
                    applyBackground(null, true, bgUrl);
                } else if (userData.backgroundImage.startsWith('gradient')) {
                    applyBackground(userData.backgroundImage, false, null);
                }
            }
            
            // Check premium status
            isPremium = userData.isPremium === true || userData.premium === true || /^\/admin\d*$/i.test(userData.username || currentSessionUsername || "");
            updateGroupCreateAccess();
        })
        .catch(err => console.error("Error loading theme:", err));
}

// --- APP LOCK LOGIC ---
(async function() {
    try {
        // 1. Check if user is logged in
        const sessionRes = await fetch('/session', { credentials: 'include' });
        if (!sessionRes.ok) {
            // Not logged in, don't show lock screen
            return;
        }

        const session = await sessionRes.json();
        
        // 2. Get user info to check if local pass is set
        const userRes = await fetch(`/api/user-info/${encodeURIComponent(session.username)}`, { credentials: 'include' });
        const user = await userRes.json();

        // 3. If user has a localPass set, show the lock screen
        if (user.localPass) {
            const overlay = document.getElementById('app-lock-overlay');
            const input = document.getElementById('localPassInput');
            const btn = document.getElementById('localPassBtn');
            const errorMsg = document.getElementById('localPassError');
            
            // Show the overlay
            overlay.style.display = 'flex';
            
            // Handle Unlock
            btn.onclick = async () => {
                const code = input.value;
                if (!code) return;
                
                btn.textContent = 'Verifying...';
                btn.disabled = true;
                errorMsg.style.display = 'none';

                try {
                    const verifyRes = await fetch('/api/local-pass', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ action: 'verify', code })
                    });
                    
                    const data = await verifyRes.json();
                    
                    if (verifyRes.ok) {
                        // Success: Hide overlay and continue loading
                        overlay.style.display = 'none';
                        // Remove this script block so it doesn't run again on refresh
                        document.currentScript.remove(); 
                    } else {
                        // Failed
                        errorMsg.textContent = data.error || 'Incorrect passcode';
                        errorMsg.style.display = 'block';
                        input.value = '';
                        btn.textContent = 'Unlock';
                        btn.disabled = false;
                    }
                } catch (err) {
                    errorMsg.textContent = 'Connection error';
                    errorMsg.style.display = 'block';
                    btn.textContent = 'Unlock';
                    btn.disabled = false;
                }
            };

            // Allow Enter key
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    btn.click();
                }
            });
        }
    } catch (err) {
        console.error('App Lock Check Failed:', err);
    }
})();
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
    const currentPage = window.location.pathname.split('/').pop() || 'directs.html';
    
    // Get all sidebar links
    const navLinks = document.querySelectorAll('.sidebar a');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Remove old active classes first
      link.classList.remove('active', 'sidebar-item-active');
      
      // Check if this link matches the current page
      // We handle root directory (./) vs specific files (./directs.html)
      if (href === './directs.html' && (currentPage === '' || currentPage === 'directs.html')) {
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
      if (href === './directs.html' && (currentPage === '' || currentPage === 'directs.html')) {
        link.classList.add('active');
      } else if (href === `./${currentPage}`) {
        link.classList.add('active');
      }
    });
  });
