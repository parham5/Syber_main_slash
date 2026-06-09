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
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundRepeat = '';
        document.body.style.backgroundAttachment = '';
        document.body.style.minHeight = '';
        
        if (isCustom && customUrl) {
            document.body.style.backgroundImage = `url('${customUrl}')`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center center';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.minHeight = '100vh';
            updateTransparency(true);
        } else if (bgName && bgName !== 'none' && gradients[bgName]) {
            document.body.style.backgroundImage = gradients[bgName];
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.minHeight = '100vh';
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
                if (userData.theme) applyTheme(userData.theme);
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
            })
            .catch(err => console.error("Error loading theme:", err));
    }

    /* --- AUTH LOGIC (Ensure checkAuth calls loadUserTheme) --- */
    async function fetchCsrfToken() {
        try {
            const response = await fetch('/csrf-token', { method: 'GET', credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                return data.csrfToken;
            }
        } catch (error) { console.error("CSRF fetch error:", error); }
        return null;
    }

    async function checkAuth() {
        window.csrfToken = await fetchCsrfToken();
        try {
            const response = await fetch('/session', { method: 'GET', credentials: 'include' });
            
            // If the response is NOT ok (e.g., 401 Unauthorized or 403 Forbidden),
            // it means the user is not logged in.
            if (!response.ok) {
                window.location.href = './index.html';
                return;
            }

            const data = await response.json();
            
            // Optional: If your backend returns a specific "isLoggedIn" flag that is false
            // even with a 200 OK status, check that too. 
            // Example: if (!data.isLoggedIn) { window.location.href = './index.html'; return; }

            const currentUser = data.username;
            
            // If for some reason the server returns a 200 but no username, treat as not logged in
            if (!currentUser) {
                window.location.href = './index.html';
                return;
            }

            loadUserTheme(currentUser); // This triggers the theme loading
            const accountPfp = document.getElementById("accountPfp");
            const mobilePfp = document.getElementById("mobileaccountPfp");
            const pfpSrc = data.pfp ? (data.pfp.startsWith('/') ? data.pfp : '/' + data.pfp) : "favicon.ico";
            if (accountPfp) accountPfp.src = pfpSrc;
            if (mobilePfp) mobilePfp.src = pfpSrc;

        } catch (error) {
            console.error('Auth check failed:', error);
            // In case of network error, also redirect to login
            window.location.href = './index.html';
        }
    }

    /* --- HISTORY SIDEBAR LOGIC --- */
    const historySidebar = document.getElementById('historySidebar');
    const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    const historyList = document.getElementById('historyList');
    const clearAllBtn = document.getElementById('clearAllBtn');
    
    // Toggle History Sidebar
    toggleHistoryBtn.addEventListener('click', () => {
        historySidebar.classList.toggle('active');
        // Toggle the body class to handle main content margin
        document.body.classList.toggle('has-right-sidebar');
    });

    // Close History Sidebar
    closeHistoryBtn.addEventListener('click', () => {
        historySidebar.classList.remove('active');
        // Remove the body class when closing
        document.body.classList.remove('has-right-sidebar');
    });
    // Render History List
    function renderHistoryList() {
        historyList.innerHTML = '';
        const chats = JSON.parse(localStorage.getItem('sidebarChats')) || [];
        
        if (chats.length === 0) {
            historyList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--theme-text-secondary); font-size:0.85rem;">No recent chats</div>';
            return;
        }
        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
            item.onclick = (e) => {
                // Prevent switching if clicking delete
                if(e.target.closest('.delete-btn')) return;
                switchChat(chat.id);
                // Close sidebar on mobile after selection
                if (window.innerWidth <= 1320) {
                    historySidebar.classList.remove('active');
                }
            };
            const title = document.createElement('div');
            title.className = 'history-item-title';
            title.textContent = chat.title || 'New Chat';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>';
            deleteBtn.title = "Delete this chat";
            deleteBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent switching chat
                deleteChat(chat.id);
            };
            item.appendChild(title);
            item.appendChild(deleteBtn);
            historyList.appendChild(item);
        });
    }
    // Delete a specific chat
    function deleteChat(chatId) {
        if(!confirm("Are you sure you want to delete this conversation?")) return;
        
        let chats = JSON.parse(localStorage.getItem('sidebarChats')) || [];
        chats = chats.filter(c => c.id !== chatId);
        localStorage.setItem('sidebarChats', JSON.stringify(chats));
        
        // If we deleted the current chat, create a new one
        if (currentChatId === chatId) {
            createNewChat();
        } else {
            renderHistoryList();
        }
    }
    // Clear All Chats
    clearAllBtn.addEventListener('click', () => {
        if(confirm("Are you sure you want to delete ALL conversations?")) {
            localStorage.removeItem('sidebarChats');
            createNewChat();
            renderHistoryList();
        }
    });
    /* --- CHAT & HISTORY LOGIC (From Old Code) --- */
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const typingIndicator = document.getElementById('typing-indicator');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const appSidebar = document.getElementById('appSidebar');
    // Current Chat ID
    let currentChatId = null;
    
    // Load all chats from LocalStorage (Sidebar List)
    function loadSidebarChats() {
        renderHistoryList();
    }
    // Switch to a specific chat
    function switchChat(chatId) {
        currentChatId = chatId;
        // Load messages from localStorage
        const chatData = JSON.parse(localStorage.getItem('chat_' + chatId));
        // Clear current view
        chatContainer.innerHTML = '';
        chatContainer.appendChild(typingIndicator); // Keep indicator
        if (chatData && chatData.messages) {
            chatData.messages.forEach(msg => {
                addMessageToDOM(msg.text, msg.sender, false);
            });
        } else {
            // If no data, start fresh
            addMessageToDOM("Hello! I am Nova. How can I help you today?", 'ai', false);
        }
        scrollToBottom();
        renderHistoryList(); // Update active state
    }
    // Create a new chat
    function createNewChat() {
        const newId = Date.now().toString();
        currentChatId = newId;
        
        // Add to sidebar list
        let chats = JSON.parse(localStorage.getItem('sidebarChats')) || [];
        chats.unshift({ id: newId, title: "New Chat", timestamp: Date.now() });
        localStorage.setItem('sidebarChats', JSON.stringify(chats));
        
        // Clear current view
        chatContainer.innerHTML = '';
        chatContainer.appendChild(typingIndicator);
        addMessageToDOM("Hello! I am Nova. How can I help you today?", 'ai', false);
        scrollToBottom();
        renderHistoryList();
    }
    // Add message to DOM
    function addMessageToDOM(text, sender, animate = true, isImage = false, imageUrl = null) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        if (!animate) div.style.animation = 'none';
        
        if (sender === 'ai') {
            const nameDiv = document.createElement('div');
            nameDiv.classList.add('sender-name');
            nameDiv.textContent = 'Nova';
            div.appendChild(nameDiv);
        }

        const content = document.createElement('div');
        
        if (isImage && imageUrl) {
            // If it's an image message
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = "Uploaded Image";
            if (text) {
                // If there is also text with the image
                const textDiv = document.createElement('div');
                textDiv.innerHTML = text.replace(/\n/g, '<br>');
                content.appendChild(textDiv);
                content.appendChild(img);
            } else {
                content.appendChild(img);
            }
        } else {
            // Standard text message
            content.innerHTML = text.replace(/\n/g, '<br>');
        }
        
        div.appendChild(content);
        chatContainer.insertBefore(div, typingIndicator);
    }
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    // Save current chat messages
    function saveCurrentChat() {
        if (!currentChatId) return;
        const messages = [];
        const messageElements = chatContainer.querySelectorAll('.message');
        messageElements.forEach(el => {
            const sender = el.classList.contains('user') ? 'user' : 'ai';
            const text = el.querySelector('div:not(.sender-name)') ? el.querySelector('div:not(.sender-name)').innerHTML : el.innerHTML;
            messages.push({ sender, text });
        });
        localStorage.setItem('chat_' + currentChatId, JSON.stringify({ messages }));
        
        // Update sidebar title if it's the first message
        let chats = JSON.parse(localStorage.getItem('sidebarChats')) || [];
        const chatIndex = chats.findIndex(c => c.id === currentChatId);
        if (chatIndex > -1 && chats[chatIndex].title === "New Chat") {
            // Extract first few words for title
            const firstMsg = messages.find(m => m.sender === 'user');
            if (firstMsg) {
                chats[chatIndex].title = firstMsg.text.replace(/<[^>]*>/g, '').substring(0, 30) + (firstMsg.text.length > 30 ? '...' : '');
                localStorage.setItem('sidebarChats', JSON.stringify(chats));
                renderHistoryList();
            }
        }
    }
    async function sendMessage() {
        const text = userInput.value.trim();
        
        // If no text and no image, do nothing
        if (!text && !selectedImageBase64) return;
        if (!window.csrfToken) {
            alert("Security token missing. Please refresh the page.");
            return;
        }

        // 1. Add User Message to UI
        if (selectedImageBase64) {
            addMessageToDOM(text, 'user', true, true, selectedImageBase64);
        } else {
            addMessageToDOM(text, 'user', true);
        }

        // 2. Prepare Data for API
        const payload = { message: text };
        
        // ADD THIS LINE: Get the currently selected model from the UI
        const selectedModelOption = document.querySelector('.model-option.active');
        if (selectedModelOption) {
            payload.model = selectedModelOption.getAttribute('data-model');
        } else {
            payload.model = 'gemini-2.5-flash-lite'; // Default fallback
        }

        if (selectedImageBase64) {
            payload.image = selectedImageBase64; 
        }

        // 3. Clear Input
        userInput.value = '';
        userInput.style.height = 'auto';
        selectedImageBase64 = null; // Reset image variable
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '';
        fileUpload.value = ''; // Reset file input
        
        saveCurrentChat();
        scrollToBottom();
        
        // 4. Show Typing Indicator
        typingIndicator.style.display = 'block';
        sendBtn.disabled = true;
        
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': window.csrfToken
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const data = await response.json();
                typingIndicator.style.display = 'none';
                
                let aiText = data.reply || "";
                let aiImage = null;

                // Check if the backend sent a specific imageUrl field (for Z-Image)
                if (data.imageUrl) {
                    aiImage = data.imageUrl;
                    // If there's no text reply, we might want to hide the empty text bubble
                    if (!aiText) aiText = "Generated Image"; 
                } 
                // Fallback for old text-based responses
                else if (data.image) {
                    aiImage = data.image;
                }

                // Send text and image to the DOM function
                addMessageToDOM(aiText, 'ai', true, !!aiImage, aiImage);
                saveCurrentChat();
                scrollToBottom();
            }
            else {
                const errorData = await response.json();
                typingIndicator.style.display = 'none';
                addMessageToDOM(`Error: ${errorData.error || 'Something went wrong'}`, 'ai');
                saveCurrentChat();
            }
        } catch (error) {
            typingIndicator.style.display = 'none';
            addMessageToDOM('Network error. Please try again.', 'ai');
            saveCurrentChat();
        }
        sendBtn.disabled = false;
        userInput.focus();
    }
    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if(this.value === '') this.style.height = 'auto';
        // Enable/Disable send button
        if (this.value.trim().length > 0) {
            sendBtn.disabled = false;
        } else {
            sendBtn.disabled = true;
        }
    });
    // Left Menu Toggle
    if (mobileMenuBtn && appSidebar) {
        mobileMenuBtn.addEventListener('click', () => {
            appSidebar.classList.toggle('active');
        });
    }
    // New Chat Button
    const floatingNewChat = document.getElementById('floatingNewChat');
    if (floatingNewChat) {
        floatingNewChat.addEventListener('click', createNewChat);
    }
    /* --- MODEL SELECTOR LOGIC (From New UI) --- */
    /* --- MODEL SELECTOR LOGIC --- */
    const selectedModelBtn = document.getElementById('selectedModelBtn');
    const currentModelName = document.getElementById('currentModelName');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelOptions = document.querySelectorAll('.model-option');

    // Open/Close Dropdown
    selectedModelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modelDropdown.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!selectedModelBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
            modelDropdown.classList.remove('show');
        }
    });

    // Handle Model Selection
    modelOptions.forEach(option => {
        option.addEventListener('click', () => {
            // 1. Update visual active state
            modelOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            // 2. Update the button text to show the FRIENDLY name (e.g., "Z-Image")
            // We get the first child text (the main name)
            const displayName = option.childNodes[0].textContent.trim();
            currentModelName.textContent = displayName;

            // 3. Close the dropdown
            modelDropdown.classList.remove('show');
        });
    });
    // Initialize
    document.addEventListener("DOMContentLoaded", () => {
        checkAuth();
        loadSidebarChats(); // Load history list
        // Check if there's a chat ID in URL or use the latest one
        const urlParams = new URLSearchParams(window.location.search);
        const urlChatId = urlParams.get('chat');
        if (urlChatId) {
            currentChatId = urlChatId;
            switchChat(currentChatId);
        } else {
            // Load the most recent chat from sidebar list
            const sidebarChats = JSON.parse(localStorage.getItem('sidebarChats')) || [];
            if (sidebarChats.length > 0) {
                // Sort by timestamp to get the latest
                const latestChat = sidebarChats.sort((a, b) => b.timestamp - a.timestamp)[0];
                currentChatId = latestChat.id;
                switchChat(currentChatId);
            } else {
                // No chats, create a new one
                createNewChat();
            }
        }
    });
    // --- NEW: Image Upload Logic ---
    const fileUpload = document.getElementById('fileUpload');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn'); // New element
    let selectedImageBase64 = null;

    // Function to clear the selected image
    function clearSelectedImage() {
        selectedImageBase64 = null;
        imagePreview.src = '';
        imagePreviewContainer.style.display = 'none';
        fileUpload.value = ''; // Reset input so same file can be selected again
        
        // Re-check send button state based on text only
        if (userInput.value.trim().length > 0) {
            sendBtn.disabled = false;
        } else {
            sendBtn.disabled = true;
        }
    }

    // Event listener for the X button
    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering the upload button if it's close
        clearSelectedImage();
    });

    fileUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                selectedImageBase64 = event.target.result;
                imagePreview.src = selectedImageBase64;
                imagePreviewContainer.style.display = 'flex'; // Use flex to align items
                sendBtn.disabled = false; // Enable send if image is selected
            };
            reader.readAsDataURL(file);
        }
    });





  document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'ai.html';
    
    // Get all sidebar links
    const navLinks = document.querySelectorAll('.sidebar a');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Remove old active classes first
      link.classList.remove('active', 'sidebar-item-active');
      
      // Check if this link matches the current page
      // We handle root directory (./) vs specific files (./directs.html)
      if (href === './ai.html' && (currentPage === '' || currentPage === 'ai.html')) {
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
      if (href === './ai.html' && (currentPage === '' || currentPage === 'ai.html')) {
        link.classList.add('active');
      } else if (href === `./${currentPage}`) {
        link.classList.add('active');
      }
    });
  });