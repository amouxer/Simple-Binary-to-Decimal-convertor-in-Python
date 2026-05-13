/* Login Page Logic */

var currentTab = 'premium';

function switchTab(tab) {
  currentTab = tab;

  document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.login-panel').forEach(function(p) { p.classList.remove('active'); });

  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

function setLoading(loading, text) {
  var loadingEl = document.getElementById('login-loading');
  var panels = document.querySelectorAll('.login-panel');
  var tabs = document.querySelector('.login-tabs');
  var loadingText = document.getElementById('loading-text');

  if (loading) {
    panels.forEach(function(p) { p.style.display = 'none'; });
    tabs.style.display = 'none';
    loadingEl.classList.add('active');
    if (text) loadingText.textContent = text;
  } else {
    loadingEl.classList.remove('active');
    tabs.style.display = 'flex';
    panels.forEach(function(p) { p.style.display = ''; });
    switchTab(currentTab);
  }
}

async function loginMicrosoft() {
  try {
    setLoading(true, 'Ouverture de la fenetre Microsoft...');

    var result = await launcherAPI.auth.microsoft();

    if (result.success) {
      showNotification('Connexion reussie ! Bienvenue ' + result.data.username, 'success');
      setLoading(true, 'Chargement du launcher...');

      setTimeout(function() {
        launcherAPI.app.navigate('main');
      }, 1500);
    } else {
      setLoading(false);
      showNotification(result.error || 'Echec de la connexion Microsoft', 'error');
    }
  } catch (error) {
    setLoading(false);
    showNotification('Erreur: ' + error.message, 'error');
  }
}

async function loginOffline() {
  var username = document.getElementById('offline-username').value.trim();

  if (!username) {
    showNotification('Veuillez entrer un pseudo', 'warning');
    return;
  }

  if (username.length < 3) {
    showNotification('Le pseudo doit contenir au moins 3 caracteres', 'warning');
    return;
  }

  if (username.length > 16) {
    showNotification('Le pseudo ne peut pas depasser 16 caracteres', 'warning');
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showNotification('Le pseudo ne peut contenir que des lettres, chiffres et _', 'warning');
    return;
  }

  try {
    setLoading(true, 'Connexion en mode Offline...');

    var result = await launcherAPI.auth.offline(username);

    if (result.success) {
      showNotification('Bienvenue ' + result.data.username + ' !', 'success');
      setLoading(true, 'Chargement du launcher...');

      setTimeout(function() {
        launcherAPI.app.navigate('main');
      }, 1500);
    } else {
      setLoading(false);
      showNotification(result.error || 'Echec de la connexion', 'error');
    }
  } catch (error) {
    setLoading(false);
    showNotification('Erreur: ' + error.message, 'error');
  }
}

// Enter key support for offline login
document.getElementById('offline-username').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    loginOffline();
  }
});

// Check for existing session
async function checkExistingSession() {
  try {
    var result = await launcherAPI.auth.getSession();
    if (result.success && result.data) {
      setLoading(true, 'Session trouvee, reconnexion...');

      if (result.data.type === 'microsoft') {
        try {
          await launcherAPI.auth.refresh();
        } catch (_e) {
          setLoading(false);
          return;
        }
      }

      setTimeout(function() {
        launcherAPI.app.navigate('main');
      }, 1000);
    }
  } catch (_e) {
    // No existing session
  }
}

// Init version display
async function initVersion() {
  try {
    var version = await launcherAPI.app.getVersion();
    document.getElementById('app-version').textContent = 'v' + version;
  } catch (_e) {
    // ignore
  }
}

checkExistingSession();
initVersion();
