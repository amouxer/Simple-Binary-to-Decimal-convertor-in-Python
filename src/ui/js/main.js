/* Main Page Logic */

var currentPage = 'home';
var session = null;
var gameInstalled = false;
var isInstalling = false;
var isLaunching = false;

/* ===== Navigation ===== */

function navigateTo(page) {
  currentPage = page;

  document.querySelectorAll('.content-page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.sidebar-item').forEach(function(s) { s.classList.remove('active'); });

  var pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  var sidebarItem = document.querySelector('.sidebar-item[data-page="' + page + '"]');
  if (sidebarItem) sidebarItem.classList.add('active');
}

/* ===== Session ===== */

async function loadSession() {
  try {
    var result = await launcherAPI.auth.getSession();
    if (result.success && result.data) {
      session = result.data;
      updateUI();
    } else {
      launcherAPI.app.navigate('login');
    }
  } catch (_e) {
    launcherAPI.app.navigate('login');
  }
}

function updateUI() {
  if (!session) return;

  var username = session.username || 'Joueur';
  var initial = username.charAt(0).toUpperCase();

  // Update username displays
  var heroUsername = document.getElementById('hero-username');
  if (heroUsername) heroUsername.textContent = username;

  var bottomUsername = document.getElementById('bottom-username');
  if (bottomUsername) bottomUsername.textContent = username;

  var profileUsername = document.getElementById('profile-username');
  if (profileUsername) profileUsername.textContent = username;

  // Avatar
  var sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarAvatar) sidebarAvatar.textContent = initial;

  // Profile type badge
  var profileType = document.getElementById('profile-type');
  if (profileType) {
    profileType.textContent = session.type === 'microsoft' ? 'Premium' : 'Offline';
    profileType.className = 'badge ' + (session.type === 'microsoft' ? 'badge-success' : 'badge-warning');
  }

  // Skin display
  if (session.skin) {
    var skinEl = document.getElementById('profile-skin');
    if (skinEl) skinEl.innerHTML = '<img src="https://mc-heads.net/avatar/' + session.username + '/80" alt="skin" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">';

    var avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl) avatarEl.innerHTML = '<img src="https://mc-heads.net/avatar/' + session.username + '/40" alt="avatar" style="width:100%;height:100%;object-fit:cover;">';
  }
}

/* ===== Server Status ===== */

async function checkServerStatus() {
  try {
    var result = await launcherAPI.server.getStatus();
    var data = result.success ? result.data : { online: false, players: { online: 0, max: 0 } };

    var dot = document.getElementById('server-status-dot');
    var text = document.getElementById('server-status-text');
    var statPlayers = document.getElementById('stat-players');
    var statMax = document.getElementById('stat-max');

    if (data.online) {
      if (dot) { dot.classList.add('online'); dot.classList.remove('offline'); }
      if (text) text.textContent = 'Serveur en ligne';
      if (statPlayers) statPlayers.textContent = data.players.online;
      if (statMax) statMax.textContent = data.players.max;
    } else {
      if (dot) { dot.classList.add('offline'); dot.classList.remove('online'); }
      if (text) text.textContent = 'Serveur hors ligne';
      if (statPlayers) statPlayers.textContent = '0';
      if (statMax) statMax.textContent = '--';
    }
  } catch (_e) {
    var dotEl = document.getElementById('server-status-dot');
    var textEl = document.getElementById('server-status-text');
    if (dotEl) { dotEl.classList.add('offline'); dotEl.classList.remove('online'); }
    if (textEl) textEl.textContent = 'Serveur hors ligne';
  }
}

/* ===== News ===== */

async function loadNews() {
  try {
    var result = await launcherAPI.server.getNews();
    if (!result.success) return;

    var news = result.data;
    var categoryIcons = {
      announcement: '\uD83D\uDCE2',
      update: '\uD83D\uDD04',
      event: '\uD83C\uDFC6'
    };

    function createNewsCard(item) {
      return '<div class="news-card">' +
        '<div class="news-card-image">' + (categoryIcons[item.category] || '\uD83D\uDCF0') + '</div>' +
        '<div class="news-card-body">' +
        '<span class="news-card-category ' + item.category + '">' + item.category + '</span>' +
        '<h3 class="news-card-title">' + item.title + '</h3>' +
        '<p class="news-card-excerpt">' + item.content + '</p>' +
        '<div class="news-card-footer">' +
        '<span>' + item.author + '</span>' +
        '<span>' + item.date + '</span>' +
        '</div></div></div>';
    }

    var homeGrid = document.getElementById('home-news-grid');
    var newsGrid = document.getElementById('news-grid');

    if (homeGrid) {
      homeGrid.innerHTML = news.slice(0, 3).map(createNewsCard).join('');
    }
    if (newsGrid) {
      newsGrid.innerHTML = news.map(createNewsCard).join('');
    }
  } catch (_e) {
    // ignore news load failure
  }
}

/* ===== Shop ===== */

async function loadShop() {
  try {
    var result = await launcherAPI.server.getShopItems();
    if (!result.success) return;

    var shop = result.data;
    var categoriesEl = document.getElementById('shop-categories');
    var gridEl = document.getElementById('shop-grid');

    if (!categoriesEl || !gridEl) return;

    // Category tabs
    categoriesEl.innerHTML = shop.categories.map(function(cat, idx) {
      return '<button class="shop-category-tab' + (idx === 0 ? ' active' : '') + '" onclick="filterShop(\'' + cat.id + '\', this)">' + cat.name + '</button>';
    }).join('');

    // Display first category items
    if (shop.categories.length > 0) {
      renderShopItems(shop.categories[0].items);
    }

    // Store shop data for filtering
    window.shopData = shop;
  } catch (_e) {
    // ignore shop load failure
  }
}

function filterShop(categoryId, btn) {
  document.querySelectorAll('.shop-category-tab').forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  if (window.shopData) {
    var category = window.shopData.categories.find(function(c) { return c.id === categoryId; });
    if (category) {
      renderShopItems(category.items);
    }
  }
}

function renderShopItems(items) {
  var gridEl = document.getElementById('shop-grid');
  if (!gridEl) return;

  gridEl.innerHTML = items.map(function(item) {
    return '<div class="shop-card' + (item.popular ? ' popular' : '') + '">' +
      '<div class="shop-card-header">' +
      '<h3 class="shop-card-name" style="color: ' + item.color + ';">' + item.name + '</h3>' +
      '<div class="shop-card-price">' + item.price.toFixed(2) + '<span>\u20AC</span></div>' +
      '</div>' +
      '<p class="shop-card-description">' + item.description + '</p>' +
      '<ul class="shop-card-features">' +
      item.features.map(function(f) { return '<li>' + f + '</li>'; }).join('') +
      '</ul>' +
      '<button class="btn btn-primary btn-block" onclick="showNotification(\'Boutique disponible prochainement !\', \'info\')">Acheter</button>' +
      '</div>';
  }).join('');
}

/* ===== Grades ===== */

async function loadGrades() {
  try {
    var result = await launcherAPI.server.getGrades();
    if (!result.success) return;

    var grades = result.data;
    var listEl = document.getElementById('grades-list');
    if (!listEl) return;

    var gradeIcons = {
      joueur: '\uD83D\uDC64',
      vip: '\u2B50',
      vip_plus: '\uD83D\uDCA0',
      mvp: '\uD83D\uDC51'
    };

    listEl.innerHTML = grades.map(function(grade) {
      return '<div class="grade-card">' +
        '<div class="grade-icon" style="background: ' + grade.color + '20; color: ' + grade.color + ';">' +
        (gradeIcons[grade.id] || '\uD83C\uDFC5') +
        '</div>' +
        '<div class="grade-info">' +
        '<div class="grade-name" style="color: ' + grade.color + ';">' + grade.name + '</div>' +
        '<div class="grade-prefix" style="color: ' + grade.color + ';">' + grade.prefix + '</div>' +
        '<div class="grade-permissions">' +
        grade.permissions.map(function(p) { return '<span class="grade-perm-tag">' + p + '</span>'; }).join('') +
        '</div></div>' +
        '<div class="grade-price">' +
        '<div class="grade-price-value">' + (grade.isFree ? 'Gratuit' : grade.price.toFixed(2) + '\u20AC') + '</div>' +
        '<div class="grade-price-label">' + (grade.isFree ? 'Par defaut' : 'Achat unique') + '</div>' +
        '</div></div>';
    }).join('');
  } catch (_e) {
    // ignore grades load failure
  }
}

/* ===== Profile ===== */

async function loadProfile() {
  if (!session) return;

  try {
    var result = await launcherAPI.server.getPlayerProfile(session.username);
    if (!result.success) return;

    var profile = result.data;

    var levelEl = document.getElementById('pstat-level');
    var killsEl = document.getElementById('pstat-kills');
    var deathsEl = document.getElementById('pstat-deaths');
    var playtimeEl = document.getElementById('pstat-playtime');
    var moneyEl = document.getElementById('pstat-money');
    var gradeEl = document.getElementById('profile-grade');

    if (levelEl) levelEl.textContent = profile.level;
    if (killsEl) killsEl.textContent = profile.kills;
    if (deathsEl) deathsEl.textContent = profile.deaths;
    if (playtimeEl) playtimeEl.textContent = profile.playTime;
    if (moneyEl) moneyEl.textContent = profile.money;
    if (gradeEl) gradeEl.textContent = profile.grade;
  } catch (_e) {
    // ignore profile load failure
  }
}

/* ===== Settings ===== */

async function loadSettings() {
  try {
    var result = await launcherAPI.game.getSettings();
    if (!result.success) return;

    var settings = result.data;

    var ramEl = document.getElementById('setting-ram');
    var javaEl = document.getElementById('setting-java');
    var widthEl = document.getElementById('setting-width');
    var heightEl = document.getElementById('setting-height');
    var fullscreenEl = document.getElementById('toggle-fullscreen');
    var autoconnectEl = document.getElementById('toggle-autoconnect');

    if (ramEl) { ramEl.value = settings.ram; updateRamLabel(); }
    if (javaEl) javaEl.value = settings.javaPath || '';
    if (widthEl) widthEl.value = settings.width || 854;
    if (heightEl) heightEl.value = settings.height || 480;
    if (fullscreenEl && settings.fullscreen) fullscreenEl.classList.add('active');
    if (autoconnectEl) {
      if (settings.autoConnect) {
        autoconnectEl.classList.add('active');
      } else {
        autoconnectEl.classList.remove('active');
      }
    }
  } catch (_e) {
    // ignore settings load failure
  }
}

function updateRamLabel() {
  var ramEl = document.getElementById('setting-ram');
  var valueEl = document.getElementById('ram-value');
  if (ramEl && valueEl) {
    valueEl.textContent = ramEl.value + ' MB';
  }
}

function toggleSetting(setting) {
  var toggleEl = document.getElementById('toggle-' + setting.toLowerCase());
  if (toggleEl) {
    toggleEl.classList.toggle('active');
  }
}

async function saveSettings() {
  try {
    var ramEl = document.getElementById('setting-ram');
    var javaEl = document.getElementById('setting-java');
    var widthEl = document.getElementById('setting-width');
    var heightEl = document.getElementById('setting-height');
    var fullscreenEl = document.getElementById('toggle-fullscreen');
    var autoconnectEl = document.getElementById('toggle-autoconnect');

    var settings = {
      ram: parseInt(ramEl ? ramEl.value : '2048', 10),
      javaPath: javaEl ? javaEl.value : '',
      width: parseInt(widthEl ? widthEl.value : '854', 10),
      height: parseInt(heightEl ? heightEl.value : '480', 10),
      fullscreen: fullscreenEl ? fullscreenEl.classList.contains('active') : false,
      autoConnect: autoconnectEl ? autoconnectEl.classList.contains('active') : true,
    };

    var result = await launcherAPI.game.updateSettings(settings);
    if (result.success) {
      showNotification('Parametres sauvegardes !', 'success');
    } else {
      showNotification('Erreur lors de la sauvegarde', 'error');
    }
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }
}

/* ===== Game Installation & Launch ===== */

async function checkGameInstalled() {
  try {
    var result = await launcherAPI.game.isInstalled();
    gameInstalled = result.success && result.data;
    updatePlayButton();
  } catch (_e) {
    gameInstalled = false;
    updatePlayButton();
  }
}

function updatePlayButton() {
  var btn = document.getElementById('play-btn');
  if (!btn) return;

  if (isInstalling) {
    btn.textContent = '\u23F3 Installation...';
    btn.disabled = true;
    btn.className = 'btn btn-primary btn-lg play-btn';
  } else if (isLaunching) {
    btn.textContent = '\uD83D\uDE80 Lancement...';
    btn.disabled = true;
    btn.className = 'btn btn-primary btn-lg play-btn';
  } else if (gameInstalled) {
    btn.innerHTML = '&#x25B6; JOUER';
    btn.disabled = false;
    btn.className = 'btn btn-success btn-lg play-btn';
  } else {
    btn.innerHTML = '&#x1F4E5; INSTALLER';
    btn.disabled = false;
    btn.className = 'btn btn-primary btn-lg play-btn';
  }
}

async function handlePlay() {
  if (isInstalling || isLaunching) return;

  if (!gameInstalled) {
    await installGame();
  } else {
    await launchGame();
  }
}

async function installGame() {
  isInstalling = true;
  updatePlayButton();
  showInstallOverlay(true);

  launcherAPI.on('install:progress', function(progress) {
    updateInstallProgress(progress);
  });

  try {
    var result = await launcherAPI.game.install();

    if (result.success) {
      showNotification('Installation terminee avec succes !', 'success');
      gameInstalled = true;
    } else {
      showNotification('Erreur d\'installation: ' + (result.error || 'Erreur inconnue'), 'error');
    }
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }

  isInstalling = false;
  updatePlayButton();

  setTimeout(function() {
    showInstallOverlay(false);
  }, 2000);
}

async function launchGame() {
  isLaunching = true;
  updatePlayButton();

  launcherAPI.on('launch:progress', function(progress) {
    showNotification(progress.detail, 'info', 2000);
  });

  try {
    var result = await launcherAPI.game.launch();

    if (result.success) {
      showNotification('Minecraft est lance ! Bon jeu !', 'success');
    } else {
      var errorMsg = result.error || 'Erreur inconnue';
      console.error('Launch error (full):', errorMsg);
      var lines = errorMsg.split('\n').filter(function(l) { return l.trim(); });
      var shortMsg = lines.slice(0, 3).join(' | ');
      if (shortMsg.length > 200) shortMsg = shortMsg.substring(0, 200) + '...';
      showNotification('Erreur: ' + shortMsg, 'error', 15000);
    }
  } catch (error) {
    console.error('Launch exception:', error);
    showNotification('Erreur: ' + error.message, 'error', 10000);
  }

  isLaunching = false;
  updatePlayButton();
}

async function repairGame() {
  if (isInstalling) return;

  isInstalling = true;
  updatePlayButton();
  showInstallOverlay(true);

  var titleEl = document.getElementById('install-title');
  var subtitleEl = document.getElementById('install-subtitle');
  if (titleEl) titleEl.textContent = 'Reparation en cours';
  if (subtitleEl) subtitleEl.textContent = 'Le jeu est en cours de reparation...';

  launcherAPI.on('install:progress', function(progress) {
    updateInstallProgress(progress);
  });

  try {
    var result = await launcherAPI.game.repair();

    if (result.success) {
      showNotification('Reparation terminee !', 'success');
      gameInstalled = true;
    } else {
      showNotification('Erreur de reparation: ' + (result.error || 'Erreur'), 'error');
    }
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }

  isInstalling = false;
  updatePlayButton();

  setTimeout(function() {
    showInstallOverlay(false);
  }, 2000);
}

function showInstallOverlay(show) {
  var overlay = document.getElementById('install-overlay');
  if (overlay) {
    if (show) {
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
    }
  }
}

function updateInstallProgress(progress) {
  var stageEl = document.getElementById('install-stage');
  var percentEl = document.getElementById('install-percent');
  var barEl = document.getElementById('install-bar');
  var detailEl = document.getElementById('install-detail');

  if (stageEl) stageEl.textContent = progress.stage || '';
  if (percentEl) percentEl.textContent = Math.round(progress.progress || 0) + '%';
  if (barEl) barEl.style.width = (progress.progress || 0) + '%';
  if (detailEl) detailEl.textContent = progress.detail || '';
}

/* ===== Logout ===== */

async function handleLogout() {
  try {
    await launcherAPI.auth.logout();
    launcherAPI.app.navigate('login');
  } catch (_e) {
    launcherAPI.app.navigate('login');
  }
}

/* ===== Auto-Updater ===== */

async function checkForUpdates() {
  try {
    showNotification('Recherche de mises a jour...', 'info');
    var result = await launcherAPI.app.checkUpdate();

    if (result.success) {
      showNotification('Verification terminee', 'success');
    } else {
      showNotification('Aucune mise a jour disponible', 'info');
    }
  } catch (_e) {
    showNotification('Impossible de verifier les mises a jour', 'warning');
  }
}

function setupAutoUpdater() {
  launcherAPI.on('updater:available', function(info) {
    showNotification('Mise a jour ' + (info && info.version ? info.version : '') + ' disponible !', 'info', 6000);
  });

  launcherAPI.on('updater:progress', function(progress) {
    showNotification('Telechargement: ' + Math.round(progress.percent || 0) + '%', 'info', 2000);
  });

  launcherAPI.on('updater:downloaded', function() {
    showNotification('Mise a jour prete ! Redemarrez le launcher.', 'success', 10000);
  });

  launcherAPI.on('updater:error', function(msg) {
    if (msg) {
      showNotification('Erreur de mise a jour: ' + msg, 'warning');
    }
  });
}

/* ===== Version Display ===== */

async function initVersionDisplay() {
  try {
    var version = await launcherAPI.app.getVersion();
    var bottomVersionEl = document.getElementById('bottom-version');
    var settingsVersionEl = document.getElementById('settings-version');

    if (bottomVersionEl) bottomVersionEl.textContent = 'v' + version;
    if (settingsVersionEl) settingsVersionEl.textContent = version;
  } catch (_e) {
    // ignore
  }
}

/* ===== Initialization ===== */

async function init() {
  await loadSession();
  await Promise.all([
    checkServerStatus(),
    loadNews(),
    loadShop(),
    loadGrades(),
    loadProfile(),
    loadSettings(),
    checkGameInstalled(),
    initVersionDisplay(),
  ]);
  setupAutoUpdater();

  // Refresh server status periodically
  setInterval(checkServerStatus, 30000);
}

init();
