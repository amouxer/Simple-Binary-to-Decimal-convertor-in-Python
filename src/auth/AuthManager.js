const { BrowserWindow } = require('electron');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const log = require('electron-log');

const MS_CLIENT_ID = '00000000402b5328';
const MS_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MS_AUTH_URL = 'https://login.live.com/oauth20_authorize.srf';
const MS_TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const XBL_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTH_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MC_AUTH_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';
const MC_OWNERSHIP_URL = 'https://api.minecraftservices.com/entitlements/mcstore';

class AuthManager {
  constructor(config) {
    this.config = config;
    this.session = null;
    this.sessionFile = path.join(config.gameDir, 'session.json');
    this.loadSession();
  }

  loadSession() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = fs.readJsonSync(this.sessionFile);
        if (data && data.username) {
          this.session = data;
          log.info('Session loaded for:', data.username);
        }
      }
    } catch (error) {
      log.warn('Failed to load session:', error.message);
      this.session = null;
    }
  }

  saveSession() {
    try {
      fs.ensureDirSync(path.dirname(this.sessionFile));
      fs.writeJsonSync(this.sessionFile, this.session, { spaces: 2 });
    } catch (error) {
      log.error('Failed to save session:', error.message);
    }
  }

  getSession() {
    return this.session;
  }

  async loginMicrosoft() {
    log.info('Starting Microsoft OAuth login...');

    const authCode = await this.getMicrosoftAuthCode();
    log.info('Got Microsoft auth code');

    const msTokens = await this.getMicrosoftTokens(authCode);
    log.info('Got Microsoft tokens');

    const xblToken = await this.authenticateXBL(msTokens.access_token);
    log.info('Got XBL token');

    const xstsToken = await this.authenticateXSTS(xblToken.Token, xblToken.uhs);
    log.info('Got XSTS token');

    const mcToken = await this.authenticateMinecraft(xstsToken.Token, xstsToken.uhs);
    log.info('Got Minecraft token');

    await this.checkGameOwnership(mcToken);

    const profile = await this.getMinecraftProfile(mcToken);
    log.info('Got Minecraft profile:', profile.name);

    this.session = {
      type: 'microsoft',
      username: profile.name,
      uuid: profile.id,
      accessToken: mcToken,
      msRefreshToken: msTokens.refresh_token,
      skin: profile.skins && profile.skins.length > 0 ? profile.skins[0].url : null,
      loginTime: Date.now(),
    };

    this.saveSession();
    return this.session;
  }

  getMicrosoftAuthCode() {
    return new Promise((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 520,
        height: 700,
        title: 'Connexion Microsoft',
        backgroundColor: '#1a1a2e',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const scopes = 'XboxLive.signin offline_access';
      const authUrl = `${MS_AUTH_URL}?client_id=${MS_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}&prompt=select_account`;

      authWindow.loadURL(authUrl);

      authWindow.webContents.on('will-redirect', (_event, url) => {
        this.handleAuthRedirect(url, authWindow, resolve, reject);
      });

      authWindow.webContents.on('will-navigate', (_event, url) => {
        this.handleAuthRedirect(url, authWindow, resolve, reject);
      });

      authWindow.on('closed', () => {
        reject(new Error('Fenêtre de connexion fermée par l\'utilisateur'));
      });
    });
  }

  handleAuthRedirect(url, authWindow, resolve, reject) {
    try {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      if (error) {
        authWindow.destroy();
        reject(new Error(`Erreur Microsoft: ${urlObj.searchParams.get('error_description') || error}`));
        return;
      }

      if (code) {
        authWindow.destroy();
        resolve(code);
      }
    } catch (_e) {
      // URL parsing failed, ignore
    }
  }

  async getMicrosoftTokens(authCode) {
    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      code: authCode,
      grant_type: 'authorization_code',
      redirect_uri: MS_REDIRECT_URI,
    });

    const response = await axios.post(MS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
  }

  async refreshMicrosoftTokens(refreshToken) {
    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: MS_REDIRECT_URI,
    });

    const response = await axios.post(MS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
  }

  async authenticateXBL(msAccessToken) {
    const response = await axios.post(XBL_AUTH_URL, {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    return {
      Token: response.data.Token,
      uhs: response.data.DisplayClaims.xui[0].uhs,
    };
  }

  async authenticateXSTS(xblToken) {
    const response = await axios.post(XSTS_AUTH_URL, {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xblToken],
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    }, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    return {
      Token: response.data.Token,
      uhs: response.data.DisplayClaims.xui[0].uhs,
    };
  }

  async authenticateMinecraft(xstsToken, uhs) {
    const response = await axios.post(MC_AUTH_URL, {
      identityToken: `XBL3.0 x=${uhs};${xstsToken}`,
      ensureLegacyEnabled: true,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    return response.data.access_token;
  }

  async checkGameOwnership(mcToken) {
    try {
      const response = await axios.get(MC_OWNERSHIP_URL, {
        headers: { Authorization: `Bearer ${mcToken}` },
      });

      const items = response.data.items || [];
      const ownsGame = items.some(
        (item) => item.name === 'product_minecraft' || item.name === 'game_minecraft'
      );

      if (!ownsGame && items.length === 0) {
        log.warn('Could not verify game ownership, proceeding anyway');
      }
    } catch (error) {
      log.warn('Ownership check failed, proceeding:', error.message);
    }
  }

  async getMinecraftProfile(mcToken) {
    const response = await axios.get(MC_PROFILE_URL, {
      headers: { Authorization: `Bearer ${mcToken}` },
    });

    return response.data;
  }

  async loginOffline(username) {
    if (!username || username.trim().length < 3) {
      throw new Error('Le pseudo doit contenir au moins 3 caractères');
    }

    if (username.length > 16) {
      throw new Error('Le pseudo ne peut pas dépasser 16 caractères');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Le pseudo ne peut contenir que des lettres, chiffres et underscores');
    }

    const offlineUUID = this.generateOfflineUUID(username);

    this.session = {
      type: 'offline',
      username: username.trim(),
      uuid: offlineUUID,
      accessToken: 'offline',
      msRefreshToken: null,
      skin: null,
      loginTime: Date.now(),
    };

    this.saveSession();
    log.info('Offline login successful for:', username);
    return this.session;
  }

  generateOfflineUUID(username) {
    const md5 = require('crypto').createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
    return `${md5.substring(0, 8)}-${md5.substring(8, 12)}-3${md5.substring(13, 16)}-${md5.substring(16, 20)}-${md5.substring(20, 32)}`;
  }

  async refreshSession() {
    if (!this.session) {
      throw new Error('Aucune session active');
    }

    if (this.session.type === 'offline') {
      return this.session;
    }

    if (this.session.type === 'microsoft' && this.session.msRefreshToken) {
      try {
        const msTokens = await this.refreshMicrosoftTokens(this.session.msRefreshToken);
        const xblToken = await this.authenticateXBL(msTokens.access_token);
        const xstsToken = await this.authenticateXSTS(xblToken.Token, xblToken.uhs);
        const mcToken = await this.authenticateMinecraft(xstsToken.Token, xstsToken.uhs);
        const profile = await this.getMinecraftProfile(mcToken);

        this.session = {
          ...this.session,
          username: profile.name,
          uuid: profile.id,
          accessToken: mcToken,
          msRefreshToken: msTokens.refresh_token,
          skin: profile.skins && profile.skins.length > 0 ? profile.skins[0].url : null,
          loginTime: Date.now(),
        };

        this.saveSession();
        log.info('Session refreshed for:', profile.name);
        return this.session;
      } catch (error) {
        log.error('Session refresh failed:', error.message);
        this.session = null;
        this.deleteSessionFile();
        throw new Error('Session expirée, veuillez vous reconnecter');
      }
    }

    throw new Error('Type de session inconnu');
  }

  async logout() {
    this.session = null;
    this.deleteSessionFile();
    log.info('User logged out');
  }

  deleteSessionFile() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        fs.removeSync(this.sessionFile);
      }
    } catch (error) {
      log.warn('Failed to delete session file:', error.message);
    }
  }
}

module.exports = AuthManager;
