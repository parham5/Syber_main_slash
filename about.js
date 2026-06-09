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
    document.body.style.backgroundAttachment = '';

    if (isCustom && customUrl) {
        document.body.style.backgroundImage = `url('${customUrl}')`;
        document.body.style.backgroundSize = '100% auto';
        document.body.style.backgroundPosition = 'center top';
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
  // 1. Define the function
  function checkAuth() {
    fetch("/session", { credentials: "include" })
      .then(res => {
        if (!res.ok) throw new Error("Not logged in");
        return res.json();
      })
      .then(user => {
        // User IS logged in
        console.log("Logged in as:", user.username);
        
        // Load the user's theme settings
        loadUserTheme(user.username);
        
        // Optional: Update UI elements if they exist on this page
        const accountBtn = document.getElementById("accountBtn");
        if (accountBtn) accountBtn.style.display = "block";
        const accountUsername = document.getElementById("accountUsername");
        if (accountUsername) accountUsername.textContent = user.username;
        const accountPfp = document.getElementById("accountPfp");
        if (accountPfp) accountPfp.src = user.pfp || "favicon.ico";
        const fabBtn = document.getElementById("fabBtn");
        if (fabBtn) fabBtn.style.display = "block";
      })
      .catch(() => {
        // User is NOT logged in -> Redirect to Home
        console.log("Access denied. Redirecting to /index.html");
        window.location.href = "/index.html";
      });
  }
  // Run the check as soon as the page loads
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
    const currentPage = window.location.pathname.split('/').pop() || 'about.html';
    
    // Get all sidebar links
    const navLinks = document.querySelectorAll('.sidebar a');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Remove old active classes first
      link.classList.remove('active', 'sidebar-item-active');
      
      // Check if this link matches the current page
      // We handle root directory (./) vs specific files (./directs.html)
      if (href === './about.html' && (currentPage === '' || currentPage === 'about.html')) {
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
      if (href === './about.html' && (currentPage === '' || currentPage === 'about.html')) {
        link.classList.add('active');
      } else if (href === `./${currentPage}`) {
        link.classList.add('active');
      }
    });
  });