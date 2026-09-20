/**
 * Authentication Handler: Name-Only Player Entry + Admin Login
 */

document.addEventListener('DOMContentLoaded', () => {
  const playerLoginForm = document.getElementById('playerLoginForm');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const toggleAdminBtn = document.getElementById('toggleAdminBtn');
  const authErrorBox = document.getElementById('authErrorBox');

  function showError(msg) {
    authErrorBox.textContent = msg;
    authErrorBox.style.display = 'block';
  }

  function clearError() {
    authErrorBox.textContent = '';
    authErrorBox.style.display = 'none';
  }

  // Toggle Admin Form
  toggleAdminBtn.addEventListener('click', () => {
    clearError();
    const isHidden = adminLoginForm.style.display === 'none';
    adminLoginForm.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      document.getElementById('adminPassword').focus();
    }
  });

  // Name-Only Player Entry
  playerLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) {
      showError('Please enter your name');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = '/player';
      } else {
        showError(data.error || 'Unable to join table');
      }
    } catch (err) {
      showError('Network error connecting to server');
    }
  });

  // Admin Login
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = '/admin';
      } else {
        showError(data.error || 'Invalid administrator credentials');
      }
    } catch (err) {
      showError('Network error connecting to server');
    }
  });
});
