  // --- Connection Status Logic ---
  const connectionStatus = document.getElementById('connectionStatus');
  const connectionText = document.getElementById('connectionText');
  const connectionSpinner = document.getElementById('connectionSpinner');
  
  let connectionTimeout; // Variable to store the timer

  function updateConnectionStatus() {
    if (navigator.onLine) {
      // If already online, don't reset the UI unnecessarily
      if (connectionStatus.classList.contains('online')) return;

      connectionStatus.className = 'connection-status online';
      connectionText.textContent = 'Online';
      connectionSpinner.style.display = 'none'; // Hide spinner
      
      // Show the widget briefly
      connectionStatus.style.opacity = '1';
      connectionStatus.style.pointerEvents = 'auto';

      // Clear any existing timer to prevent conflicts
      if (connectionTimeout) clearTimeout(connectionTimeout);

      // Start a new 5-second timer to hide it
      connectionTimeout = setTimeout(() => {
        hideConnectionStatus();
      }, 5000);

    } else {
      // If offline, always show the widget so the user knows
      connectionStatus.className = 'connection-status offline';
      connectionText.textContent = 'Connecting...';
      connectionSpinner.style.display = 'block';
      
      // Ensure it's visible
      connectionStatus.style.opacity = '1';
      connectionStatus.style.pointerEvents = 'auto';
      
      // Clear the hide timer if they go offline (so they see the error)
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }
  }

  function hideConnectionStatus() {
    connectionStatus.style.opacity = '0';
    connectionStatus.style.pointerEvents = 'none'; // Make it unclickable/invisible to clicks
  }

  // Initial check on load
  updateConnectionStatus();

  // Listen for network changes
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);