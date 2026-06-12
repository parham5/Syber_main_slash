let skipNextLoad = false;
let authChecked = false;
const settings_name = document.getElementById('preview');

function earlyAuthCheck() {
  if (authChecked) return;
  authChecked = true;
  
  fetch("/session", { credentials: "include" })
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
      // Logged in - continue
      currentSessionUsername = user.username;
    })
    .catch(() => {
      // Not logged in - redirect
      window.location.replace("./login.html");
    });
}

// Run immediately
earlyAuthCheck();

const apiUrl = `${window.location.protocol}//${window.location.host}/api/messages`;
let profileCardTimeout;
const profileCard = document.getElementById("profileCard");
let csrfToken = "";
let currentSessionUsername = "";
let currentUserFollowing = [];
let allPosts = [];
let isLoadingPosts = false;
let userPremiumCache = new Map();
let activeQuotePostId = null;
let activeComposerPreviewUrl = null;
const MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 15 * 1024 * 1024
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function validateComposerMedia(file) {
  if (!file) return { ok: true };
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isImage && !isVideo) return { ok: false, message: "Only images and videos are supported." };
  const limit = isVideo ? MEDIA_LIMITS.video : MEDIA_LIMITS.image;
  if (file.size > limit) {
    return { ok: false, message: `${isVideo ? "Video" : "Image"} must be under ${formatBytes(limit)}.` };
  }
  return { ok: true, type: isVideo ? "video" : "image", limit };
}

function updateMediaInsight(file, warning = "") {
  const panel = document.getElementById("mediaMetaPanel");
  const insight = document.getElementById("mediaInsight");
  if (!panel || !insight) return;
  if (!file) {
    panel.hidden = true;
    insight.textContent = "";
    insight.classList.remove("warning");
    return;
  }
  const validation = validateComposerMedia(file);
  panel.hidden = false;
  insight.textContent = warning || `${file.type.startsWith("video/") ? "Video" : "Image"} - ${formatBytes(file.size)} - limit ${formatBytes(validation.limit || MEDIA_LIMITS.image)}`;
  insight.classList.toggle("warning", Boolean(warning) || !validation.ok);
}

async function loadCreatorGallery() {
  const gallery = document.getElementById("creatorGallery");
  if (!gallery) return;
  try {
    const response = await fetch("/api/media/gallery?limit=12", { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const assets = Array.isArray(data.assets) ? data.assets : [];
    gallery.classList.toggle("show", assets.length > 0);
    gallery.innerHTML = assets.map(asset => {
      const url = escapeAttribute(asset.url || "");
      const label = escapeAttribute(asset.altText || asset.caption || "Media");
      return `<div class="creator-gallery-item" title="${escapeAttribute(asset.originalName || "")}">
        ${asset.mediaType === "video"
          ? `<video src="${url}" muted playsinline preload="metadata" aria-label="${label}"></video>`
          : `<img src="${url}" alt="${label}" onerror="this.parentElement.remove()">`}
      </div>`;
    }).join("");
  } catch (err) {
    gallery.classList.remove("show");
  }
}

// Variables for 2FA flow
let pendingSignupData = null;
let pendingForgotPasswordUsername = null;

// ==========================================
// IMAGE PREVIEW FUNCTIONS
// ==========================================

function handleImagePreview(input) {
  const file = input.files[0];
  const preview = document.getElementById('preview');
  const videoPreview = document.getElementById('videoPreview');
  const previewContainer = document.getElementById('previewContainer');
  const fileNameDisplay = document.getElementById('fileName');
  
  if (!file) {
    updateMediaInsight(null);
    return;
  }
  const validation = validateComposerMedia(file);
  if (!validation.ok) {
    alert(validation.message);
    input.value = "";
    updateMediaInsight(null);
    return;
  }
  updateMediaInsight(file);
  
  if (activeComposerPreviewUrl) {
    URL.revokeObjectURL(activeComposerPreviewUrl);
    activeComposerPreviewUrl = null;
  }
  
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      if (preview) {
        preview.src = e.target.result;
        preview.style.display = 'block';
      }
      if (videoPreview) {
        videoPreview.removeAttribute('src');
        videoPreview.load();
        videoPreview.style.display = 'none';
      }
      if (previewContainer) {
        previewContainer.style.display = 'block';
      }
      if (fileNameDisplay) {
        fileNameDisplay.textContent = file.name;
      }
    };
    reader.onerror = function() {
      console.error('Error reading file');
    };
    reader.readAsDataURL(file);
  } else if (file.type.startsWith('video/')) {
    activeComposerPreviewUrl = URL.createObjectURL(file);
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    if (videoPreview) {
      videoPreview.src = activeComposerPreviewUrl;
      videoPreview.style.display = 'block';
    }
    if (previewContainer) {
      previewContainer.style.display = 'block';
    }
    if (fileNameDisplay) {
      fileNameDisplay.textContent = file.name;
    }
  } else {
    if (preview) preview.src = '';
    if (videoPreview) {
      videoPreview.removeAttribute('src');
      videoPreview.load();
      videoPreview.style.display = 'none';
    }
    if (previewContainer) previewContainer.style.display = 'none';
    if (fileNameDisplay) fileNameDisplay.textContent = file.name;
  }
}

function removeImagePreview() {
  // Main input area
  const preview = document.getElementById('preview');
  const videoPreview = document.getElementById('videoPreview');
  const previewContainer = document.getElementById('previewContainer');
  const imageInput = document.getElementById('imageInput');
  const fileNameDisplay = document.getElementById('fileName');
  
  if (activeComposerPreviewUrl) {
    URL.revokeObjectURL(activeComposerPreviewUrl);
    activeComposerPreviewUrl = null;
  }
  if (preview) {
    preview.src = '';
    preview.style.display = 'block';
  }
  if (videoPreview) {
    videoPreview.removeAttribute('src');
    videoPreview.load();
    videoPreview.style.display = 'none';
  }
  if (previewContainer) {
    previewContainer.style.display = 'none';
  }
  if (imageInput) {
    imageInput.value = '';
  }
  if (fileNameDisplay) fileNameDisplay.textContent = 'No media selected';
  const captionInput = document.getElementById("mediaCaptionInput");
  const altInput = document.getElementById("mediaAltInput");
  if (captionInput) captionInput.value = "";
  if (altInput) altInput.value = "";
  updateMediaInsight(null);
  
  // Modal input area
  const modalImageInput = document.getElementById('postModalImageInput');
  const modalFileNameDisplay = document.getElementById('postModalFileName');
  const modalPreview = document.getElementById('modalPreview');
  const modalPreviewContainer = document.getElementById('modalPreviewContainer');
  
  if (modalImageInput) modalImageInput.value = '';
  if (modalFileNameDisplay) modalFileNameDisplay.textContent = 'No file chosen';
  if (modalPreview) modalPreview.src = '';
  if (modalPreviewContainer) modalPreviewContainer.style.display = 'none';
  if (window.updateComposerState) window.updateComposerState();
}

// ==========================================
// INITIALIZATION
// ==========================================



// Run immediately when script loads
(function() {
  const imageInput = document.getElementById('imageInput');
  const previewContainer = document.getElementById('previewContainer');

  if (imageInput) {
    imageInput.onchange = function(e) {
      handleImagePreview(this);
    };
    
    imageInput.addEventListener('change', function(e) {
      handleImagePreview(this);
    });
  }
  
  // Initialize preview as hidden
  if (previewContainer) {
    previewContainer.style.display = 'none';
  }
  setupComposerEnhancements();
  loadCreatorGallery();
})();

// Fetch CSRF token on load

function fetchCsrf() {
  return fetch("/csrf-token", { credentials: "include" })
    .then(res => res.json())
    .then(data => { 
      csrfToken = data.csrfToken;
      cachedCsrfToken = data.csrfToken; // Cache it
    });
}

// ==========================================
// DOM CONTENT LOADED
// ==========================================
// Update the DOMContentLoaded handler

document.addEventListener('DOMContentLoaded', function() {
  // Force clear all optimistic posts
  window.optimisticPosts = [];
  allPosts = [];
  
  // Clear any cached posts from localStorage if you're using it
  localStorage.removeItem('cachedFeed');
  
  fetchCsrf().then(() => {
    checkAuth();
    
    // Default initial load on application start
    setTimeout(() => {
      loadAlgorithmicFeed();
    }, 500);

    // Dynamic poll interval loop
    setInterval(() => {
      if (currentSessionUsername && !isLoadingPosts) {
        if (currentFeedTab === "discovery") {
          loadAlgorithmicFeed();
        } else {
          loadPosts();
        }
      }
    }, 4000);
  });
  setTimeout(() => {
    observePostVisibility();
  }, 2000);
  setupFeedTabs();
  setupQuoteComposer();
});

function setupQuoteComposer() {
  const quoteInput = document.getElementById("quoteModalInput");
  const quoteCount = document.getElementById("quoteCharCount");
  const quoteBtn = document.getElementById("quotePostBtn");

  if (!quoteInput || !quoteCount || !quoteBtn) return;

  quoteInput.addEventListener("input", () => {
    const length = quoteInput.value.length;
    quoteCount.textContent = `${length} / 280`;
    quoteCount.classList.toggle("warning", length >= 240 && length < 270);
    quoteCount.classList.toggle("danger", length >= 270);
    quoteBtn.disabled = length === 0;
  });

  quoteBtn.disabled = true;
}

function handleScroll() {
  const fabBtn = document.getElementById("fabBtn");
  const postArea = document.querySelector(".input-area");
  const postAreaBottom = postArea.offsetTop + postArea.offsetHeight;

  if (window.pageYOffset > postAreaBottom) {
    fabBtn.style.display = "block";
  } else {
    fabBtn.style.display = "none";
  }
}

function checkAuth() {

  fetch("/session", { credentials: "include" })
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
      currentSessionUsername = user.username;
      document.getElementById("accountUsername").textContent = user.username;
      document.getElementById("accountPfp").src = user.pfp || "favicon.ico";
      document.getElementById("oldaccountPfp").src = user.pfp || "favicon.ico";
      document.getElementById("mobileaccountPfp").src = user.pfp || "favicon.ico";
      const composerAvatar = document.getElementById("composerAvatar");
      if (composerAvatar) composerAvatar.src = user.pfp || "favicon.ico";
      document.getElementById("fabBtn").style.display = "block";
      fetchUserFollowing();
      checkTwoFactorStatus();
      // Theme loading code...
      if (user.isPremium) {
        if (user.theme) {
          applyTheme(user.theme);
        }
        if (user.backgroundImage) {
          if (user.backgroundImage.startsWith('/backgrounds/') ||
              user.backgroundImage.startsWith('storage/')) {
            let bgUrl = user.backgroundImage;
            if (!bgUrl.startsWith('/')) bgUrl = '/' + bgUrl;
            applyBackground(null, true, bgUrl);
          } else if (user.backgroundImage.startsWith('gradient')) {
            applyBackground(user.backgroundImage, false, null);
          }
        }
      }
    })
    .catch((err) => {
      console.log("Auth check failed, redirecting...", err);
      currentSessionUsername = "";
      document.getElementById("accountBtn").style.display = "none";
      // Force redirect with replace to prevent back button issues
      window.location.replace("./login.html");
    });
}

function setupComposerEnhancements() {
  const input = document.getElementById("postInput");
  const imageInput = document.getElementById("imageInput");
  const postBtn = document.getElementById("postBtn");
  const count = document.getElementById("postCharCount");
  const fileName = document.getElementById("fileName");
  const maxLength = input ? Number(input.getAttribute("maxlength") || 280) : 280;

  function updateComposerState() {
    if (!input || !postBtn) return;
    const length = input.value.length;
    const hasText = input.value.trim().length > 0;
    const hasFile = !!(imageInput && imageInput.files && imageInput.files[0]);

    postBtn.disabled = !hasText && !hasFile;

    if (count) {
      count.textContent = `${length} / ${maxLength}`;
      count.classList.toggle("warning", length >= maxLength * 0.8 && length < maxLength);
      count.classList.toggle("danger", length >= maxLength);
    }

    if (fileName && imageInput) {
      fileName.textContent = imageInput.files[0] ? imageInput.files[0].name : "No media selected";
    }
  }

  if (input) input.addEventListener("input", updateComposerState);
  if (imageInput) imageInput.addEventListener("change", updateComposerState);
  window.updateComposerState = updateComposerState;
  updateComposerState();
}


function checkTwoFactorStatus() {
  fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      const enabledBadge = document.getElementById("twoFactorEnabledBadge");
      const disabledBadge = document.getElementById("twoFactorDisabledBadge");
      if (data.twoFactorEnabled) {
        enabledBadge.style.display = "inline-block";
        disabledBadge.style.display = "none";
      } else {
        enabledBadge.style.display = "none";
        disabledBadge.style.display = "inline-block";
      }
    })
    .catch(err => console.error("Failed to check 2FA status:", err));
}

function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  
  if (!username || !password) {
    alert("Please enter both username and password");
    return;
  }
  
  // Disable button to prevent double clicks
  const loginBtn = document.getElementById("loginBtn");
  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";
  
  csrfFetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username,
      password: password
    })
  })
  .then(res => {
    if (!res.ok) {
      // Check for specific error messages
      return res.json().then(data => {
        throw new Error(data.error || "Login failed");
      });
    }
    return res.json();
  })
  .then(data => {
    if (data.requires2fa) {
      // Store username for 2FA verification
      document.getElementById("loginUsername").dataset.username = username;
      document.getElementById("loginPassword").value = "";
      openTwoFactorModal();
    } else {
      // Clear form
      document.getElementById("loginUsername").value = "";
      document.getElementById("loginPassword").value = "";
      
      // Verify session is established before reloading
      verifySessionAndReload();
    }
  })
  .catch(err => {
    alert(err.message || "Login failed. Please check your credentials.");
  })
  .finally(() => {
    // Re-enable button
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  });
}


function verifyTwoFactorLogin() {
  const username = document.getElementById("loginUsername").dataset.username;
  const code = document.getElementById("twoFactorCode").value;
  
  if (!code || code.length !== 6) {
    alert("Please enter a valid 6-digit code");
    return;
  }
  
  // Disable button to prevent double clicks
  const verifyBtn = document.getElementById("twoFactorVerifyBtn");
  verifyBtn.disabled = true;
  verifyBtn.textContent = "Verifying...";
  
  csrfFetch("/login-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, code })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(() => {
    closeTwoFactorModal();
    document.getElementById("twoFactorCode").value = "";
    // Verify session before reloading
    verifySessionAndReload();
  })
  .catch(() => {
    alert("Invalid authenticator code. Please try again.");
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify";
  });
}

function verifyTwoFactorLogin() {
  const username = document.getElementById("loginUsername").dataset.username;
  const code = document.getElementById("twoFactorCode").value;
  
  if (!code || code.length !== 6) {
    alert("Please enter a valid 6-digit code");
    return;
  }
  
  csrfFetch("/login-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, code })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(() => {
    closeTwoFactorModal();
    document.getElementById("twoFactorCode").value = "";
    window.location.reload();
  })
  .catch(() => alert("Invalid authenticator code"));
}

function openTwoFactorModal() {
  document.getElementById("authModal").style.display = "none"; // Add this line
  document.getElementById("twoFactorModal").style.display = "flex";
  document.getElementById("twoFactorCode").value = "";
  document.getElementById("twoFactorCode").focus();
}

function closeTwoFactorModal() {
  document.getElementById("twoFactorModal").style.display = "none";
}

function logout() {
  csrfFetch("/logout", { method: "POST" })
    .then(() => {
      window.location.reload();
    })
    .catch(() => alert("Logout failed"));
}

function isPasswordSecure(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function signup() {
  const password = document.getElementById("signupPassword").value;
  if (!isPasswordSecure(password)) {
    alert("Password must be at least 8 characters and include uppercase, lowercase, number, and special character.");
    return;
  }
  
  csrfFetch("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password })
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(data => { throw new Error(data.error || "Signup failed"); });
    }
    return res.json();
  })
  .then(data => {
    // Store pending signup data INCLUDING the token
    pendingSignupData = {
      username: data.username,
      tempSecret: data.tempSecret,
      signupToken: data.signupToken  // NEW: Store the token
    };
    
    // Show 2FA setup modal with QR code
    document.getElementById("qrCodeImage").src = data.qrCode;
    document.getElementById("manualSecret").textContent = data.tempSecret;
    document.getElementById("signupPassword").value = "";
    
    document.getElementById("authModal").style.display = "none";
    document.getElementById("twoFactorSetupModal").style.display = "flex";
    document.getElementById("setupTwoFactorCode").value = "";
    document.getElementById("setupTwoFactorCode").focus();
    
    console.log("Signup token received:", data.signupToken);
  })
  .catch(err => alert(err.message));
}

function verifyTwoFactorSetup() {
  const code = document.getElementById("setupTwoFactorCode").value;
  if (!code || code.length !== 6) {
    alert("Please enter a valid 6-digit code");
    return;
  }
  
  csrfFetch("/signup-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: pendingSignupData.username,
      code: code,
      tempSecret: pendingSignupData.tempSecret,
      signupToken: pendingSignupData.signupToken  // NEW: Send the token
    })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(() => {
    closeTwoFactorSetupModal();
    alert(`Signup successful! Your username is: ${pendingSignupData.username}\n\nSAVE THIS USERNAME to login next time!\n\nYour authenticator is now set up.`);
    pendingSignupData = null;
    window.location.reload();
  })
  .catch(() => alert("Invalid authenticator code. Please try again."));
}

function openTwoFactorSetupModal() {
  document.getElementById("twoFactorSetupModal").style.display = "flex";
}

function closeTwoFactorSetupModal() {
  document.getElementById("twoFactorSetupModal").style.display = "none";
}

// Forgot Password Functions
function showForgotPassword() {
  document.getElementById("authModal").style.display = "none";  // ADD THIS LINE
  document.getElementById("forgotPasswordModal").style.display = "flex";
  document.getElementById("forgotUsername").value = "";
  document.getElementById("forgotPassword2FA").style.display = "none";
}

function closeForgotPasswordModal() {
  document.getElementById("forgotPasswordModal").style.display = "none";
  document.getElementById("authModal").style.display = "flex";
  pendingForgotPasswordUsername = null;
}

function checkForgotPasswordUser() {
  const username = document.getElementById("forgotUsername").value;
  if (!username) {
    alert("Please enter your username");
    return;
  }
  
  csrfFetch("/api/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username })
  })
  .then(res => res.json())
  .then(data => {
    pendingForgotPasswordUsername = username;
    if (data.requires2fa) {
      document.getElementById("forgotPassword2FA").style.display = "block";
      document.getElementById("forgotTwoFactorCode").focus();
    } else {
      // No 2FA, show password reset directly
      document.getElementById("forgotPassword2FA").style.display = "block";
    }
  })
  .catch(err => alert("Error checking user: " + err.message));
}

function resetPasswordWith2FA() {
  const username = pendingForgotPasswordUsername;
  const code = document.getElementById("forgotTwoFactorCode").value;
  const newPassword = document.getElementById("forgotNewPassword").value;
  const confirmPassword = document.getElementById("forgotConfirmPassword").value;
  
  if (!isPasswordSecure(newPassword)) {
    alert("Password must be at least 8 characters and include uppercase, lowercase, number, and special character.");
    return;
  }
  
  if (newPassword !== confirmPassword) {
    alert("Passwords do not match");
    return;
  }
  
  csrfFetch("/api/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username,
      code: code,
      newPassword: newPassword
    })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(data => {
    alert("Password reset successful! Please login with your new password.");
    closeForgotPasswordModal();
  })
  .catch(() => alert("Password reset failed. Please check your authenticator code."));
}

// 2FA Management Functions
function openTwoFactorManagement() {
  document.getElementById("accountModal").style.display = "none";
  document.getElementById("twoFactorManageModal").style.display = "flex";
  document.getElementById("generate2FASection").style.display = "block";
  document.getElementById("qrCodeManageSection").style.display = "none";
}

function closeTwoFactorManageModal() {
  document.getElementById("twoFactorManageModal").style.display = "none";
}

function generateNewTwoFactor() {
  csrfFetch("/api/manage-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "generate" })
  })
  .then(res => res.json())
  .then(data => {
    document.getElementById("qrCodeManageImage").src = data.qrCode;
    document.getElementById("manualSecretManage").textContent = data.tempSecret;
    document.getElementById("generate2FASection").style.display = "none";
    document.getElementById("qrCodeManageSection").style.display = "block";
    document.getElementById("manageTwoFactorCode").value = "";
    document.getElementById("manageTwoFactorCode").focus();
  })
  .catch(err => alert("Error generating 2FA: " + err.message));
}

function verifyAndEnableTwoFactor() {
  const code = document.getElementById("manageTwoFactorCode").value;
  
  if (!code || code.length !== 6) {
    alert("Please enter a valid 6-digit code");
    return;
  }
  
  csrfFetch("/api/manage-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify_and_enable", code: code })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(() => {
    alert("Two-factor authentication enabled successfully!");
    closeTwoFactorManageModal();
    checkTwoFactorStatus();
  })
  .catch(() => alert("Invalid code. Please try again."));
}

function disableTwoFactor() {
  const code = document.getElementById("disableTwoFactorCode").value;
  
  if (!code || code.length !== 6) {
    alert("Please enter your current authenticator code");
    return;
  }
  
  if (!confirm("Are you sure you want to disable two-factor authentication? This will make your account less secure.")) {
    return;
  }
  
  csrfFetch("/api/manage-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "disable", code: code })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(() => {
    alert("Two-factor authentication has been disabled.");
    document.getElementById("disableTwoFactorCode").value = "";
    checkTwoFactorStatus();
  })
  .catch(() => alert("Invalid code. Please try again."));
}

function fetchUserFollowing() {
  if (!currentSessionUsername) return;
  
  fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      currentUserFollowing = data.following || [];
      // Update all follow buttons on the page
      updateFollowButtons();
    })
    .catch(err => console.error("Failed to fetch user following:", err));
}

function updateFollowButtons() {
  // THIS IS THE ONLY CHANGE NEEDED - added ", .follow-btn"
  document.querySelectorAll('.post-follow-btn, .follow-btn').forEach(btn => {
    const username = btn.id.replace('followBtn-', '');
    if (currentUserFollowing && currentUserFollowing.includes(username)) {
      btn.textContent = "Following";
      btn.classList.add("following");
    } else {
      btn.textContent = "Follow";
      btn.classList.remove("following");
    }
  });
}

function changePassword() {
  const oldPassword = document.getElementById("oldPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  if (!isPasswordSecure(newPassword)) {
    alert("New password must be at least 8 characters and include uppercase, lowercase, number, and special character.");
    return;
  }
  csrfFetch("/api/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      oldPassword,
      newPassword
    })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    alert("Password changed");
    document.getElementById("oldPassword").value = "";
    document.getElementById("newPassword").value = "";
  })
  .catch(() => alert("Password change failed"));
}

function uploadPfp() {
  const file = document.getElementById("pfpInput").files[0];
  if (!file) {
    alert("Please select a file first");
    return;
  }
  
  // Check if GIF and premium
  if (file.type === 'image/gif') {
    fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.isPremium !== true) {
          alert("GIF profile pictures are a Premium feature!");
          document.getElementById("pfpInput").value = "";
          return;
        }
        // Continue with upload
        doPfpUpload(file);
      })
      .catch(err => {
        console.error("Error checking premium status:", err);
        doPfpUpload(file);
      });
  } else {
    doPfpUpload(file);
  }
}

function doPfpUpload(file) {
  document.getElementById("pfpUploadProgress").style.display = "block";
  const formData = new FormData();
  formData.append("pfp", file);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload-pfp", true);
  xhr.setRequestHeader("X-CSRF-Token", csrfToken);
  xhr.withCredentials = true;
  xhr.upload.onprogress = function(event) {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;
      document.getElementById("pfpUploadProgressFill").style.width = percentComplete + "%";
    }
  };
  xhr.onload = function() {
    if (xhr.status === 200) {
      document.getElementById("pfpUploadProgress").style.display = "none";
      const data = JSON.parse(xhr.responseText);
      const newPfp = data.pfp || "favicon.ico";
      // Update header PFP
      document.getElementById("accountPfp").src = newPfp;
      document.getElementById("oldaccountPfp").src = newPfp;
      document.getElementById("mobileaccountPfp").src = newPfp;
      // Update modal PFP if modal is open
      const modalPfp = document.getElementById("accountModalPfp");
      if (modalPfp) {
        modalPfp.src = newPfp;
      }
      document.getElementById("pfpInput").value = "";
      document.getElementById("pfpFileName").textContent = "No file chosen";
      checkAuth();
    } else {
      document.getElementById("pfpUploadProgress").style.display = "none";
      alert("Upload failed");
    }
  };
  xhr.onerror = function() {
    document.getElementById("pfpUploadProgress").style.display = "none";
    alert("Upload failed");
  };
  xhr.send(formData);
}

function openAccountModal() {
  document.getElementById("accountModal").style.display = "flex";
  checkTwoFactorStatus();
  checkPremiumAndShowUsername();
  document.getElementById("accountUsername").textContent = currentSessionUsername;
  
  fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      // Set modal PFP
      const modalPfp = document.getElementById("accountModalPfp");
      modalPfp.src = data.pfp || "favicon.ico";
      
      // ✅ ADD THIS: Show current banner in account modal
      const bannerPreview = document.getElementById("bannerPreview");
      const bannerPreviewContainer = document.getElementById("bannerPreviewContainer");
      if (data.banner && data.banner !== "null") {
        bannerPreview.src = data.banner;
        bannerPreviewContainer.style.display = "block";
      } else {
        bannerPreviewContainer.style.display = "none";
      }
    })
    .catch(err => {
      console.error("Failed to load user info:", err);
      document.getElementById("accountModalPfp").src = "favicon.ico";
    });
}

function closeAccountModal() {
  document.getElementById("accountModal").style.display = "none";
}

function openPostModal() {
  document.getElementById("postModal").style.display = "flex";
}

function closePostModal() {
  document.getElementById("postModal").style.display = "none";
  document.getElementById("postModalInput").value = "";
  document.getElementById("postModalImageInput").value = null;
  const fileName = document.getElementById("postModalFileName");
  const progress = document.getElementById("postModalUploadProgress");
  const progressFill = document.getElementById("postModalUploadProgressFill");
  if (fileName) fileName.textContent = "No file chosen";
  if (progress) progress.style.display = "none";
  if (progressFill) progressFill.style.width = "0%";
}

function openEditModal(postId) {
  // Convert both to strings for comparison
  const post = allPosts.find(p => String(p.id) === String(postId));
  if (!post) {
    console.error("Post not found:", postId, allPosts.map(p => p.id));
    return;
  }
  document.getElementById("editModalInput").value = post.message;
  document.getElementById("editPostBtn").onclick = () => editPost(postId);
  document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  document.getElementById("editModalInput").value = "";
}

function openDeleteConfirmModal(postId) {
  document.getElementById("deleteConfirmBtn").onclick = () => deletePost(postId);
  document.getElementById("deleteConfirmModal").style.display = "flex";
}

function closeDeleteConfirmModal() {
  document.getElementById("deleteConfirmModal").style.display = "none";
}

function openReplyModal(postId) {
  const originalPost = allPosts.find(p => String(p.id) === String(postId));
  if (!originalPost) return;

  const originalPostElement = createPostElement(originalPost, true);
  originalPostElement.classList.add('original-post');
  const originalPostDiv = document.getElementById("originalPost");
  if (originalPostDiv) {
    originalPostDiv.innerHTML = '';
    originalPostDiv.appendChild(originalPostElement);
  }

  const sendReplyBtn = document.getElementById("sendReplyBtn");
  if (sendReplyBtn) {
    sendReplyBtn.onclick = () => sendReply(postId);
  }
  
  const replyInput = document.getElementById("replyInput");
  if (replyInput) replyInput.value = "";
  
  const repliesFeed = document.getElementById("repliesFeed");
  if (repliesFeed) repliesFeed.innerHTML = '<div style="text-align:center; padding:20px;">Loading replies...</div>';
  
  const replyModal = document.getElementById("replyModal");
  if (replyModal) replyModal.style.display = "flex";
  
  // Load replies after modal is shown
  loadReplies(postId);
}

function closeReplyModal() {
  document.getElementById("replyModal").style.display = "none";
}

function openQuoteModal(postId) {
  const originalPost = allPosts.find(p => String(p.id) === String(postId));
  if (!originalPost) return;

  activeQuotePostId = postId;
  const quoteInput = document.getElementById("quoteModalInput");
  const quoteCount = document.getElementById("quoteCharCount");
  const preview = document.getElementById("quoteOriginalPost");

  if (quoteInput) quoteInput.value = "";
  if (quoteCount) quoteCount.textContent = "0 / 280";
  if (preview) {
    preview.innerHTML = renderQuotedPost({
      id: originalPost.id,
      username: originalPost.username,
      message: originalPost.message,
      imageUrl: originalPost.imageUrl,
      isVideo: originalPost.isVideo || false,
      timestamp: originalPost.timestamp,
      pfp: originalPost.pfp
    });
  }

  const quoteModal = document.getElementById("quoteModal");
  if (quoteModal) quoteModal.style.display = "flex";
}

function closeQuoteModal() {
  activeQuotePostId = null;
  const quoteModal = document.getElementById("quoteModal");
  const quoteInput = document.getElementById("quoteModalInput");
  if (quoteModal) quoteModal.style.display = "none";
  if (quoteInput) quoteInput.value = "";
}

function submitQuotePost() {
  const quoteInput = document.getElementById("quoteModalInput");
  const quoteBtn = document.getElementById("quotePostBtn");
  const message = quoteInput ? quoteInput.value.trim() : "";

  if (!activeQuotePostId || !message) {
    alert("Add a short take before quoting.");
    return;
  }

  if (quoteBtn) {
    quoteBtn.disabled = true;
    quoteBtn.textContent = "Quoting...";
  }

  csrfFetch(`/api/messages/quote/${activeQuotePostId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to quote post");
      }
      return res.json();
    })
    .then(savedQuote => {
      savedQuote.isOwnPost = true;
      allPosts.unshift(savedQuote);
      const feed = document.getElementById("feed");
      if (feed) {
        const quoteElement = createPostElement(savedQuote, true);
        feed.insertBefore(quoteElement, feed.firstChild);
      }
      const original = allPosts.find(p => String(p.id) === String(activeQuotePostId));
      if (original) original.quoteCount = (original.quoteCount || 0) + 1;
      closeQuoteModal();
    })
    .catch(err => alert(err.message))
    .finally(() => {
      if (quoteBtn) {
        quoteBtn.disabled = false;
        quoteBtn.textContent = "Quote";
      }
    });
}

function togglePinPost(postId) {
  csrfFetch(`/api/messages/pin/${postId}`, { method: "POST" })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update pinned post");
      }
      return res.json();
    })
    .then(data => {
      allPosts = allPosts.map(post => ({
        ...post,
        isPinned: data.pinnedPostId && String(post.id) === String(data.pinnedPostId)
      }));
      loadPosts();
    })
    .catch(err => alert(err.message));
}

function loadReplies(postId) {
  fetch(`/api/messages/${postId}/replies`, { credentials: "include" })
    .then(res => res.json())
    .then(replies => {
      const repliesFeed = document.getElementById("repliesFeed");
      if (!repliesFeed) return;
      
      repliesFeed.innerHTML = "";
      
      // Separate user's own replies from others
      const userReplies = replies.filter(r => r.username === currentSessionUsername);
      const otherReplies = replies.filter(r => r.username !== currentSessionUsername);
      
      // Sort user replies newest first
      userReplies.sort((a, b) => b.timestamp - a.timestamp);
      // Sort other replies oldest first (chronological)
      otherReplies.sort((a, b) => a.timestamp - b.timestamp);
      
      // Combine: user replies first, then others
      const sortedReplies = [...userReplies, ...otherReplies];
      
      // Fetch premium status for unknown users
      const unknownUsers = [...new Set(sortedReplies.map(r => r.username))]
        .filter(u => !userPremiumCache.has(u) && u !== currentSessionUsername);
      
      const fetchPromises = unknownUsers.map(u => 
        fetch(`/api/user-info/${encodeURIComponent(u)}`)
          .then(res => res.json())
          .then(data => {
            userPremiumCache.set(u, data.isPremium || false);
          })
          .catch(() => userPremiumCache.set(u, false))
      );
      
      return Promise.all(fetchPromises).then(() => sortedReplies);
    })
    .then(replies => {
      const repliesFeed = document.getElementById("repliesFeed");
      if (!repliesFeed) return;
      
      repliesFeed.innerHTML = "";
      
      replies.forEach(reply => {
        reply.isPremium = userPremiumCache.get(reply.username) || false;
        const replyElement = createPostElement(reply, false);
        
        // Add "You" badge for user's own replies
        if (reply.username === currentSessionUsername) {
          const youBadge = document.createElement('span');
          youBadge.className = 'you-badge';
          youBadge.textContent = 'You';
          youBadge.style.cssText = 'background: var(--theme-accent); color: white; font-size: 10px; padding: 2px 8px; border-radius: 12px; margin-left: 8px; font-weight: normal; display: inline-block; vertical-align: middle;';
          const usernameContainer = replyElement.querySelector('.username-container');
          if (usernameContainer) usernameContainer.appendChild(youBadge);
          
          // Add a special class for styling
          replyElement.classList.add('user-own-reply');
        }
        
        repliesFeed.appendChild(replyElement);
      });
      
      // If no replies, show message
      if (replies.length === 0) {
        repliesFeed.innerHTML = '<p style="text-align:center; color: var(--theme-text-secondary); padding: 20px;">No replies yet. Be the first to reply!</p>';
      }
    })
    .catch(err => {
      console.error("Failed to load replies:", err);
      const repliesFeed = document.getElementById("repliesFeed");
      if (repliesFeed) {
        repliesFeed.innerHTML = '<p style="text-align:center; color: var(--theme-text-secondary); padding: 20px;">Failed to load replies.</p>';
      }
    });
}

function sendReply(postId) {
  const replyInput = document.getElementById("replyInput");
  const message = replyInput.value.trim();
  if (!message) {
    alert("Reply cannot be empty.");
    return;
  }
  
  // Create temporary reply for optimistic UI
  const tempReplyId = "temp_reply_" + Date.now();
  const tempReply = {
    id: tempReplyId,
    username: currentSessionUsername,
    message: message,
    timestamp: Date.now(),
    imageUrl: null,
    isVideo: false,
    pfp: document.getElementById("accountPfp")?.src || "favicon.ico",
    parentId: postId,
    likes: [],
    saves: [],
    retweets: [],
    isPremium: false,
    views: 0,
    replyCount: 0,
    isOwnPost: true,
    isTemporary: true
  };
  
  // Add to replies feed immediately
  const repliesFeed = document.getElementById("repliesFeed");
  if (repliesFeed) {
    const tempReplyElement = createPostElement(tempReply, false);
    // Add "You" badge
    const youBadge = document.createElement('span');
    youBadge.className = 'you-badge';
    youBadge.textContent = 'You';
    youBadge.style.cssText = 'background: var(--theme-accent); color: white; font-size: 10px; padding: 2px 8px; border-radius: 12px; margin-left: 8px;';
    const usernameContainer = tempReplyElement.querySelector('.username-container');
    if (usernameContainer) usernameContainer.appendChild(youBadge);
    tempReplyElement.classList.add('user-own-reply');
    
    // Insert at the top of replies (since user's own replies go first)
    if (repliesFeed.firstChild) {
      repliesFeed.insertBefore(tempReplyElement, repliesFeed.firstChild);
    } else {
      repliesFeed.appendChild(tempReplyElement);
    }
  }
  
  // Clear input
  replyInput.value = "";
  
  // Send to server
  const formData = new FormData();
  formData.append("message", message);
  formData.append("parentId", postId);
  
  csrfFetch(apiUrl, {
    method: "POST",
    body: formData
  })
  .then(async res => {
    if (!res.ok) {
      let errMsg = "Error posting reply";
      try {
        const data = await res.json();
        if (data && data.error) errMsg = data.error;
      } catch {}
      throw new Error(errMsg);
    }
    return res.json();
  })
  .then(savedReply => {
    // Replace temporary reply with real reply
    const tempElement = document.querySelector(`.post[data-post-id="${tempReplyId}"]`);
    if (tempElement) {
      savedReply.isPremium = false;
      const newReplyElement = createPostElement(savedReply, false);
      // Add "You" badge to new element
      const youBadge = document.createElement('span');
      youBadge.className = 'you-badge';
      youBadge.textContent = 'You';
      youBadge.style.cssText = 'background: var(--theme-accent); color: white; font-size: 10px; padding: 2px 8px; border-radius: 12px; margin-left: 8px;';
      const usernameContainer = newReplyElement.querySelector('.username-container');
      if (usernameContainer) usernameContainer.appendChild(youBadge);
      newReplyElement.classList.add('user-own-reply');
      tempElement.replaceWith(newReplyElement);
    }
    
    // Update reply count in the original post
    updateReplyCountInFeed(postId);
  })
  .catch(err => {
    console.error("Error posting reply:", err);
    // Remove temporary reply on error
    const tempElement = document.querySelector(`.post[data-post-id="${tempReplyId}"]`);
    if (tempElement) tempElement.remove();
    alert(err.message || "Failed to post reply");
  });
}

function updateReplyCountInFeed(postId) {
  // Find the post element in the feed
  const postElement = document.querySelector(`.post[data-post-id="${postId}"], .slash-card[data-post-id="${postId}"]`);
  if (postElement) {
    const replyCountSpan = postElement.querySelector('.action-group .action-count');
    if (replyCountSpan) {
      const currentCount = parseInt(replyCountSpan.textContent) || 0;
      replyCountSpan.textContent = currentCount + 1;
    }
  }
  
  // Also update in allPosts array
  const post = allPosts.find(p => p.id == postId);
  if (post) {
    post.replyCount = (post.replyCount || 0) + 1;
  }
}

function postFromModal() {
  const input = document.getElementById("postModalInput");
  const imageInput = document.getElementById("postModalImageInput");
  const message = input.value.trim();
  postMessageInternal(message, imageInput.files[0]);
  closePostModal();
}

let lastMessagesJson = "";

// Modify the loadPosts function to include premium status
// Find loadPosts and modify it:

// Add this helper function to resolve retweet posts
function resolveRetweetPost(post, allMessages) {
  if (post.isRetweet && post.retweetOf) {
    const originalPost = allMessages.find(p => p.id === post.retweetOf);
    if (originalPost) {
      // Return a copy with original post data but retweet metadata
      return {
        ...originalPost,
        id: post.id, // Keep the retweet's ID
        isRetweet: true,
        retweetedBy: post.username,
        retweetOf: post.retweetOf,
        retweetTimestamp: post.timestamp,
        originalUsername: originalPost.username,
        originalTimestamp: originalPost.timestamp
      };
    }
  }
  return post;
}

// Update your loadPosts function to resolve retweets
function loadPosts() {
  if (isLoadingPosts) {
    console.log("Already loading posts, skipping...");
    return;
  }

  if (skipNextLoad) {
    skipNextLoad = false;
    return;
  }
  
  isLoadingPosts = true;
  const feed = document.getElementById("feed");
  
  if (!feed.innerHTML.trim()) {
    feed.innerHTML = `<li class="post-skeleton"></li> <li class="post-skeleton"></li> <li class="post-skeleton"></li>`;
  }
  
  fetch(apiUrl, { credentials: "include" })
    .then(response => {
      if (!response.ok) throw new Error("Failed to fetch posts");
      return response.json();
    })
    .then(posts => {
      // Resolve retweets to show original content
      const resolvedPosts = posts.map(post => resolveRetweetPost(post, posts));
      
      allPosts = resolvedPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      const newMessagesJson = JSON.stringify(allPosts);
      
      if (newMessagesJson !== lastMessagesJson) {
        lastMessagesJson = newMessagesJson;
        feed.innerHTML = "";
        
        allPosts.forEach(post => {
          addPostToFeed(post, false);
        });
      }
    })
    .catch(err => {
      console.error("Failed to load posts:", err);
      if (!feed.innerHTML.trim() || feed.querySelector('.post-skeleton')) {
        feed.innerHTML = "<li style='color:#888'>Unable to load posts.</li>";
      }
    })
    .finally(() => {
      isLoadingPosts = false;
    });
    setTimeout(() => {
      observePostVisibility();
    }, 100);
}

// Tab switching logic
function setupFeedTabs() {
  const forYouTab = document.getElementById("tab-for-you");
  const followingTab = document.getElementById("tab-following");

  function setActiveFeedTab(activeTab, inactiveTab) {
    activeTab.classList.add("active");
    activeTab.setAttribute("aria-selected", "true");
    inactiveTab.classList.remove("active");
    inactiveTab.setAttribute("aria-selected", "false");
  }
  
  if (forYouTab && followingTab) {
    forYouTab.addEventListener("click", () => {
      currentFeedTab = "discovery";
      setActiveFeedTab(forYouTab, followingTab);
      loadAlgorithmicFeed();
    });

    followingTab.addEventListener("click", () => {
      currentFeedTab = "following";
      setActiveFeedTab(followingTab, forYouTab);
      loadPosts(); // This should fetch posts from people you follow
    });
  }
}

function postMessage() {
  const input = document.getElementById("postInput");
  const imageInput = document.getElementById("imageInput");
  const captionInput = document.getElementById("mediaCaptionInput");
  const altInput = document.getElementById("mediaAltInput");
  const message = input.value.trim();
  const selectedFile = imageInput.files[0] || null;
  const mediaCaption = captionInput?.value?.trim() || "";
  const mediaAlt = altInput?.value?.trim() || "";
  const mediaValidation = validateComposerMedia(selectedFile);
  if (!mediaValidation.ok) {
    alert(mediaValidation.message);
    return;
  }
  
  if (!message && !selectedFile) {
    alert("You must enter a message or select an image.");
    return;
  }
  
  // Create a temporary post object for optimistic UI
  const tempId = "temp_" + Date.now();
  const tempPost = {
    id: tempId,
    username: currentSessionUsername,
    message: message,
    timestamp: Date.now(),
    imageUrl: null,
    isVideo: selectedFile ? selectedFile.type.startsWith("video/") : false,
    mediaCaption,
    mediaAlt,
    mediaSize: selectedFile?.size || null,
    pfp: document.getElementById("accountPfp")?.src || "favicon.ico",
    parentId: null,
    likes: [],
    saves: [],
    retweets: [],
    isPremium: false,
    views: 0,
    replyCount: 0,
    isOwnPost: true,
    isTemporary: true,
    isOptimistic: true
  };
  
  // If there's an image, create a preview in the temp post
  if (selectedFile) {
    const file = selectedFile;
    const reader = new FileReader();
    reader.onload = function(e) {
      tempPost.imageUrl = e.target.result;
      const tempElement = document.querySelector(`.post[data-post-id="${tempId}"]`);
      if (tempElement) {
        const imgElement = tempElement.querySelector('.slash-content img');
        if (imgElement) {
          imgElement.src = e.target.result;
        } else if (file.type.startsWith('video/')) {
          const videoElement = tempElement.querySelector('.slash-content video');
          if (videoElement) videoElement.src = e.target.result;
        } else {
          const contentDiv = tempElement.querySelector('.slash-content');
          if (contentDiv) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.cssText = 'max-width: 100%; border-radius: 10px; margin-top: 10px; cursor: pointer;';
            img.onclick = (e) => { e.stopPropagation(); openImageViewer(e.target.src); };
            contentDiv.appendChild(img);
          }
        }
      }
    };
    reader.readAsDataURL(file);
  }
  
  // Add to feed at the VERY TOP (immediately) - DO NOT add to allPosts array
  const feed = document.getElementById("feed");
  const tempPostElement = createPostElement(tempPost, true);
  tempPostElement.classList.add('optimistic-post');
  if (feed.firstChild) {
    feed.insertBefore(tempPostElement, feed.firstChild);
  } else {
    feed.appendChild(tempPostElement);
  }
  
  // Store in temporary array only (NOT in allPosts)
  if (!window.optimisticPosts) window.optimisticPosts = [];
  window.optimisticPosts.push({ id: tempId, element: tempPostElement });
  
  // Clear input fields
  input.value = "";
  
  // Clear image preview
  imageInput.value = null;
  const fileNameDisplay = document.getElementById("fileName");
  if (fileNameDisplay) fileNameDisplay.textContent = "No media selected";
  const previewContainer = document.getElementById("previewContainer");
  if (previewContainer) previewContainer.style.display = 'none';
  if (captionInput) captionInput.value = "";
  if (altInput) altInput.value = "";
  updateMediaInsight(null);
  const preview = document.getElementById("preview");
  if (preview) preview.src = "";
  const videoPreview = document.getElementById("videoPreview");
  if (videoPreview) {
    videoPreview.removeAttribute("src");
    videoPreview.load();
    videoPreview.style.display = "none";
  }
  if (activeComposerPreviewUrl) {
    URL.revokeObjectURL(activeComposerPreviewUrl);
    activeComposerPreviewUrl = null;
  }
  if (window.updateComposerState) window.updateComposerState();
  
  // Actual upload to server
  const formData = new FormData();
  formData.append("message", message);
  formData.append("caption", mediaCaption);
  formData.append("altText", mediaAlt);
  if (selectedFile) {
    formData.append("image", selectedFile);
  }
  
  const progressBar = document.getElementById("imageUploadProgress");
  if (progressBar) progressBar.style.display = "block";
  
  const xhr = new XMLHttpRequest();
  xhr.open("POST", apiUrl, true);
  xhr.setRequestHeader("X-CSRF-Token", csrfToken);
  xhr.withCredentials = true;
  
  xhr.upload.onprogress = function(event) {
    if (event.lengthComputable && progressBar) {
      const percentComplete = (event.loaded / event.total) * 100;
      const fillBar = document.getElementById("imageUploadProgressFill");
      if (fillBar) fillBar.style.width = percentComplete + "%";
    }
  };
  
  xhr.onload = function() {
    if (progressBar) progressBar.style.display = "none";
    
    if (xhr.status === 200) {
      const savedPost = JSON.parse(xhr.responseText);
      
      fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
        .then(res => res.json())
        .then(userData => {
          savedPost.isPremium = userData.isPremium === true;
          savedPost.views = 0;
          savedPost.replyCount = 0;
          savedPost.likes = [];
          savedPost.saves = [];
          savedPost.retweets = [];
          savedPost.isOwnPost = true;
          
          // Replace the optimistic post with the real one
          const optimisticElement = document.querySelector(`.post[data-post-id="${tempId}"]`);
          if (optimisticElement) {
            const realPostElement = createPostElement(savedPost, true);
            optimisticElement.replaceWith(realPostElement);
          }
          
          // Remove from optimistic storage
          if (window.optimisticPosts) {
            window.optimisticPosts = window.optimisticPosts.filter(p => p.id !== tempId);
          }
          
          // Add to allPosts only AFTER server confirms
          allPosts.unshift(savedPost);
          loadCreatorGallery();
        })
        .catch(err => {
          console.error("Error fetching user data:", err);
          const optimisticElement = document.querySelector(`.post[data-post-id="${tempId}"]`);
          if (optimisticElement) {
            const realPostElement = createPostElement(savedPost, true);
            optimisticElement.replaceWith(realPostElement);
          }
          loadCreatorGallery();
        });
    } else {
      // Remove optimistic post on error
      const optimisticElement = document.querySelector(`.post[data-post-id="${tempId}"]`);
      if (optimisticElement) optimisticElement.remove();
      if (window.optimisticPosts) {
        window.optimisticPosts = window.optimisticPosts.filter(p => p.id !== tempId);
      }
      alert("Error posting message");
    }
  };
  
  xhr.onerror = function() {
    if (progressBar) progressBar.style.display = "none";
    const optimisticElement = document.querySelector(`.post[data-post-id="${tempId}"]`);
    if (optimisticElement) optimisticElement.remove();
    if (window.optimisticPosts) {
      window.optimisticPosts = window.optimisticPosts.filter(p => p.id !== tempId);
    }
    alert("Error posting message");
  };
  
  xhr.send(formData);
}

function loadProfilePosts(username) {
  const feed = document.getElementById("profilePostsFeed");
  feed.innerHTML = '<div class="post-skeleton"></div>';
  
  fetch(`/api/messages/user/${encodeURIComponent(username)}`, { credentials: "include" })
    .then(res => res.json())
    .then(posts => {
      feed.innerHTML = "";
      if (!posts || posts.length === 0) {
        feed.innerHTML = '<p style="text-align:center; color: var(--theme-text-secondary);">No posts yet.</p>';
        return;
      }
      posts.forEach(post => {
        const postElement = createPostElement(post, false);
        feed.appendChild(postElement);
      });
    })
    .catch(err => {
      console.error("Failed to load profile posts:", err);
      feed.innerHTML = '<p style="text-align:center; color: var(--theme-text-secondary);">Failed to load posts.</p>';
    });
}

//event listener for the main file input
const postModalImageInputElement = document.getElementById('postModalImageInput');
if (postModalImageInputElement) {
  postModalImageInputElement.addEventListener('change', function(e) {
    const fileName = e.target.files[0] ? e.target.files[0].name : 'No file chosen';
    const modalFileName = document.getElementById('postModalFileName');
    if (modalFileName) modalFileName.textContent = fileName;
  });
}
//FUNCTION FOR THE MODAL POSTING TOO:
function postFromModal() {
  const input = document.getElementById("postModalInput");
  const imageInput = document.getElementById("postModalImageInput");
  const fileNameDisplay = document.getElementById("postModalFileName");
  const message = input.value.trim();
  
  if (!message && !imageInput.files[0]) {
    alert("You must enter a message or select an image.");
    return;
  }
  
  const formData = new FormData();
  formData.append("message", message);
  if (imageInput.files[0]) {
    formData.append("image", imageInput.files[0]);
  }
  
  // Show progress bar
  document.getElementById("postModalUploadProgress").style.display = "block";
  
  const xhr = new XMLHttpRequest();
  xhr.open("POST", apiUrl, true);
  xhr.setRequestHeader("X-CSRF-Token", csrfToken);
  xhr.withCredentials = true;
  
  xhr.upload.onprogress = function(event) {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;
      document.getElementById("postModalUploadProgressFill").style.width = percentComplete + "%";
    }
  };
  
  xhr.onload = function() {
    if (xhr.status === 200) {
      document.getElementById("postModalUploadProgress").style.display = "none";
      const savedPost = JSON.parse(xhr.responseText);
      addPostToFeed(savedPost, true);
      input.value = "";
      imageInput.value = "";
      fileNameDisplay.textContent = "No file chosen";
      
      // Clear preview - modal area
      const modalPreview = document.getElementById('modalPreview');
      const modalPreviewContainer = document.getElementById('modalPreviewContainer');
      if (modalPreview) modalPreview.src = '';
      if (modalPreviewContainer) modalPreviewContainer.style.display = 'none';
      
      closePostModal();
    } else {
      document.getElementById("postModalUploadProgress").style.display = "none";
      alert("Error posting message");
    }
  };
  
  xhr.onerror = function() {
    document.getElementById("postModalUploadProgress").style.display = "none";
    alert("Error posting message");
  };
  
  xhr.send(formData);
}

function editPost(postId) {
  const newContent = document.getElementById("editModalInput").value.trim();
  if (!newContent) {
    alert("Post cannot be empty.");
    return;
  }
  // Convert postId to string to match
  csrfFetch(`/api/messages/${String(postId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: newContent })
  })
  .then(async res => {
    if (!res.ok) {
      let errMsg = "Error editing post";
      try {
        const data = await res.json();
        if (data && data.error) errMsg = data.error;
      } catch {}
      throw new Error(errMsg);
    }
    closeEditModal();
    loadPosts();
  })
  .catch(err => alert(err.message));
}

function deletePost(postId) {
  // Convert postId to string to match
  csrfFetch(`/api/messages/${String(postId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" }
  })
  .then(async res => {
    if (!res.ok) {
      let errMsg = "Error deleting post";
      try {
        const data = await res.json();
        if (data && data.error) errMsg = data.error;
      } catch {}
      throw new Error(errMsg);
    }
    closeDeleteConfirmModal();
    loadPosts();
  })
  .catch(err => alert(err.message));
}

function checkUserPremium(username) {
  return fetch(`/api/user-info/${encodeURIComponent(username)}`, { credentials: "include" })
    .then(res => res.json())
    .then(data => data.isPremium === true)
    .catch(() => false);
}

function createPostElement(post, isOriginal = false) {
  const li = document.createElement("li");
  li.className = "slash-card post";
  li.setAttribute("data-post-id", post.id);
  
  // Make the whole post clickable - but stop propagation on interactive elements
  li.style.cursor = "pointer";
  li.addEventListener("click", function(e) {
    // Don't navigate if clicking on buttons, links, menu items, or the three dots
    if (e.target.closest('button') || 
        e.target.closest('a') || 
        e.target.closest('.post-menu-container') ||
        e.target.closest('.post-follow-btn') ||
        e.target.closest('.dropdown-menu') ||
        e.target.closest('.action-btn')) {
      e.stopPropagation();
      return;
    }
    navigateToPost(post.id);
  });

  // Check if this is a retweet
  const isRetweet = post.isRetweet === true;
  const retweetedBy = post.retweetedBy || (isRetweet ? post.username : null);
  const originalAuthor = post.originalUsername || post.username;
  const displayUsername = isRetweet ? originalAuthor : post.username;
  const displayPfp = isRetweet ? (post.originalPfp || post.pfp) : post.pfp;
  
  // Use REAL view count from backend, fallback to 0
  const viewCount = post.views || 0;
  const isOwnPost = displayUsername === currentSessionUsername;
  
  // Create retweet header if needed
  let retweetHeader = '';
  if (isRetweet && retweetedBy) {
    retweetHeader = `
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px; color: var(--theme-text-secondary); font-size: 0.75rem;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        <span>${escapeHtml(retweetedBy)} Re-Slashed</span>
      </div>
    `;
  }

  // Verified Badge Logic
  let verifiedBadge = '';
  if (displayUsername && (displayUsername.startsWith("/admin") || displayUsername === "/cyberslash")) {
     verifiedBadge = `<span class="verified-icon-container"><img src="tick.png" width="16" height="16" alt="Verified" style="vertical-align: middle;"><div class="verified-tooltip">Verified By Cybers/ash</div></span>`;
  }

  let premiumBadge = post.isPremium ? `<span class="premium-badge" style="vertical-align: text-bottom; margin-top: 0px;">/P</span>` : '';

  // Action Button States
  const isLiked = post.likes && post.likes.includes(currentSessionUsername) ? 'liked' : '';
  const isSaved = post.saves && post.saves.includes(currentSessionUsername) ? 'saved' : '';
  const isRetweeted = post.retweets && post.retweets.includes(currentSessionUsername) ? 're-slashed' : '';

  // Media Rendering
  let mediaHtml = '';
  if (post.imageUrl) {
    const isVideo = post.imageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || post.isVideo === true;
    const mediaCaption = post.mediaCaption ? `<div class="media-caption">${escapeHtml(post.mediaCaption)}</div>` : "";
    const mediaAlt = escapeAttribute(post.mediaAlt || post.mediaCaption || "Post media");
    mediaHtml = isVideo 
      ? `<video src="${post.imageUrl}" controls preload="metadata" aria-label="${mediaAlt}" style="max-width: 100%; border-radius: 10px; margin-top: 10px;"></video>${mediaCaption}`
      : `<img src="${post.imageUrl}" alt="${mediaAlt}" onclick="event.stopPropagation(); openImageViewer('${post.imageUrl}')" style="max-width: 100%; border-radius: 10px; margin-top: 10px; cursor: pointer;">${mediaCaption}`;
  }

  const renderedMessage = renderPostText(post.message || '');
  const quotedPostHtml = renderQuotedPost(post.quotedPost);
  const pinnedHeader = post.isPinned ? `<div class="pinned-post-badge">Pinned Slash</div>` : '';
  const safeMenuPostId = escapeJsString(post.id);
  const safeMenuAuthor = escapeJsString(displayUsername);

  li.innerHTML = `
    ${pinnedHeader}
    ${retweetHeader}
    <div class="slash-header">
      <img src="${displayPfp || 'favicon.ico'}" alt="User" class="slash-avatar" onclick="event.stopPropagation(); window.location.href='./pf.html?user=${encodeURIComponent(displayUsername)}'" style="cursor:pointer;">
      <div class="slash-meta">
        <span class="username-container">
          <span class="slash-author-link username ${displayUsername.startsWith('/admin') ? 'admin' : ''}" data-username="${displayUsername}" onclick="event.stopPropagation(); window.location.href='./pf.html?user=${encodeURIComponent(displayUsername)}'">${escapeHtml(displayUsername)}</span>
          ${verifiedBadge}
          ${premiumBadge}
        </span>
        <span class="slash-time">${new Date(post.timestamp).toLocaleString()}</span>
      </div>

      <div class="post-menu-container" style="margin-left: auto; position: relative;" onclick="event.stopPropagation()">
        <div class="slash-options post-menu-btn" onclick="this.nextElementSibling.classList.toggle('show')">•••</div>
        <div class="dropdown-menu">
          <a class="dropdown-item" onclick="event.stopPropagation(); executeShare('${post.id}')">Share Post</a>
          <a class="dropdown-item" onclick="event.stopPropagation(); hidePostFromFeed('${safeMenuPostId}')">Hide this post</a>
          ${isOwnPost && !post.parentId && !isRetweet ? `
            <a class="dropdown-item" onclick="event.stopPropagation(); togglePinPost('${post.id}')">${post.isPinned ? 'Unpin from profile' : 'Pin to profile'}</a>
          ` : ''}
          ${isOwnPost ? `
            <a class="dropdown-item" onclick="event.stopPropagation(); openEditModal('${post.id}')">Edit</a>
            <a class="dropdown-item delete-option" onclick="event.stopPropagation(); openDeleteConfirmModal('${post.id}')">Delete</a>
          ` : `
            <a class="dropdown-item warning-option" onclick="event.stopPropagation(); reportPost('${safeMenuPostId}')">Report post</a>
            <a class="dropdown-item" onclick="event.stopPropagation(); muteUserFromPost('${safeMenuAuthor}')">Mute ${escapeHtml(displayUsername)}</a>
            <a class="dropdown-item danger-option" onclick="event.stopPropagation(); blockUserFromPost('${safeMenuAuthor}')">Block ${escapeHtml(displayUsername)}</a>
          `}
        </div>
      </div>
    </div>

    <div class="slash-content">
      <p class="message" style="margin-top:0;">${renderedMessage}</p>
      ${mediaHtml}
      ${quotedPostHtml}
    </div>

    <div class="slash-footer">
      <div class="slash-stats">
        <div class="stat-item" title="Views">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path></svg>
          <span>${viewCount}</span>
        </div>
      </div>

      <div class="slash-actions action-bar" style="margin:0; padding:0; border:none; background:transparent;">
        <div class="action-group">
            <button class="action-btn ${isLiked}" onclick="event.stopPropagation(); likePost('${post.id}')">
              <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
              <span class="action-count">${post.likes ? post.likes.length : 0}</span>
            </button>
        </div>
        ${!post.parentId && !isRetweet ? `
        <div class="action-group">
            <button class="action-btn" onclick="event.stopPropagation(); openReplyModal('${post.id}')">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v4l6-4h9zm-16.83-2H3V4h18v9h-9.58L8 15.05V13H4.17z"></path></svg>
              <span class="action-count">${post.replyCount || 0}</span>
            </button>
        </div>
        <div class="action-group">
            <button class="action-btn ${isRetweeted}" onclick="event.stopPropagation(); reSlashPost('${post.id}')">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
              <span class="action-count">${post.retweets ? post.retweets.length : 0}</span>
            </button>
        </div>
        <div class="action-group">
            <button class="action-btn ${isSaved}" onclick="event.stopPropagation(); savePost('${post.id}')">
              <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"></path></svg>
              <span class="action-count">${post.saves ? post.saves.length : 0}</span>
            </button>
        </div>
        <div class="action-group">
            <button class="action-btn" onclick="event.stopPropagation(); openQuoteModal('${post.id}')">
              <svg viewBox="0 0 24 24"><path d="M7 7h7v7H9v3H5V9c0-1.1.9-2 2-2zm10 0h2v7h-5v-4c0-1.66 1.34-3 3-3z"></path></svg>
              <span class="action-count">${post.quoteCount || 0}</span>
            </button>
        </div>
        ` : ''}
        ${isRetweet ? `
        <div class="action-group">
            <button class="action-btn" onclick="event.stopPropagation(); openReplyModal('${post.retweetOf || post.id}')">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v4l6-4h9zm-16.83-2H3V4h18v9h-9.58L8 15.05V13H4.17z"></path></svg>
              <span class="action-count">Reply</span>
            </button>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // Re-attach Profile Card Hover Events
  const userLink = li.querySelector('.slash-author-link');
  if(userLink) {
      userLink.addEventListener("mouseenter", (e) => showProfileCard(e, displayUsername));
      userLink.addEventListener("mouseleave", () => hideProfileCard());
  }

  // Natively Insert Follow Button into Header (only for non-retweet or original author)
  if (displayUsername && displayUsername !== currentSessionUsername && !isRetweet) {
    const header = li.querySelector('.slash-header');
    const followBtn = document.createElement("button");
    followBtn.className = "post-follow-btn";
    followBtn.id = `followBtn-${displayUsername}`;
    followBtn.style.marginLeft = "10px";
    followBtn.style.padding = "4px 12px";
    followBtn.style.borderRadius = "20px";
    followBtn.style.fontSize = "12px";
    followBtn.style.cursor = "pointer";
    followBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFollow(displayUsername);
    };
    if (currentUserFollowing && currentUserFollowing.includes(displayUsername)) {
      followBtn.textContent = "Following";
      followBtn.classList.add("following");
    } else {
      followBtn.textContent = "Follow";
      followBtn.classList.remove("following");
    }
    header.insertBefore(followBtn, li.querySelector('.post-menu-container'));
  }

  if (isOriginal === false && post.parentId) {
      li.classList.add('reply-post');
  }

  return li;
}

// Helper function to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(str) {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

function escapeJsString(str) {
  return String(str == null ? "" : str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderPostText(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/(^|[\s])#([A-Za-z0-9_]{1,40})/g, (match, prefix, tag) => {
      const href = `./search.html?q=${encodeURIComponent('#' + tag)}`;
      return `${prefix}<a class="post-token-link hashtag-link" href="${href}" onclick="event.stopPropagation()">#${tag}</a>`;
    })
    .replace(/(^|[\s])@([A-Za-z0-9_]{1,40})/g, (match, prefix, name) => {
      const username = `/${name}`;
      const href = `./pf.html?user=${encodeURIComponent(username)}`;
      return `${prefix}<a class="post-token-link mention-link" href="${href}" onclick="event.stopPropagation()">@${name}</a>`;
    });
}

function renderQuotedPost(quotedPost) {
  if (!quotedPost) return '';

  const quoteMedia = quotedPost.imageUrl
    ? (quotedPost.isVideo
      ? `<video src="${escapeAttribute(quotedPost.imageUrl)}" preload="metadata"></video>`
      : `<img src="${escapeAttribute(quotedPost.imageUrl)}" alt="Quoted post media">`)
    : '';

  return `
    <div class="quoted-post-card" onclick="event.stopPropagation(); navigateToPost('${quotedPost.id}')">
      <div class="quoted-post-header">
        <img src="${escapeAttribute(quotedPost.pfp || 'favicon.ico')}" alt="" class="quoted-post-avatar">
        <span>${escapeHtml(quotedPost.username)}</span>
        <time>${new Date(quotedPost.timestamp).toLocaleDateString()}</time>
      </div>
      <div class="quoted-post-text">${renderPostText(quotedPost.message || '')}</div>
      ${quoteMedia}
    </div>
  `;
}

function likePost(postId) {
  if (!currentSessionUsername) {
    alert("You must be logged in to like posts.");
    return;
  }
  
  // Find the post element and update UI optimistically
  const postElement = document.querySelector(`.post[data-post-id="${postId}"], .slash-card[data-post-id="${postId}"]`);
  let likeBtn, likeCount;
  
  if (postElement) {
    likeBtn = postElement.querySelector('.action-btn.liked, .action-group:first-child .action-btn');
    likeCount = postElement.querySelector('.action-group:first-child .action-count');
    
    // Optimistic UI update
    if (likeBtn) {
      const isCurrentlyLiked = likeBtn.classList.contains('liked');
      if (isCurrentlyLiked) {
        likeBtn.classList.remove('liked');
        if (likeCount) likeCount.textContent = Math.max(0, parseInt(likeCount.textContent) - 1);
      } else {
        likeBtn.classList.add('liked');
        if (likeCount) likeCount.textContent = (parseInt(likeCount.textContent) || 0) + 1;
      }
    }
  }
  
  csrfFetch(`/api/messages/like/${postId}`, { method: "POST" })
    .then(res => {
      if (!res.ok) throw new Error("Failed to like post");
      return res.json();
    })
    .then(data => {
      // Update with actual server data
      if (likeCount) likeCount.textContent = data.likes;
      if (likeBtn) {
        if (data.liked) {
          likeBtn.classList.add('liked');
        } else {
          likeBtn.classList.remove('liked');
        }
      }
      
      // Update the global allPosts array
      const post = allPosts.find(p => p.id == postId);
      if (post) {
        if (data.liked) {
          if (!post.likes.includes(currentSessionUsername)) {
            post.likes.push(currentSessionUsername);
          }
        } else {
          post.likes = post.likes.filter(u => u !== currentSessionUsername);
        }
      }
    })
    .catch(err => {
      console.error(err);
      // Revert optimistic update on error
      if (likeBtn && likeCount) {
        const isLiked = likeBtn.classList.contains('liked');
        if (isLiked) {
          likeBtn.classList.remove('liked');
          likeCount.textContent = Math.max(0, parseInt(likeCount.textContent) - 1);
        } else {
          likeBtn.classList.add('liked');
          likeCount.textContent = (parseInt(likeCount.textContent) || 0) + 1;
        }
      }
      alert(err.message);
    });
}

function savePost(postId) {
  if (!currentSessionUsername) {
    alert("You must be logged in to save posts.");
    return;
  }
  
  // Find the post element and update UI optimistically
  const postElement = document.querySelector(`.post[data-post-id="${postId}"], .slash-card[data-post-id="${postId}"]`);
  let saveBtn, saveCount;
  
  if (postElement) {
    saveBtn = postElement.querySelector('.action-btn.saved, .action-group:last-child .action-btn');
    saveCount = postElement.querySelector('.action-group:last-child .action-count');
    
    // Optimistic UI update
    if (saveBtn) {
      const isCurrentlySaved = saveBtn.classList.contains('saved');
      if (isCurrentlySaved) {
        saveBtn.classList.remove('saved');
        if (saveCount) saveCount.textContent = Math.max(0, parseInt(saveCount.textContent) - 1);
      } else {
        saveBtn.classList.add('saved');
        if (saveCount) saveCount.textContent = (parseInt(saveCount.textContent) || 0) + 1;
      }
    }
  }
  
  csrfFetch(`/api/messages/save/${postId}`, { method: "POST" })
    .then(res => {
      if (!res.ok) throw new Error("Failed to save post");
      return res.json();
    })
    .then(data => {
      // Update with actual server data
      if (saveCount) saveCount.textContent = data.saves;
      if (saveBtn) {
        if (data.saved) {
          saveBtn.classList.add('saved');
        } else {
          saveBtn.classList.remove('saved');
        }
      }
      
      // Update the global allPosts array
      const post = allPosts.find(p => p.id == postId);
      if (post) {
        if (data.saved) {
          if (!post.saves.includes(currentSessionUsername)) {
            post.saves.push(currentSessionUsername);
          }
        } else {
          post.saves = post.saves.filter(u => u !== currentSessionUsername);
        }
      }
    })
    .catch(err => {
      console.error(err);
      // Revert optimistic update on error
      if (saveBtn && saveCount) {
        const isSaved = saveBtn.classList.contains('saved');
        if (isSaved) {
          saveBtn.classList.remove('saved');
          saveCount.textContent = Math.max(0, parseInt(saveCount.textContent) - 1);
        } else {
          saveBtn.classList.add('saved');
          saveCount.textContent = (parseInt(saveCount.textContent) || 0) + 1;
        }
      }
      alert(err.message);
    });
}

function reSlashPost(postId) {
  if (!currentSessionUsername) {
    alert("You must be logged in to Re-Slash posts.");
    return;
  }
  
  // Find the original post element
  const originalPostElement = document.querySelector(`.post[data-post-id="${postId}"], .slash-card[data-post-id="${postId}"]`);
  let originalRetweetBtn, originalRetweetCount;
  
  if (originalPostElement) {
    originalRetweetBtn = originalPostElement.querySelector('.action-group:nth-child(3) .action-btn');
    originalRetweetCount = originalPostElement.querySelector('.action-group:nth-child(3) .action-count');
  }
  
  // Get the original post data
  const originalPost = allPosts.find(p => p.id == postId);
  if (!originalPost) {
    alert("Post not found");
    return;
  }
  
  // Check if already retweeted
  const isCurrentlyRetweeted = originalPost.retweets && originalPost.retweets.includes(currentSessionUsername);
  
  if (isCurrentlyRetweeted) {
    // UNDO RETWEET - Remove optimistic retweet post if exists
    const optimisticRetweet = document.querySelector(`.post[data-optimistic-retweet="${postId}"]`);
    if (optimisticRetweet) optimisticRetweet.remove();
    
    // Update button UI optimistically
    if (originalRetweetBtn) originalRetweetBtn.classList.remove('re-slashed');
    if (originalRetweetCount) {
      const currentCount = parseInt(originalRetweetCount.textContent) || 0;
      originalRetweetCount.textContent = Math.max(0, currentCount - 1);
    }
    
    // Send undo request to server
    csrfFetch(`/api/messages/retweet/${postId}`, { method: "POST" })
      .then(res => {
        if (!res.ok) throw new Error("Failed to undo Re-Slash");
        return res.json();
      })
      .then(data => {
        // Update with actual server data
        if (originalRetweetCount) originalRetweetCount.textContent = data.retweets;
        if (originalRetweetBtn) {
          if (data.retweeted) {
            originalRetweetBtn.classList.add('re-slashed');
          } else {
            originalRetweetBtn.classList.remove('re-slashed');
          }
        }
        
        // Show toast notification
        showToast("Re-Slash removed");
      })
      .catch(err => {
        console.error(err);
        // Revert optimistic update on error
        if (originalRetweetBtn) originalRetweetBtn.classList.add('re-slashed');
        if (originalRetweetCount) {
          const currentCount = parseInt(originalRetweetCount.textContent) || 0;
          originalRetweetCount.textContent = currentCount + 1;
        }
        alert("Failed to undo Re-Slash");
      });
  } else {
    // ADD RETWEET - Create optimistic retweet post at the top
    const tempRetweetId = "temp_retweet_" + Date.now();
    const optimisticRetweetPost = {
      id: tempRetweetId,
      username: currentSessionUsername,
      message: originalPost.message || "",
      timestamp: Date.now(),
      imageUrl: originalPost.imageUrl,
      isVideo: originalPost.isVideo || false,
      pfp: document.getElementById("accountPfp")?.src || "favicon.ico",
      parentId: null,
      retweetOf: postId,
      isRetweet: true,
      isOptimistic: true,
      likes: [],
      saves: [],
      retweets: [],
      isPremium: false,
      views: 0,
      replyCount: 0,
      originalUsername: originalPost.username,
      originalPfp: originalPost.pfp
    };
    
    // Create and add to top of feed
    const retweetElement = createPostElement(optimisticRetweetPost, true);
    retweetElement.setAttribute('data-optimistic-retweet', postId);
    retweetElement.classList.add('optimistic-post');
    
    const feed = document.getElementById("feed");
    if (feed.firstChild) {
      feed.insertBefore(retweetElement, feed.firstChild);
    } else {
      feed.appendChild(retweetElement);
    }
    
    // Update button UI optimistically
    if (originalRetweetBtn) originalRetweetBtn.classList.add('re-slashed');
    if (originalRetweetCount) {
      const currentCount = parseInt(originalRetweetCount.textContent) || 0;
      originalRetweetCount.textContent = currentCount + 1;
    }
    
    // Send request to server
    csrfFetch(`/api/messages/retweet/${postId}`, { method: "POST" })
      .then(res => {
        if (!res.ok) throw new Error("Failed to Re-Slash post");
        return res.json();
      })
      .then(data => {
        // Update button with actual data
        if (originalRetweetCount) originalRetweetCount.textContent = data.retweets;
        
        // Replace optimistic retweet with real one
        const tempElement = document.querySelector(`.post[data-post-id="${tempRetweetId}"]`);
        if (tempElement && data.retweeted) {
          const realRetweetPost = {
            ...optimisticRetweetPost,
            id: data.retweetPostId || Date.now(),
            isOptimistic: false
          };
          const realElement = createPostElement(realRetweetPost, true);
          tempElement.replaceWith(realElement);
        }
        
        showToast("Post Re-Slashed!");
      })
      .catch(err => {
        console.error(err);
        // Remove optimistic retweet and revert button on error
        const tempElement = document.querySelector(`.post[data-post-id="${tempRetweetId}"]`);
        if (tempElement) tempElement.remove();
        if (originalRetweetBtn) originalRetweetBtn.classList.remove('re-slashed');
        if (originalRetweetCount) {
          const currentCount = parseInt(originalRetweetCount.textContent) || 0;
          originalRetweetCount.textContent = Math.max(0, currentCount - 1);
        }
        alert("Failed to Re-Slash post");
      });
  }
}

// Helper function for toast notifications
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--theme-accent);
    color: white;
    padding: 10px 20px;
    border-radius: 25px;
    z-index: 9999;
    font-size: 14px;
    animation: fadeInOut 2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// Add CSS animation for toast
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInOut {
    0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
    15% { opacity: 1; transform: translateX(-50%) translateY(0); }
    85% { opacity: 1; transform: translateX(-50%) translateY(0); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
  }
  .optimistic-post {
    animation: highlightNew 0.5s ease;
  }
  @keyframes highlightNew {
    0% { background: rgba(29, 155, 240, 0.3); }
    100% { background: var(--theme-bg-secondary); }
  }
`;
document.head.appendChild(style);

function addPostToFeed(post, toTop = true) {
  const feed = document.getElementById("feed");
  const postElement = createPostElement(post, true);

  if (toTop) feed.insertBefore(postElement, feed.firstChild);
  else feed.appendChild(postElement);
}

let cachedCsrfToken = null;
let csrfFetchPromise = null;

async function csrfFetch(url, options = {}) {
  // If we already have a cached token and there's no concurrent request, use it
  if (cachedCsrfToken && !csrfFetchPromise) {
    options.headers = options.headers || {};
    options.headers["X-CSRF-Token"] = cachedCsrfToken;
    options.credentials = "include";
    return fetch(url, options);
  }
  
  // If there's already a request for CSRF token, wait for it
  if (csrfFetchPromise) {
    const token = await csrfFetchPromise;
    options.headers = options.headers || {};
    options.headers["X-CSRF-Token"] = token;
    options.credentials = "include";
    return fetch(url, options);
  }
  
  // Fetch new token with caching
  csrfFetchPromise = fetch("/csrf-token", { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      cachedCsrfToken = data.csrfToken;
      return data.csrfToken;
    })
    .finally(() => {
      csrfFetchPromise = null;
    });
  
  const token = await csrfFetchPromise;
  options.headers = options.headers || {};
  options.headers["X-CSRF-Token"] = token;
  options.credentials = "include";
  return fetch(url, options);
}

// Replace your window.onclick with this:
window.onclick = function(event) {
  if (!event.target.matches('.post-menu-btn') && !event.target.closest('.dropdown-menu')) {
    const dropdowns = document.getElementsByClassName("dropdown-menu");
    for (let i = 0; i < dropdowns.length; i++) {
      dropdowns[i].classList.remove('show');
    }
  }
}
// NEW: Helper Functions for Profile Card and About Me

function updateAboutMe() {
  const aboutMe = document.getElementById("aboutMeInput").value;
  csrfFetch("/api/update-about", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aboutMe })
  })
  .then(res => res.json())
  .then(data => alert(data.message || "Updated"))
  .catch(err => alert("Failed to update"));
}

function toggleFollow(username) {
  if (!currentSessionUsername) {
    alert("You must be logged in to follow users.");
    return;
  }

  const isFollowing = currentUserFollowing && currentUserFollowing.includes(username);
  const endpoint = isFollowing ? "unfollow" : "follow";

  csrfFetch(`/api/${endpoint}/${encodeURIComponent(username)}`, { method: "POST" })
    .then(res => {
      if (!res.ok) throw new Error(`Failed to ${endpoint}`);
      return res.json();
    })
    .then(data => {
      // Update the user's following list
      if (isFollowing) {
        currentUserFollowing = currentUserFollowing.filter(u => u !== username);
      } else {
        currentUserFollowing.push(username);
      }
      
      // Update ALL follow buttons on the page (posts + profile)
      updateAllFollowButtons(username);
    })
    .catch(err => {
      console.error(err);
      alert(`Failed to ${endpoint} user`);
    });
}

function updateAllFollowButtons(username) {
  // Update post follow buttons
  document.querySelectorAll(`.post-follow-btn[id="followBtn-${username}"]`).forEach(btn => {
    if (currentUserFollowing && currentUserFollowing.includes(username)) {
      btn.textContent = "Following";
      btn.classList.add("following");
    } else {
      btn.textContent = "Follow";
      btn.classList.remove("following");
    }
  });
  
  // Update profile modal follow button
  const profileFollowBtn = document.getElementById("profileFollowBtn");
  if (profileFollowBtn && profileFollowBtn.dataset.username === username) {
    if (currentUserFollowing && currentUserFollowing.includes(username)) {
      profileFollowBtn.textContent = "Following";
      profileFollowBtn.classList.add("following");
    } else {
      profileFollowBtn.textContent = "Follow";
      profileFollowBtn.classList.remove("following");
    }
  }
}

function removePostLocally(postId) {
  const postElement = document.querySelector(`.post[data-post-id="${postId}"], .slash-card[data-post-id="${postId}"]`);
  if (postElement) postElement.remove();
  allPosts = allPosts.filter(post => String(post.id) !== String(postId));
}

function removeAuthorPostsLocally(username) {
  document.querySelectorAll(".post, .slash-card").forEach(postElement => {
    const author = postElement.querySelector(".slash-author-link")?.dataset?.username;
    if (author === username) postElement.remove();
  });
  allPosts = allPosts.filter(post => post.username !== username && post.originalUsername !== username);
}

function hidePostFromFeed(postId) {
  if (!currentSessionUsername) {
    alert("You must be logged in to hide posts.");
    return;
  }

  csrfFetch(`/api/safety/hide-post/${encodeURIComponent(postId)}`, { method: "POST" })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to hide post");
      }
      removePostLocally(postId);
    })
    .catch(err => alert(err.message || "Failed to hide post"));
}

function reportPost(postId) {
  if (!currentSessionUsername) {
    alert("You must be logged in to report posts.");
    return;
  }

  const reason = prompt("Why are you reporting this post? Use spam, harassment, hate, violence, misinformation, or other.", "spam");
  if (reason === null) return;
  const details = prompt("Optional: add a short note for moderation.", "") || "";

  csrfFetch(`/api/safety/report-post/${encodeURIComponent(postId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, details })
  })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to report post");
      }
      return res.json();
    })
    .then(() => {
      alert("Report sent. Thanks for helping keep the feed clean.");
    })
    .catch(err => alert(err.message || "Failed to report post"));
}

function muteUserFromPost(username) {
  if (!currentSessionUsername) {
    alert("You must be logged in to mute users.");
    return;
  }
  if (!confirm(`Mute ${username}? Their posts will disappear from your feed.`)) return;

  csrfFetch(`/api/safety/mute/${encodeURIComponent(username)}`, { method: "POST" })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mute user");
      }
      removeAuthorPostsLocally(username);
    })
    .catch(err => alert(err.message || "Failed to mute user"));
}

function blockUserFromPost(username) {
  if (!currentSessionUsername) {
    alert("You must be logged in to block users.");
    return;
  }
  if (!confirm(`Block ${username}? You will unfollow each other and their posts will be hidden.`)) return;

  csrfFetch(`/api/safety/block/${encodeURIComponent(username)}`, { method: "POST" })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to block user");
      }
      currentUserFollowing = currentUserFollowing.filter(user => user !== username);
      updateAllFollowButtons(username);
      removeAuthorPostsLocally(username);
    })
    .catch(err => alert(err.message || "Failed to block user"));
}

function openProfilePageModal(username) {
  const followBtn = document.getElementById("profileFollowBtn");
  const pfdmBtn = document.getElementById("pfDmBtn");
  
  // Hide Follow button if it's your own profile
  if (username === currentSessionUsername) {
    followBtn.style.display = "none";
    pfdmBtn.style.display = "none";
  } else {
    followBtn.style.display = "block";
    pfdmBtn.style.display = "block";
  }
  
  followBtn.dataset.username = username;

  pfdmBtn.onclick = () => window.location.href = `./directs.html?user=${encodeURIComponent(username)}`;
  
  // Sync follow status from server
  fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
    .then(res => res.json())
    .then(userData => {
      currentUserFollowing = userData.following || [];
      updateProfileFollowButton(username);
    })
    .catch(err => console.error("Error syncing follow status:", err));
  
  fetch(`/api/user-info/${encodeURIComponent(username)}`)
    .then(res => res.json())
    .then(data => {
      // ✅ ADD THIS: Set banner image
      const bannerImg = document.getElementById("profilePageBanner");
      if (data.banner && data.banner !== "null") {
        bannerImg.src = data.banner;
        bannerImg.style.display = "block";
      } else {
        // Show default or hide
        bannerImg.src = "./title.png";
      }
      
      // Set PFP
      document.getElementById("profilePagePfp").src = data.pfp || "favicon.ico";
      
      // Set username
      document.getElementById("profilePageUsername").textContent = data.username;
      document.getElementById("profilePageUserId").textContent = data.username;
      
      // Set bio/about
      document.getElementById("profilePageAbout").textContent = data.about || "No bio available.";
      
      // Set stats
      document.getElementById("profilePageFollowers").textContent = data.followers ? data.followers.length + " Followers" : "0 Followers";
      document.getElementById("profilePageFollowing").textContent = data.following ? data.following.length + " Following" : "0 Following";
      
      // Show modal
      document.getElementById("profilePageModal").style.display = "flex";
      
      // Load posts
      loadProfilePosts(username);
    })
    .catch(err => console.error("Failed to load profile:", err));
}

function updateProfileFollowButton(username) {
  const followBtn = document.getElementById("profileFollowBtn");
  if (!followBtn) return;
  
  if (currentUserFollowing && currentUserFollowing.includes(username)) {
    followBtn.textContent = "Following";
    followBtn.classList.add("following");
  } else {
    followBtn.textContent = "Follow";
    followBtn.classList.remove("following");
  }
}

function loadProfilePosts(username) {
  const feed = document.getElementById("profilePostsFeed");
  feed.innerHTML = '<div class="post-skeleton"></div>';
  
  fetch(`/api/messages/user/${encodeURIComponent(username)}`, { credentials: "include" })
    .then(res => res.json())
    .then(posts => {
      feed.innerHTML = "";
      if (posts.length === 0) {
        feed.innerHTML = '<p style="text-align:center; color: var(--theme-text-secondary);">No posts yet.</p>';
        return;
      }
      posts.forEach(post => {
        const postElement = createPostElement(post, false);
        feed.appendChild(postElement);
      });
    })
    .catch(err => {
      console.error("Failed to load profile posts:", err);
      feed.innerHTML = '<p style="text-align:center; color: var(--theme-text-secondary);">Failed to load posts.</p>';
    });
}

function toggleFollowFromProfile() {
  const btn = document.getElementById("profileFollowBtn");
  const username = btn.dataset.username;
  if (username) {
    toggleFollow(username);
  }
}

function closeProfilePageModal() {
  document.getElementById("profilePageModal").style.display = "none";
}

function showProfileCard(event, username) {
  clearTimeout(profileCardTimeout);
  
  // Position the card near the mouse
  const rect = event.target.getBoundingClientRect();
  profileCard.style.top = (window.scrollY + rect.bottom + 5) + "px";
  profileCard.style.left = rect.left + "px";
  profileCard.style.display = "block";
  
  // Reset Content
  document.getElementById("cardUsername").textContent = username;
  document.getElementById("cardPfp").src = "favicon.ico";
  document.getElementById("cardAbout").textContent = "Loading...";
  
  const dmBtn = document.getElementById("cardDmBtn");
  const viewProfileBtn = document.getElementById("cardViewProfileBtn");
  
  // Show View Profile button on your own profile
  if (username === currentSessionUsername) {
    dmBtn.style.display = "none";
    viewProfileBtn.style.display = "block";
    
    // Navigate to profile page when clicked
    viewProfileBtn.onclick = function() {
      window.location.href = `/pf.html?user=${encodeURIComponent(username)}`;
    };
  } else {
    dmBtn.style.display = "block";
    dmBtn.onclick = () => window.location.href = `./directs.html?user=${encodeURIComponent(username)}`;
    
    viewProfileBtn.style.display = "block";
    
    // Navigate to profile page when clicked
    viewProfileBtn.onclick = function() {
      window.location.href = `/pf.html?user=${encodeURIComponent(username)}`;
    };
  }
  
  // Fetch user info
  fetch(`/api/user-info/${encodeURIComponent(username)}`)
    .then(res => res.json())
    .then(data => {
      document.getElementById("cardPfp").src = data.pfp || "favicon.ico";
      document.getElementById("cardAbout").textContent = data.about || "No bio available.";
      document.getElementById("cardFollowers").textContent = data.followers ? data.followers.length + " Followers" : "0 Followers";
      document.getElementById("cardFollowing").textContent = data.following ? data.following.length + " Following" : "0 Following";
    })
    .catch(() => {
      document.getElementById("cardAbout").textContent = "Error loading info.";
    });
  
  // Keep card open if mouse moves over the card itself
  profileCard.onmouseenter = () => clearTimeout(profileCardTimeout);
  profileCard.onmouseleave = () => hideProfileCard();
}

function hideProfileCard() {
    profileCardTimeout = setTimeout(() => {
        profileCard.style.display = "none";
    }, 300); // Small delay
}

// Update the file name display when a file is selected
const imageInputFileNameElement = document.getElementById('imageInput');
if (imageInputFileNameElement) {
  imageInputFileNameElement.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && !validateComposerMedia(file).ok) return;
    const fileName = file ? file.name : 'No file chosen';
    const fileNameElement = document.getElementById('fileName');
    if (fileNameElement) fileNameElement.textContent = fileName;
  });
}
// PFP file input change handler
const pfpInputElement = document.getElementById('pfpInput');
if (pfpInputElement) {
  pfpInputElement.addEventListener('change', function(e) {
    const fileNameDisplay = document.getElementById('pfpFileName');
    console.log('File selected:', e.target.files[0]);
    console.log('File name display element:', fileNameDisplay);
    if (e.target.files && e.target.files[0] && fileNameDisplay) {
      fileNameDisplay.textContent = e.target.files[0].name;
      console.log('File name updated to:', e.target.files[0].name);
    } else if (fileNameDisplay) {
      fileNameDisplay.textContent = 'No file chosen';
    }
  });
}

// Add progress bar for PFP upload (added at the bottom to ensure DOM is fully loaded)
document.addEventListener("DOMContentLoaded", function() {
  // Wait for the account modal to be fully loaded
  const checkModal = setInterval(() => {
    const pfpUploadContainer = document.querySelector('#accountModal .modal-content');
    if (pfpUploadContainer) {
      clearInterval(checkModal);
      
      // Create and add the progress bar
      const pfpUploadProgress = document.createElement('div');
      pfpUploadProgress.className = 'progress-bar';
      pfpUploadProgress.id = 'pfpUploadProgress';
      pfpUploadProgress.style.display = 'none';
      pfpUploadProgress.innerHTML = '<div class="progress" id="pfpUploadProgressFill" style="width:0%"></div>';
      
      // Insert it right after the "Choose File" label
      const fileUploadLabel = document.querySelector('#accountModal .pfpUploadLooks');
      if (fileUploadLabel) {
        fileUploadLabel.parentNode.insertBefore(pfpUploadProgress, fileUploadLabel.nextSibling);
      }
      
      console.log("Progress bar added for PFP upload");
    }
  }, 100);
  setTimeout(() => {
    observePostVisibility();
  }, 2000);
});

// ==========================================
// NOTIFICATION SYSTEM
// ==========================================
let notifications = [];
let notificationPollingInterval;
let previousNotificationCount = 0;
let lastNotificationId = null;
let notificationFilter = "all";
let notificationPreferences = {
  notificationsEnabled: true,
  mutedTypes: [],
  mutedCategories: [],
  soundEnabled: true,
  showUnreadOnly: false
};
let notificationSocket = null;

function escapeNotificationHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function toggleNotifications() {
  const dropdown = document.getElementById("notificationDropdown");
  dropdown.classList.toggle("show");
  
  if (dropdown.classList.contains("show")) {
    loadNotifications();
  }
}

function getSelectedRingtoneUrl() {
    // Option 1: If you saved the ringtone choice in localStorage in settings
    const savedRingtone = localStorage.getItem('selectedRingtone');
    if (savedRingtone) return savedRingtone;

    // Option 2: Default to the first option in your settings dropdown if none saved
    // This matches the first <option> in your HTML: ./ringtone/sanguineremix.mp3
    return './ringtone/sanguineremix.mp3'; 
}

function playNotificationSound() {
    if (notificationPreferences.soundEnabled === false) return;
    const audioUrl = getSelectedRingtoneUrl();
    const audio = new Audio(audioUrl);
    
    // Play audio
    audio.play().catch(error => {
        console.warn("Audio playback failed (likely autoplay policy):", error);
    });
}

function startNotificationPolling() {
  if (notificationPollingInterval) clearInterval(notificationPollingInterval);
  
  loadNotificationPreferences();
  loadNotifications(); // Initial load
  previousNotificationCount = notifications.length; // Set initial count
  initNotificationRealtime();
  
  notificationPollingInterval = setInterval(loadNotifications, 10000); // Poll every 10 seconds
}

function stopNotificationPolling() {
  if (notificationPollingInterval) {
    clearInterval(notificationPollingInterval);
    notificationPollingInterval = null;
  }
}

function loadNotifications() {
  const params = new URLSearchParams({ limit: "50" });
  if (notificationFilter === "unread" || notificationPreferences.showUnreadOnly) params.set("unread", "true");
  if (notificationFilter !== "all" && notificationFilter !== "unread") params.set("type", notificationFilter);

  fetch(`/api/notifications?${params.toString()}`, { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      const newNotifications = Array.isArray(data) ? data : [];
      
      // Check for new notifications
      // We compare the length or check if the latest ID is different
      if (newNotifications.length > 0) {
          const latestId = newNotifications[0].id;
          
          // If we have notifications, and either:
          // 1. The list was empty before (previousNotificationCount == 0)
          // 2. Or the latest notification ID is different from the last one we saw
          if (previousNotificationCount === 0 || latestId !== lastNotificationId) {
              console.log("New notification detected!");
              playNotificationSound();
              lastNotificationId = latestId;
          }
      }
      
      notifications = newNotifications;
      previousNotificationCount = notifications.length;
      
      renderNotifications();
      updateNotificationBadge();
    })
    .catch(err => console.error("Failed to load notifications:", err));
}

function initNotificationRealtime() {
  if (notificationSocket || typeof io !== "function") return;

  notificationSocket = io({ withCredentials: true });
  notificationSocket.on("notification:new", notification => {
    if (!notification || notificationPreferences.notificationsEnabled === false) return;
    const exists = notifications.some(item => String(item.id) === String(notification.id));
    if (!exists) notifications.unshift(notification);
    previousNotificationCount = notifications.length;
    lastNotificationId = notification.id;
    playNotificationSound();
    renderNotifications();
    updateNotificationBadge();
  });
  notificationSocket.on("connect", () => {
    loadNotifications();
  });
}

function legacyRenderNotifications() {
  const list = document.getElementById("notificationList");
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = notifications.map(n => {
    const timeAgo = getTimeAgo(n.timestamp);
    const unreadClass = n.read ? '' : 'unread';
    let icon = '';
    switch(n.type) {
      case 'reply': icon = '💬'; break;
      case 'like': icon = '❤️'; break;
      case 'retweet': icon = '🔄'; break;
      case 'follow': icon = '👤'; break;
      case 'mention': icon = '@'; break;
    }
    
    // Use fromUserPfp if available, otherwise fallback to favicon
    const pfpSrc = n.fromUserPfp || "favicon.ico";
    
    return `
      <div class="notification-item ${unreadClass}" onclick="handleNotificationClick(${n.id}, '${n.type}', ${n.postId})">
        <img src="${pfpSrc}" alt="pfp" class="pfp" onerror="this.src='favicon.ico'">
        <div class="notification-content">
          <div class="notification-text">
            <strong>${n.fromUser}</strong> ${n.message}
          </div>
          <div class="notification-time">${timeAgo}</div>
        </div>
        <button class="notification-delete" onclick="event.stopPropagation(); deleteNotification(${n.id})">✕</button>
      </div>
    `;
  }).join('');
}

function renderNotifications() {
  const list = document.getElementById("notificationList");
  if (!list) return;
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">No notifications yet</div>';
    return;
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const categoryCounts = notifications.reduce((acc, n) => {
    const key = n.category || "social";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const summaryHtml = `
    <div class="notification-summary">
      <span>${unreadCount} unread</span>
      <span>${categoryCounts.conversation || 0} conversations</span>
      <span>${categoryCounts.engagement || 0} engagements</span>
      <button onclick="event.stopPropagation(); markNotificationCategoryRead('conversation')">Read conversations</button>
      <button onclick="event.stopPropagation(); markNotificationCategoryRead('engagement')">Read engagements</button>
    </div>
  `;

  const labels = {
    reply: "Reply",
    like: "Like",
    retweet: "Re-Slash",
    quote: "Quote",
    follow: "Follow",
    mention: "@"
  };

  const itemsHtml = notifications.map(n => {
    const timeAgo = getTimeAgo(n.timestamp);
    const unreadClass = n.read ? "" : "unread";
    const pfpSrc = n.fromUserPfp || "favicon.ico";
    const id = JSON.stringify(n.id);
    const type = JSON.stringify(n.type || "");
    const postId = n.postId == null ? "null" : JSON.stringify(n.postId);

    return `
      <div class="notification-item ${unreadClass}" onclick="handleNotificationClick(${id}, ${type}, ${postId})">
        <img src="${escapeNotificationHtml(pfpSrc)}" alt="pfp" class="pfp" onerror="this.src='favicon.ico'">
        <div class="notification-content">
          <div class="notification-type">${escapeNotificationHtml(labels[n.type] || "Update")}</div>
          <div class="notification-text">
            <strong>${escapeNotificationHtml(n.fromUser || "Cybers/ash")}</strong> ${escapeNotificationHtml(n.message || "")}
          </div>
          <div class="notification-time">${timeAgo}</div>
        </div>
        <div class="notification-actions">
          <button onclick="event.stopPropagation(); archiveNotification(${id})" aria-label="Archive notification">Archive</button>
          <button onclick="event.stopPropagation(); muteNotificationType(${type})" aria-label="Mute notification type">Mute</button>
          <button class="notification-delete" onclick="event.stopPropagation(); deleteNotification(${id})" aria-label="Delete notification">x</button>
        </div>
      </div>
    `;
  }).join("");

  list.innerHTML = summaryHtml + itemsHtml;
}

function updateNotificationBadge() {
  const unreadCount = notifications.filter(n => !n.read).length;
  const badge = document.getElementById("notificationBadge");
  
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function legacyHandleNotificationClick(notificationId, type, postId) {
  // Mark as read
  markNotificationRead(notificationId);
  
  // Handle different notification types
  if (type === 'follow') {
    // Open profile
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      openProfilePageModal(notification.fromUser);
    }
  } else if (postId) {
    // Open the post
    closeNotificationDropdown();
    openReplyModal(postId);
  }
}

function handleNotificationClick(notificationId, type, postId) {
  markNotificationRead(notificationId);
  const notification = notifications.find(n => String(n.id) === String(notificationId));

  if (notification?.actionUrl) {
    window.location.href = notification.actionUrl;
    return;
  }

  if (type === "follow" && notification?.fromUser) {
    window.location.href = `./pf.html?user=${encodeURIComponent(notification.fromUser)}`;
    return;
  }

  if (postId) {
    window.location.href = `./post.html?id=${encodeURIComponent(postId)}`;
  }
}

function markNotificationRead(notificationId) {
  fetch("/api/notifications/mark-read", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    credentials: "include",
    body: JSON.stringify({ notificationIds: [notificationId] })
  }).then(() => {
    loadNotifications();
  });
}

function markAllNotificationsRead() {
  fetch("/api/notifications/mark-all-read", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
    credentials: "include"
  }).then(() => {
    loadNotifications();
  });
}

function setNotificationFilter(filter) {
  notificationFilter = filter;
  document.querySelectorAll(".notification-filter[data-filter]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  loadNotifications();
}

function markNotificationCategoryRead(category) {
  fetch("/api/notifications/mark-category-read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    credentials: "include",
    body: JSON.stringify({ category })
  }).then(() => loadNotifications());
}

function archiveNotification(notificationId) {
  fetch("/api/notifications/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    credentials: "include",
    body: JSON.stringify({ notificationIds: [notificationId] })
  }).then(() => loadNotifications());
}

function archiveReadNotifications() {
  fetch("/api/notifications/archive-read", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
    credentials: "include"
  }).then(() => loadNotifications());
}

function loadNotificationPreferences() {
  fetch("/api/notifications/preferences", { credentials: "include" })
    .then(res => res.ok ? res.json() : null)
    .then(prefs => {
      if (prefs) notificationPreferences = { ...notificationPreferences, ...prefs };
    })
    .catch(() => {});
}

function saveNotificationPreferences(nextPrefs) {
  notificationPreferences = { ...notificationPreferences, ...nextPrefs };
  return fetch("/api/notifications/preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    credentials: "include",
    body: JSON.stringify(notificationPreferences)
  }).then(res => res.ok ? res.json() : notificationPreferences)
    .then(prefs => {
      notificationPreferences = { ...notificationPreferences, ...prefs };
      return notificationPreferences;
    });
}

function muteNotificationType(type) {
  if (!type) return;
  const mutedTypes = new Set(notificationPreferences.mutedTypes || []);
  mutedTypes.add(type);
  saveNotificationPreferences({ mutedTypes: Array.from(mutedTypes) })
    .then(() => loadNotifications())
    .catch(() => alert("Failed to mute this notification type"));
}

function deleteNotification(notificationId) {
  fetch(`/api/notifications/${notificationId}`, {
    method: "DELETE",
    headers: { "X-CSRF-Token": csrfToken },
    credentials: "include"
  }).then(() => {
    loadNotifications();
  });
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return new Date(timestamp).toLocaleDateString();
}

function closeNotificationDropdown() {
  document.getElementById("notificationDropdown").classList.remove("show");
}

// Update checkAuth to start/stop polling
// Update checkAuth to start/stop polling - KEEP the original functionality AND add polling
const originalCheckAuth = checkAuth;
checkAuth = function() {
  fetch("/session", { credentials: "include" })
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
      currentSessionUsername = user.username;
      const accountUsername = document.getElementById("accountUsername");
      const accountPfp = document.getElementById("accountPfp");
      const oldAccountPfp = document.getElementById("oldaccountPfp");
      const mobileAccountPfp = document.getElementById("mobileaccountPfp");
      const authModal = document.getElementById("authModal");
      const fabBtn = document.getElementById("fabBtn");
      const notificationBell = document.getElementById("notificationBell");
      if (accountUsername) accountUsername.textContent = user.username;
      if (accountPfp) accountPfp.src = user.pfp || "favicon.ico";
      if (oldAccountPfp) oldAccountPfp.src = user.pfp || "favicon.ico";
      if (mobileAccountPfp) mobileAccountPfp.src = user.pfp || "favicon.ico";
      if (authModal) authModal.style.display = "none";
      if (fabBtn) fabBtn.style.display = "block";
      if (notificationBell) notificationBell.style.display = "flex";
      fetchUserFollowing();
      startNotificationPolling(); // START POLLING
      loadUserTheme(); // ADD THIS LINE - Load the user's theme/background
    })
    .catch(() => {
      currentSessionUsername = "";
      const accountBtn = document.getElementById("accountBtn");
      const authModal = document.getElementById("authModal");
      const fabBtn = document.getElementById("fabBtn");
      const notificationBell = document.getElementById("notificationBell");
      if (accountBtn) accountBtn.style.display = "none";
      if (authModal) authModal.style.display = "flex";
      if (fabBtn) fabBtn.style.display = "none";
      if (notificationBell) notificationBell.style.display = "none";
      stopNotificationPolling(); // STOP POLLING
    });
};

// Close dropdown when clicking outside
document.addEventListener("click", function(event) {
  const dropdown = document.getElementById("notificationDropdown");
  const bell = document.getElementById("notificationBell");
  
  if (dropdown && bell && !dropdown.contains(event.target) && !bell.contains(event.target)) {
    closeNotificationDropdown();
  }
});

// Full Size Image Viewer Functions
function openImageViewer(imageSrc) {
  const modal = document.getElementById("imageViewerModal");
  const img = document.getElementById("fullSizeImage");
  if (!modal || !img) return;
  img.src = imageSrc;
  modal.style.display = "flex";
}

function closeImageViewer() {
  const modal = document.getElementById("imageViewerModal");
  if (modal) modal.style.display = "none";
}

// Close image viewer when clicking outside the image
const imageViewerModalElement = document.getElementById("imageViewerModal");
if (imageViewerModalElement) {
  imageViewerModalElement.addEventListener("click", function(event) {
    if (event.target === this) {
      closeImageViewer();
    }
  });
}

function checkTwoFactorStatus() {
  fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      console.log("User info data:", data); // ADD THIS LINE TO DEBUG
      
      const enabledBadge = document.getElementById("twoFactorEnabledBadge");
      const disabledBadge = document.getElementById("twoFactorDisabledBadge");
      
      // Check if the property exists and is true
      if (data.twoFactorEnabled === true) {
        enabledBadge.style.display = "inline-block";
        disabledBadge.style.display = "none";
      } else {
        enabledBadge.style.display = "none";
        disabledBadge.style.display = "inline-block";
      }
    })
    .catch(err => console.error("Failed to check 2FA status:", err));
}

function viewPfpFullSize() {
  const pfpSrc = document.getElementById("accountModalPfp").src;
  openImageViewer(pfpSrc);
}

function skipTwoFactorSetup() {
  if (!confirm("Are you sure you want to skip 2FA setup? If you forget your password, you won't be able to recover your account!")) {
    return;
  }
  
  csrfFetch("/signup-skip-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: pendingSignupData.username,
      tempSecret: pendingSignupData.tempSecret,
      signupToken: pendingSignupData.signupToken  // NEW: Send the token
    })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(() => {
    closeTwoFactorSetupModal();
    alert(`Signup successful! Your username is: ${pendingSignupData.username}\n\n⚠️ WARNING: You did not set up 2FA. If you forget your password, you CANNOT recover your account!`);
    pendingSignupData = null;
    window.location.reload();
  })
  .catch(() => alert("Signup failed. Please try again."));
}

// Check premium and show username change
function checkPremiumAndShowUsername() {
  fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      const usernameSection = document.getElementById("usernameChangeSection");
      if (data.isPremium === true) {
        usernameSection.style.display = "block";
      } else {
        usernameSection.style.display = "none";
      }
    })
    .catch(err => console.error("Failed to check premium:", err));
}

// Change username function
function changeUsername() {
  const newUsername = document.getElementById("newUsernameInput").value.trim();
  if (!newUsername) {
    alert("Please enter a username");
    return;
  }
  
  // Validate username format
  if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
    alert("Username can only contain letters, numbers, and underscores");
    return;
  }
  
  // Check for blocked prefixes
  const lowerUsername = newUsername.toLowerCase();
  if (lowerUsername.startsWith("admin") || lowerUsername.startsWith("user")) {
    alert("Username cannot start with 'admin' or 'user'");
    return;
  }
  
  if (newUsername.length < 3 || newUsername.length > 20) {
    alert("Username must be between 3 and 20 characters");
    return;
  }
  
  csrfFetch("/api/change-username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newUsername: newUsername })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(data => {
    alert("Username changed to: " + data.username);
    document.getElementById("newUsernameInput").value = "";
    window.location.reload();
  })
  .catch(() => alert("Username change failed. It may already be taken."));
}

// Update PFP display to loop GIFs
function updatePfpDisplay(imgElement, src) {
  imgElement.src = src;
  if (src.toLowerCase().endsWith('.gif')) {
    imgElement.style.animation = "none";
    imgElement.offsetHeight; // Trigger reflow
    imgElement.style.animation = "none"; 
  }
}

// Add at the start of postMessage() and postFromModal()
function checkPremiumForVideo(file) {
  if (!file) return true; // No file = allowed
  if (file.type.startsWith('video/')) {
    // Check if user is premium
    return fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.isPremium !== true) {
          alert("Video uploads are a Premium feature!");
          return false;
        }
        if (file.size > 15 * 1024 * 1024) {
          alert("Video must be under 15MB");
          return false;
        }
        return true;
      });
  }
  return Promise.resolve(true);
}

// ==========================================
// THEME LOADING FOR PREMIUM USERS
// ==========================================
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
  localStorage.setItem('userTheme', themeName);
}

function applyBackground(bgName, isCustom, customUrl) {
  document.body.style.background = '';
  document.body.style.backgroundImage = '';
  
  if (isCustom && customUrl) {
    document.body.style.backgroundImage = `url('${customUrl}')`;
    document.body.style.backgroundSize = 'cover';  // Keep this for custom images
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundAttachment = 'fixed';  // Add this
    document.body.classList.add('has-custom-bg');
  } else if (bgName && bgName !== 'none' && gradients[bgName]) {
    document.body.style.backgroundImage = gradients[bgName];
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundAttachment = 'fixed';  // Add this
    document.body.classList.remove('has-custom-bg');
  } else {
    document.body.classList.remove('has-custom-bg');
  }
  if (isCustom && customUrl) {
    localStorage.setItem('userBackground', `url('${customUrl}')`);
  } else if (bgName && gradients[bgName]) {
    localStorage.setItem('userBackground', gradients[bgName]);
  } else {
    localStorage.removeItem('userBackground');
  }
}

function loadUserTheme() {
  if (!currentSessionUsername) {
    console.log("[THEME] No session, skipping");
    return;
  }
  
  console.log("[THEME] Loading theme for:", currentSessionUsername);
  
  fetch(`/api/user-info/${encodeURIComponent(currentSessionUsername)}`, { credentials: "include" })
    .then(res => res.json())
    .then(userData => {
      console.log("[THEME] User data:", userData);
      console.log("[THEME] Is premium:", userData.isPremium);
      console.log("[THEME] Theme:", userData.theme);
      console.log("[THEME] Background:", userData.backgroundImage);
      
      if (userData.isPremium === true) {
        if (userData.theme) {
          applyTheme(userData.theme);
          console.log("[THEME] Applied theme:", userData.theme);
        }
        if (userData.backgroundImage) {
          if (userData.backgroundImage.startsWith('/backgrounds/') || 
              userData.backgroundImage.startsWith('storage/')) {
            let bgUrl = userData.backgroundImage;
            if (!bgUrl.startsWith('/')) bgUrl = '/' + bgUrl;
            applyBackground(null, true, bgUrl);
          } else if (userData.backgroundImage.startsWith('gradient')) {
            applyBackground(userData.backgroundImage, false, null);
          }
        }
      }
    })
    .catch(err => console.error("[THEME] Error:", err));
}

// Banner Preview Function
// Replace handleBannerPreview with this:
function handleBannerPreview(input) {
    const file = input.files[0];
    const preview = document.getElementById('bannerPreview');
    const previewContainer = document.getElementById('bannerPreviewContainer');
    const progressContainer = document.getElementById('bannerUploadProgress');
    const progressFill = document.getElementById('bannerUploadProgressFill');
    
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        input.value = '';
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        input.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        preview.src = e.target.result;
        previewContainer.style.display = 'block';
        progressContainer.style.display = 'block';
        
        // Actually upload the banner!
        uploadBanner(file);
    };
    reader.readAsDataURL(file);
}

// Replace uploadBanner with this:
function uploadBanner(file) {
    const formData = new FormData();
    formData.append('banner', file);
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload-banner', true);
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.withCredentials = true;
    
    const progressFill = document.getElementById('bannerUploadProgressFill');
    
    xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            progressFill.style.width = percentComplete + '%';
        }
    };
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            console.log('Banner uploaded successfully:', data);
            alert('Banner uploaded successfully!');
        } else {
            console.error('Upload failed:', xhr.statusText);
            alert('Banner upload failed. Please try again.');
        }
    };
    
    xhr.onerror = function() {
        console.error('Upload error');
        alert('Banner upload failed. Please try again.');
    };
    
    xhr.send(formData);
}

// Remove Banner Preview
function removeBannerPreview() {
    const preview = document.getElementById('bannerPreview');
    const previewContainer = document.getElementById('bannerPreviewContainer');
    const bannerInput = document.getElementById('bannerInput');
    const progressContainer = document.getElementById('bannerUploadProgress');
    const progressFill = document.getElementById('bannerUploadProgressFill');
    
    // Clear the preview
    preview.src = '';
    previewContainer.style.display = 'none';
    
    // Reset file input
    bannerInput.value = '';
    
    // Reset progress bar
    progressFill.style.width = '0%';
    progressContainer.style.display = 'none';
}

// Simulate upload progress
function simulateUpload(progressFill, callback) {
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 100) {
            clearInterval(interval);
            if (callback) callback();
        } else {
            width += 10;
            progressFill.style.width = width + '%';
        }
    }, 100);
}

// Handle form submission with banner
async function submitProfileWithBanner(formData) {
    try {
        const response = await uploadBanner(formData.get('banner'));
        console.log('Banner uploaded successfully:', response);
        return response;
    } catch (error) {
        console.error('Banner upload error:', error);
        throw error;
    }
}

function handleScroll() {
  const fabBtn = document.getElementById("fabBtn");
  const scrollTopBtn = document.getElementById("scrollTopBtn");
  const postArea = document.querySelector(".input-area");
  const postAreaBottom = postArea.offsetTop + postArea.offsetHeight;
  
  if (window.pageYOffset > postAreaBottom) {
    fabBtn.style.display = "block";
  } else {
    fabBtn.style.display = "none";
  }

  // --- NEW CODE FOR SCROLL TO TOP ---
  if (window.pageYOffset > 100) { // Show after scrolling 400px down
    scrollTopBtn.style.display = "flex";
  } else {
    scrollTopBtn.style.display = "none";
  }
  // ----------------------------------
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

let totalUnreadCount = 0;

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

function renderFeedEmptyState(message, detail = "") {
  return `
    <li class="no-posts feed-empty-state">
      <div class="feed-empty-mark">/</div>
      <strong>${message}</strong>
      ${detail ? `<span>${detail}</span>` : ""}
      <button type="button" onclick="loadAlgorithmicFeed()">Refresh</button>
    </li>
  `;
}

// Make the badge clickable to switch tabs if on groups view
const dmBadgeElement = document.getElementById('dm-badge');
if (dmBadgeElement) {
  dmBadgeElement.addEventListener('click', function(e) {
    e.stopPropagation();
    // If currently on groups tab, switch to DMs tab
    const groupsSection = document.getElementById('groupsSection');
    if (groupsSection && groupsSection.style.display !== 'none') {
        switchDmTab('dms');
    }
    // Also trigger a click on the DM tab button to ensure visual state is correct
    const dmTabBtn = document.querySelector('.dm-tab.active') || document.querySelectorAll('.dm-tab')[0];
    // Ensure the active class is on the DM tab
    document.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
    const firstDmTab = document.querySelectorAll('.dm-tab')[0];
    const dmsSection = document.getElementById('dmsSection');
    const groupsSectionPanel = document.getElementById('groupsSection');
    if (firstDmTab) firstDmTab.classList.add('active');
    if (dmsSection) dmsSection.style.display = 'block';
    if (groupsSectionPanel) groupsSectionPanel.style.display = 'none';
  });
}

// Global tracking for feed state
let currentFeedTab = "discovery"; 

async function loadAlgorithmicFeed() {
  if (isLoadingPosts) return;
  isLoadingPosts = true;

  const feedContainer = document.getElementById("feed");
  if (!feedContainer) {
    isLoadingPosts = false;
    return;
  }

  try {
    // Force fresh fetch with timestamp and no-cache
    const response = await fetch("/api/feed/discovery?_=" + Date.now(), { 
      credentials: "include",
      cache: "no-store",
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
    
    const data = await response.json();
    
    // COMPLETELY CLEAR the feed - remove ALL children
    while (feedContainer.firstChild) {
      feedContainer.removeChild(feedContainer.firstChild);
    }
    
    // Clear all optimistic posts from storage
    if (window.optimisticPosts) {
      window.optimisticPosts = [];
    }
    
    const actualFeedArray = (data && data.feed) ? data.feed : [];

    if (actualFeedArray.length === 0) {
      feedContainer.innerHTML = renderFeedEmptyState("No updates yet", "Follow people, post something, or check back in a moment.");
      isLoadingPosts = false;
      return;
    }

    // COMPLETELY REPLACE allPosts - don't keep any old data
    allPosts.length = 0; // Clear array while keeping reference
    
    actualFeedArray.forEach(post => {
      const cleanPost = {
        ...post,
        views: post.views || 0,
        replyCount: post.replyCount || 0
      };
      allPosts.push(cleanPost);
      addPostToFeed(cleanPost, false);
    });

  } catch (error) {
    console.error("Discovery Engine Failure:", error);
    feedContainer.innerHTML = renderFeedEmptyState("Feed could not load", "Your connection or session may need a quick refresh.");
  } finally {
    isLoadingPosts = false;
  }
  setTimeout(() => {
    observePostVisibility();
  }, 100);
}

function executeShare(postId) {
  const url = `${window.location.origin}/post.html?id=${postId}`;
  navigator.clipboard.writeText(url).then(() => {
      alert("Link copied to clipboard! Share it with others.");
  }).catch(err => {
      alert("Share Link: " + url);
  });
}

function observePostVisibility() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const postElement = entry.target;
        const postId = postElement.getAttribute('data-post-id');
        if (postId && !postElement.hasAttribute('data-view-tracked')) {
          postElement.setAttribute('data-view-tracked', 'true');
          trackPostView(postId);
        }
      }
    });
  }, { threshold: 0.5 });
  
  document.querySelectorAll('.post, .slash-card').forEach(post => {
    observer.observe(post);
  });
}

function trackPostView(postId) {
  console.log('Tracking view for post:', postId); // Add this for debugging
  fetch(`/api/messages/view/${postId}`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    credentials: 'include'
  })
  .then(res => res.json())
  .then(data => {
    console.log('View tracking response:', data); // Add this for debugging
    // Update the view count in the UI if needed
    const postElement = document.querySelector(`.post[data-post-id="${postId}"], .slash-card[data-post-id="${postId}"]`);
    if (postElement && data.views) {
      const viewSpan = postElement.querySelector('.stat-item:first-child span');
      if (viewSpan) {
        viewSpan.textContent = data.views;
      }
    }
  })
  .catch(err => console.error('Failed to track view:', err));
}

// Add this new function to call the view tracking endpoint
function trackPostView(postId) {
  fetch(`/api/messages/view/${postId}`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    credentials: 'include'
  }).catch(err => console.error('Failed to track view:', err));
}

// Add this function to handle post click navigation
function navigateToPost(postId) {
  window.location.href = `/post.html?id=${postId}`;
}

// Update reply count for a post in the feed
function updateReplyCount(postId) {
  const postElement = document.querySelector(`.post[data-post-id="${postId}"], .slash-card[data-post-id="${postId}"]`);
  if (postElement) {
    const replyBtn = postElement.querySelector('.action-group .action-count');
    if (replyBtn) {
      const currentCount = parseInt(replyBtn.textContent) || 0;
      replyBtn.textContent = currentCount + 1;
    }
  }
  
  // Also update in allPosts array
  const post = allPosts.find(p => p.id == postId);
  if (post) {
    post.replyCount = (post.replyCount || 0) + 1;
  }
}
