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
    // Reset
    document.body.style.background = '';
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.minHeight = '';

    if (isCustom && customUrl) {
        document.body.style.backgroundImage = `url('${customUrl}')`;
        document.body.style.backgroundSize = '100% auto';
        document.body.style.backgroundPosition = 'center top';
        document.body.style.backgroundRepeat = 'repeat-y';
        document.body.style.minHeight = '100vh';
        updateTransparency(true);
    } else if (bgName && bgName !== 'none' && gradients[bgName]) {
        document.body.style.backgroundImage = gradients[bgName];
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
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
            // Apply Theme
            if (userData.theme) {
                applyTheme(userData.theme);
            }

            // Apply Background
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

/* --- EXISTING PAGE JS --- */
let currentSessionUsername = "";
document.addEventListener("DOMContentLoaded", () => {
  checkAuth().then(() => {
    loadLibrary();
  });
});
function checkAuth() {
  return fetch("/session", { credentials: "include" })
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
      currentSessionUsername = user.username;
      // Load the user's theme settings immediately after login
      loadUserTheme(user.username);
    })
    .catch(() => {
      window.location.href = "./index.html"; // Redirect if not logged in
    });
}
function loadLibrary() {
  fetch("/api/messages", { credentials: "include" })
    .then(res => res.json())
    .then(posts => {
      // Filter posts
      const likedPosts = posts.filter(p => p.likes && p.likes.includes(currentSessionUsername));
      const savedPosts = posts.filter(p => p.saves && p.saves.includes(currentSessionUsername));
      const retweetedPosts = posts.filter(p => p.retweets && p.retweets.includes(currentSessionUsername));
      const splitContainer = document.querySelector(".split-container");
      if (retweetedPosts.length > 0) {
          const retweetColumn = document.createElement("div");
          retweetColumn.className = "split-column";
          retweetColumn.innerHTML = `
              <h2>Re-Slashed Posts</h2>
              <ul id="retweetedFeed" class="feed">
                  <li style='color:#666; text-align:center; padding:20px;'>Loading Re-Slashed posts...</li>
              </ul>
          `;
          splitContainer.appendChild(retweetColumn);
          
          // Render Re-Slashed posts
          const retweetedFeed = document.getElementById("retweetedFeed");
          retweetedFeed.innerHTML = "";
          retweetedPosts.forEach(post => {
              const el = createLibraryPostElement(post);
              retweetedFeed.appendChild(el);
          });
      }
      // Render Liked
      const likedFeed = document.getElementById("likedFeed");
      likedFeed.innerHTML = "";
      if(likedPosts.length === 0) {
        likedFeed.innerHTML = "<li style='color:#666; text-align:center; padding:20px;'>No liked posts yet.</li>";
      } else {
        likedPosts.forEach(post => {
          const el = createLibraryPostElement(post);
          likedFeed.appendChild(el);
        });
      }
      // Render Saved
      const savedFeed = document.getElementById("savedFeed");
      savedFeed.innerHTML = "";
      if(savedPosts.length === 0) {
        savedFeed.innerHTML = "<li style='color:#666; text-align:center; padding:20px;'>No saved posts yet.</li>";
      } else {
        savedPosts.forEach(post => {
          const el = createLibraryPostElement(post);
          savedFeed.appendChild(el);
        });
      }
    })
    .catch(err => console.error(err));
}
// Simplified post element creator for the library view (Read Only)
function createLibraryPostElement(post) {
  const li = document.createElement("li");
  li.className = "post";
  // PFP
  const pfpElement = document.createElement("img");
  pfpElement.src = post.pfp || "favicon.ico";
  pfpElement.className = "pfp-inline";
  li.appendChild(pfpElement);
  // Username
  const usernameElement = document.createElement("span");
  let usernameClass = "username";
  if (post.username && post.username.startsWith("/admin")) {
    usernameClass += " admin";
  }
  usernameElement.className = usernameClass;
  usernameElement.textContent = post.username;
  li.appendChild(usernameElement);
  // Message
  if (post.message) {
    const messageElement = document.createElement("p");
    messageElement.className = "message";
    messageElement.textContent = post.message;
    li.appendChild(messageElement);
  }
  // Image
  if (post.imageUrl) {
    const imageElement = document.createElement("img");
    imageElement.src = post.imageUrl;
    li.appendChild(imageElement);
  }
  
  // Timestamp
  const timestampElement = document.createElement("span");
  timestampElement.className = "timestamp";
  const date = new Date(post.timestamp);
  timestampElement.textContent = date.toLocaleString();
  li.appendChild(timestampElement);
  // Simple Status Bar (Just visual indicators)
  const statusBar = document.createElement("div");
  statusBar.style.marginTop = "10px";
  statusBar.style.fontSize = "0.8rem";
  statusBar.style.color = "#888";
  
  let statusText = [];
  if (post.likes.includes(currentSessionUsername)) statusText.push("❤️ Liked");
  if (post.saves.includes(currentSessionUsername)) statusText.push("💾 Saved");
  if (post.retweets && post.retweets.includes(currentSessionUsername)) statusText.push("🔁 Re-Slashed");
  
  statusBar.textContent = statusText.join("  |  ");
  li.appendChild(statusBar);
  return li;
}

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
    const currentPage = window.location.pathname.split('/').pop() || 'liked_saved.html';
    
    // Get all sidebar links
    const navLinks = document.querySelectorAll('.sidebar a');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Remove old active classes first
      link.classList.remove('active', 'sidebar-item-active');
      
      // Check if this link matches the current page
      // We handle root directory (./) vs specific files (./directs.html)
      if (href === './liked_saved.html' && (currentPage === '' || currentPage === 'liked_saved.html')) {
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
      if (href === './liked_saved.html' && (currentPage === '' || currentPage === 'liked_saved.html')) {
        link.classList.add('active');
      } else if (href === `./${currentPage}`) {
        link.classList.add('active');
      }
    });
  });