const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const log = require('electron-log');

const MC_VERSION_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
const MC_RESOURCES_URL = 'https://resources.download.minecraft.net';
const FORGE_MAVEN_URL = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const LIBRARIES_URL = 'https://libraries.minecraft.net';

const MODS = [
  {
    name: 'ironchest-1.7.10-6.0.62.742-universal.jar',
    urls: [
      'https://mediafilez.forgecdn.net/files/2230/908/ironchest-1.7.10-6.0.62.742-universal.jar',
      'https://edge.forgecdn.net/files/2230/908/ironchest-1.7.10-6.0.62.742-universal.jar',
    ],
    size: 158104,
  },
];

class MinecraftInstaller {
  constructor(config) {
    this.config = config;
    this.gameDir = config.gameDir;
    this.mcVersion = config.mcVersion;
    this.forgeVersion = config.forgeVersion;
    this.forgeFullVersion = `${this.mcVersion}-${this.forgeVersion}-${this.mcVersion}`;
    this.settings = this.loadSettings();
    this.installing = false;
  }

  loadSettings() {
    const settingsPath = path.join(this.gameDir, 'launcher-settings.json');
    const defaults = {
      ram: 2048,
      javaPath: '',
      gameDir: this.gameDir,
      fullscreen: false,
      width: 854,
      height: 480,
      autoConnect: true,
    };

    try {
      if (fs.existsSync(settingsPath)) {
        return { ...defaults, ...fs.readJsonSync(settingsPath) };
      }
    } catch (error) {
      log.warn('Failed to load settings:', error.message);
    }

    return defaults;
  }

  saveSettings() {
    const settingsPath = path.join(this.gameDir, 'launcher-settings.json');
    try {
      fs.ensureDirSync(this.gameDir);
      fs.writeJsonSync(settingsPath, this.settings, { spaces: 2 });
    } catch (error) {
      log.error('Failed to save settings:', error.message);
    }
  }

  getSettings() {
    return this.settings;
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  async isGameInstalled() {
    const versionDir = path.join(this.gameDir, 'versions', this.forgeFullVersion);
    const jarFile = path.join(versionDir, `${this.forgeFullVersion}.jar`);
    const jsonFile = path.join(versionDir, `${this.forgeFullVersion}.json`);
    const modsDir = path.join(this.gameDir, 'mods');

    const hasVersion = fs.existsSync(jarFile) && fs.existsSync(jsonFile);
    const hasMods = MODS.every((mod) =>
      fs.existsSync(path.join(modsDir, mod.name))
    );

    return hasVersion && hasMods;
  }

  async installGame(onProgress) {
    if (this.installing) {
      throw new Error('Installation déjà en cours');
    }

    this.installing = true;

    try {
      fs.ensureDirSync(this.gameDir);
      fs.ensureDirSync(path.join(this.gameDir, 'versions'));
      fs.ensureDirSync(path.join(this.gameDir, 'libraries'));
      fs.ensureDirSync(path.join(this.gameDir, 'assets'));
      fs.ensureDirSync(path.join(this.gameDir, 'mods'));
      fs.ensureDirSync(path.join(this.gameDir, 'resourcepacks'));
      fs.ensureDirSync(path.join(this.gameDir, 'shaderpacks'));

      onProgress({
        stage: 'Préparation',
        progress: 0,
        detail: 'Création des dossiers...',
      });

      // 1. Download vanilla Minecraft version JSON
      onProgress({
        stage: 'Minecraft',
        progress: 5,
        detail: 'Téléchargement du manifeste...',
      });
      const versionMeta = await this.downloadVersionManifest();

      // 2. Download vanilla JAR
      onProgress({
        stage: 'Minecraft',
        progress: 10,
        detail: 'Téléchargement du client Minecraft 1.7.10...',
      });
      await this.downloadVanillaClient(versionMeta, onProgress);

      // 3. Download and install Forge
      onProgress({
        stage: 'Forge',
        progress: 30,
        detail: 'Téléchargement de Forge...',
      });
      await this.downloadAndInstallForge(onProgress);

      // 4. Download libraries
      onProgress({
        stage: 'Bibliothèques',
        progress: 45,
        detail: 'Téléchargement des bibliothèques...',
      });
      await this.downloadLibraries(versionMeta, onProgress);

      // 5. Download assets
      onProgress({
        stage: 'Assets',
        progress: 60,
        detail: 'Téléchargement des assets...',
      });
      await this.downloadAssets(versionMeta, onProgress);

      // 6. Download mods
      onProgress({
        stage: 'Mods',
        progress: 85,
        detail: 'Installation des mods...',
      });
      await this.downloadMods(onProgress);

      // 7. Find or download Java
      onProgress({
        stage: 'Java',
        progress: 92,
        detail: 'Vérification de Java...',
      });
      await this.ensureJava();

      // 8. Finalize
      onProgress({
        stage: 'Finalisation',
        progress: 98,
        detail: 'Configuration finale...',
      });
      await this.createLauncherProfiles();

      // Verify installation
      const verified = await this.isGameInstalled();
      if (!verified) {
        const missing = await this.getMissingFiles();
        throw new Error(`Installation incomplète. Fichiers manquants: ${missing.join(', ')}`);
      }

      onProgress({
        stage: 'Terminé',
        progress: 100,
        detail: 'Installation terminée !',
      });

      log.info('Installation completed successfully');
    } finally {
      this.installing = false;
    }
  }

  async getMissingFiles() {
    const missing = [];
    const versionDir = path.join(this.gameDir, 'versions', this.forgeFullVersion);
    const jarFile = path.join(versionDir, `${this.forgeFullVersion}.jar`);
    const jsonFile = path.join(versionDir, `${this.forgeFullVersion}.json`);
    const modsDir = path.join(this.gameDir, 'mods');

    if (!fs.existsSync(jarFile)) missing.push('Forge JAR');
    if (!fs.existsSync(jsonFile)) missing.push('Forge JSON');

    for (const mod of MODS) {
      if (!fs.existsSync(path.join(modsDir, mod.name))) {
        missing.push(mod.name);
      }
    }

    return missing;
  }

  async downloadVersionManifest() {
    const manifestResponse = await axios.get(MC_VERSION_MANIFEST);
    const version = manifestResponse.data.versions.find(
      (v) => v.id === this.mcVersion
    );

    if (!version) {
      throw new Error(`Version ${this.mcVersion} non trouvée`);
    }

    const versionResponse = await axios.get(version.url);
    const versionMeta = versionResponse.data;

    const versionDir = path.join(this.gameDir, 'versions', this.mcVersion);
    fs.ensureDirSync(versionDir);
    fs.writeJsonSync(
      path.join(versionDir, `${this.mcVersion}.json`),
      versionMeta,
      { spaces: 2 }
    );

    return versionMeta;
  }

  async downloadVanillaClient(versionMeta, onProgress) {
    const clientDownload = versionMeta.downloads.client;
    const versionDir = path.join(this.gameDir, 'versions', this.mcVersion);
    const jarPath = path.join(versionDir, `${this.mcVersion}.jar`);

    if (fs.existsSync(jarPath)) {
      const stat = fs.statSync(jarPath);
      if (stat.size === clientDownload.size) {
        log.info('Vanilla client already downloaded');
        return;
      }
    }

    await this.downloadFileWithProgress(
      clientDownload.url,
      jarPath,
      (downloaded, total) => {
        const pct = 10 + (downloaded / total) * 20;
        onProgress({
          stage: 'Minecraft',
          progress: Math.round(pct),
          detail: `Téléchargement du client... ${this.formatBytes(downloaded)} / ${this.formatBytes(total)}`,
        });
      }
    );
  }

  async downloadAndInstallForge(onProgress) {
    const forgeDir = path.join(this.gameDir, 'versions', this.forgeFullVersion);
    fs.ensureDirSync(forgeDir);

    const forgeJsonPath = path.join(forgeDir, `${this.forgeFullVersion}.json`);
    const forgeJarPath = path.join(forgeDir, `${this.forgeFullVersion}.jar`);

    if (fs.existsSync(forgeJsonPath) && fs.existsSync(forgeJarPath)) {
      log.info('Forge already installed');
      return;
    }

    const forgeInstallerUrl = `${FORGE_MAVEN_URL}/${this.mcVersion}-${this.forgeVersion}-${this.mcVersion}/forge-${this.mcVersion}-${this.forgeVersion}-${this.mcVersion}-installer.jar`;
    const universalUrl = `${FORGE_MAVEN_URL}/${this.mcVersion}-${this.forgeVersion}-${this.mcVersion}/forge-${this.mcVersion}-${this.forgeVersion}-${this.mcVersion}-universal.jar`;

    const installerPath = path.join(this.gameDir, 'temp', 'forge-installer.jar');
    fs.ensureDirSync(path.join(this.gameDir, 'temp'));

    onProgress({
      stage: 'Forge',
      progress: 32,
      detail: 'Téléchargement de Forge installer...',
    });

    try {
      await this.downloadFileWithProgress(
        forgeInstallerUrl,
        installerPath,
        (downloaded, total) => {
          const pct = 32 + (downloaded / total) * 5;
          onProgress({
            stage: 'Forge',
            progress: Math.round(pct),
            detail: `Forge installer... ${this.formatBytes(downloaded)} / ${this.formatBytes(total)}`,
          });
        }
      );
    } catch (_error) {
      log.warn('Forge installer download failed, trying universal...');
      await this.downloadFileWithProgress(
        universalUrl,
        installerPath,
        (downloaded, total) => {
          const pct = 32 + (downloaded / total) * 5;
          onProgress({
            stage: 'Forge',
            progress: Math.round(pct),
            detail: `Forge universal... ${this.formatBytes(downloaded)} / ${this.formatBytes(total)}`,
          });
        }
      );
    }

    onProgress({
      stage: 'Forge',
      progress: 38,
      detail: 'Extraction de Forge...',
    });

    await this.extractForge(installerPath, forgeDir, forgeJsonPath, forgeJarPath);

    try {
      fs.removeSync(path.join(this.gameDir, 'temp'));
    } catch (_e) {
      // ignore temp cleanup
    }

    onProgress({
      stage: 'Forge',
      progress: 42,
      detail: 'Forge installé avec succès !',
    });
  }

  async extractForge(installerPath, forgeDir, forgeJsonPath, forgeJarPath) {
    try {
      const zip = new AdmZip(installerPath);
      const zipEntries = zip.getEntries();

      let versionJsonEntry = null;
      let forgeUniversalEntry = null;

      for (const entry of zipEntries) {
        if (entry.entryName === 'install_profile.json') {
          const installProfile = JSON.parse(entry.getData().toString('utf8'));

          if (installProfile.versionInfo) {
            fs.writeJsonSync(forgeJsonPath, installProfile.versionInfo, { spaces: 2 });
            log.info('Forge version JSON extracted from install_profile');
          }
        }

        if (entry.entryName === 'version.json') {
          versionJsonEntry = entry;
        }

        if (
          entry.entryName.includes('forge-') &&
          entry.entryName.endsWith('-universal.jar')
        ) {
          forgeUniversalEntry = entry;
        }
      }

      if (!fs.existsSync(forgeJsonPath) && versionJsonEntry) {
        fs.writeFileSync(forgeJsonPath, versionJsonEntry.getData());
        log.info('Forge version JSON extracted from version.json');
      }

      if (!fs.existsSync(forgeJsonPath)) {
        const forgeVersionJson = this.createForgeVersionJson();
        fs.writeJsonSync(forgeJsonPath, forgeVersionJson, { spaces: 2 });
        log.info('Forge version JSON generated');
      }

      if (forgeUniversalEntry) {
        fs.writeFileSync(forgeJarPath, forgeUniversalEntry.getData());
        log.info('Forge universal JAR extracted');
      } else {
        fs.copySync(installerPath, forgeJarPath);
        log.info('Using installer as Forge JAR');
      }

      await this.extractForgeLibraries(zip);
    } catch (error) {
      log.error('Forge extraction error:', error.message);

      if (!fs.existsSync(forgeJsonPath)) {
        const forgeVersionJson = this.createForgeVersionJson();
        fs.writeJsonSync(forgeJsonPath, forgeVersionJson, { spaces: 2 });
      }

      if (!fs.existsSync(forgeJarPath)) {
        fs.copySync(installerPath, forgeJarPath);
      }
    }
  }

  async extractForgeLibraries(zip) {
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      if (entry.entryName.startsWith('maven/') && !entry.isDirectory) {
        const libPath = path.join(
          this.gameDir,
          'libraries',
          entry.entryName.replace('maven/', '')
        );
        fs.ensureDirSync(path.dirname(libPath));
        fs.writeFileSync(libPath, entry.getData());
      }
    }
  }

  createForgeVersionJson() {
    return {
      id: this.forgeFullVersion,
      time: '2015-06-09T12:34:18+00:00',
      releaseTime: '2015-06-09T12:34:18+00:00',
      type: 'release',
      minecraftArguments: '--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${game_assets} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --userType ${user_type} --tweakClass cpw.mods.fml.common.launcher.FMLTweaker --versionType Forge',
      mainClass: 'net.minecraft.launchwrapper.Launch',
      inheritsFrom: '1.7.10',
      jar: '1.7.10',
      libraries: [
        {
          name: `net.minecraftforge:forge:${this.mcVersion}-${this.forgeVersion}-${this.mcVersion}`,
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'net.minecraft:launchwrapper:1.12',
          url: 'https://libraries.minecraft.net/',
        },
        {
          name: 'org.ow2.asm:asm-all:5.0.3',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'com.typesafe.akka:akka-actor_2.11:2.3.3',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'com.typesafe:config:1.2.1',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang:scala-actors-migration_2.11:1.1.0',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang:scala-compiler:2.11.1',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang.plugins:scala-continuations-library_2.11:1.0.2',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang.plugins:scala-continuations-plugin_2.11.1:1.0.2',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang:scala-library:2.11.1',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang:scala-parser-combinators_2.11:1.0.1',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang:scala-reflect:2.11.1',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang:scala-swing_2.11:1.0.1',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'org.scala-lang:scala-xml_2.11:1.0.2',
          url: 'https://maven.minecraftforge.net/',
        },
        {
          name: 'lzma:lzma:0.0.1',
          url: 'https://libraries.minecraft.net/',
        },
        {
          name: 'net.sf.jopt-simple:jopt-simple:4.5',
          url: 'https://libraries.minecraft.net/',
        },
        {
          name: 'com.google.guava:guava:17.0',
          url: 'https://libraries.minecraft.net/',
        },
        {
          name: 'org.apache.commons:commons-lang3:3.3.2',
          url: 'https://libraries.minecraft.net/',
        },
      ],
    };
  }

  async downloadLibraries(versionMeta, onProgress) {
    const libraries = versionMeta.libraries || [];
    const toDownload = [];

    for (const lib of libraries) {
      if (lib.rules) {
        const allowed = this.checkLibraryRules(lib.rules);
        if (!allowed) continue;
      }

      if (lib.downloads && lib.downloads.artifact) {
        const artifact = lib.downloads.artifact;
        const libPath = path.join(this.gameDir, 'libraries', artifact.path);

        if (!fs.existsSync(libPath)) {
          toDownload.push({
            url: artifact.url,
            path: libPath,
            name: lib.name,
          });
        }
      } else if (lib.name) {
        const libInfo = this.parseLibraryName(lib.name);
        const baseUrl = lib.url || `${LIBRARIES_URL}/`;

        if (!fs.existsSync(libInfo.path)) {
          toDownload.push({
            url: `${baseUrl}${libInfo.urlPath}`,
            path: path.join(this.gameDir, 'libraries', libInfo.urlPath),
            name: lib.name,
          });
        }
      }

      if (lib.natives) {
        const osKey = this.getOSKey();
        const nativeClassifier = lib.natives[osKey];
        if (
          nativeClassifier &&
          lib.downloads &&
          lib.downloads.classifiers &&
          lib.downloads.classifiers[nativeClassifier]
        ) {
          const native = lib.downloads.classifiers[nativeClassifier];
          const nativePath = path.join(this.gameDir, 'libraries', native.path);

          if (!fs.existsSync(nativePath)) {
            toDownload.push({
              url: native.url,
              path: nativePath,
              name: `${lib.name} (native)`,
              isNative: true,
            });
          }
        }
      }
    }

    const forgeVersionPath = path.join(
      this.gameDir,
      'versions',
      this.forgeFullVersion,
      `${this.forgeFullVersion}.json`
    );

    if (fs.existsSync(forgeVersionPath)) {
      try {
        const forgeJson = fs.readJsonSync(forgeVersionPath);
        const forgeLibs = forgeJson.libraries || [];

        for (const lib of forgeLibs) {
          const libInfo = this.parseLibraryName(lib.name);
          const baseUrl = lib.url || `${LIBRARIES_URL}/`;
          const libPath = path.join(this.gameDir, 'libraries', libInfo.urlPath);

          if (!fs.existsSync(libPath)) {
            toDownload.push({
              url: `${baseUrl}${libInfo.urlPath}`,
              path: libPath,
              name: lib.name,
            });
          }
        }
      } catch (error) {
        log.warn('Failed to parse Forge libraries:', error.message);
      }
    }

    const total = toDownload.length;
    let downloaded = 0;

    for (const lib of toDownload) {
      try {
        fs.ensureDirSync(path.dirname(lib.path));
        await this.downloadFile(lib.url, lib.path);
        downloaded++;

        const pct = 45 + (downloaded / total) * 15;
        onProgress({
          stage: 'Bibliothèques',
          progress: Math.round(pct),
          detail: `${downloaded}/${total} - ${lib.name}`,
        });
      } catch (error) {
        log.warn(`Failed to download library ${lib.name}:`, error.message);
        downloaded++;
      }
    }
  }

  async downloadAssets(versionMeta, onProgress) {
    const assetIndex = versionMeta.assetIndex;
    if (!assetIndex) {
      log.warn('No asset index found in version metadata');
      return;
    }

    const indexDir = path.join(this.gameDir, 'assets', 'indexes');
    fs.ensureDirSync(indexDir);

    const indexPath = path.join(indexDir, `${assetIndex.id}.json`);

    if (!fs.existsSync(indexPath)) {
      await this.downloadFile(assetIndex.url, indexPath);
    }

    const indexData = fs.readJsonSync(indexPath);
    const objects = indexData.objects || {};
    const objectEntries = Object.entries(objects);
    const total = objectEntries.length;
    let downloaded = 0;

    const objectsDir = path.join(this.gameDir, 'assets', 'objects');
    const virtualDir = path.join(this.gameDir, 'assets', 'virtual', 'legacy');

    for (const [assetName, assetInfo] of objectEntries) {
      const hash = assetInfo.hash;
      const hashPrefix = hash.substring(0, 2);
      const objectPath = path.join(objectsDir, hashPrefix, hash);
      const virtualPath = path.join(virtualDir, assetName);

      if (!fs.existsSync(objectPath)) {
        try {
          fs.ensureDirSync(path.dirname(objectPath));
          await this.downloadFile(
            `${MC_RESOURCES_URL}/${hashPrefix}/${hash}`,
            objectPath
          );

          fs.ensureDirSync(path.dirname(virtualPath));
          fs.copySync(objectPath, virtualPath);
        } catch (error) {
          log.warn(`Failed to download asset ${assetName}:`, error.message);
        }
      } else if (!fs.existsSync(virtualPath)) {
        fs.ensureDirSync(path.dirname(virtualPath));
        fs.copySync(objectPath, virtualPath);
      }

      downloaded++;
      if (downloaded % 50 === 0 || downloaded === total) {
        const pct = 60 + (downloaded / total) * 25;
        onProgress({
          stage: 'Assets',
          progress: Math.round(pct),
          detail: `${downloaded}/${total} fichiers`,
        });
      }
    }
  }

  async downloadMods(onProgress) {
    const modsDir = path.join(this.gameDir, 'mods');
    fs.ensureDirSync(modsDir);

    const total = MODS.length;
    let downloaded = 0;
    const failedMods = [];

    for (const mod of MODS) {
      const modPath = path.join(modsDir, mod.name);

      if (fs.existsSync(modPath)) {
        const stat = fs.statSync(modPath);
        if (mod.size && stat.size === mod.size) {
          downloaded++;
          continue;
        }
        fs.removeSync(modPath);
      }

      onProgress({
        stage: 'Mods',
        progress: 85 + (downloaded / total) * 7,
        detail: `Installation de ${mod.name}...`,
      });

      let modDownloaded = false;
      const urls = mod.urls || [mod.url, mod.fallbackUrl].filter(Boolean);

      for (const url of urls) {
        try {
          await this.downloadFile(url, modPath);
          if (fs.existsSync(modPath) && fs.statSync(modPath).size > 1000) {
            modDownloaded = true;
            log.info(`Downloaded mod ${mod.name} from ${url}`);
            break;
          } else {
            fs.removeSync(modPath);
          }
        } catch (error) {
          log.warn(`URL failed for ${mod.name}: ${url} - ${error.message}`);
          if (fs.existsSync(modPath)) fs.removeSync(modPath);
        }
      }

      if (!modDownloaded) {
        failedMods.push(mod.name);
        log.error(`All download URLs failed for mod ${mod.name}`);
      }

      downloaded++;
    }

    if (failedMods.length > 0) {
      throw new Error(`Impossible de télécharger les mods suivants: ${failedMods.join(', ')}`);
    }

    onProgress({
      stage: 'Mods',
      progress: 92,
      detail: `${downloaded} mods installés`,
    });
  }

  async ensureJava() {
    if (this.settings.javaPath && fs.existsSync(this.settings.javaPath)) {
      return this.settings.javaPath;
    }

    const javaPaths = this.getDefaultJavaPaths();

    for (const javaPath of javaPaths) {
      if (fs.existsSync(javaPath)) {
        this.settings.javaPath = javaPath;
        this.saveSettings();
        log.info('Found Java at:', javaPath);
        return javaPath;
      }
    }

    try {
      const javaCheck = await this.executeCommand('java', ['-version']);
      if (javaCheck) {
        this.settings.javaPath = 'java';
        this.saveSettings();
        log.info('Using system Java');
        return 'java';
      }
    } catch (_e) {
      // Java not found in PATH
    }

    log.warn('Java not found - Minecraft may not launch correctly');
    this.settings.javaPath = 'java';
    this.saveSettings();
    return 'java';
  }

  getDefaultJavaPaths() {
    const platform = process.platform;

    if (platform === 'win32') {
      return [
        'C:\\Program Files\\Java\\jre1.8.0_351\\bin\\java.exe',
        'C:\\Program Files\\Java\\jdk1.8.0_351\\bin\\java.exe',
        'C:\\Program Files (x86)\\Java\\jre1.8.0_351\\bin\\java.exe',
        'C:\\Program Files\\Eclipse Adoptium\\jdk-8.0.392.8-hotspot\\bin\\java.exe',
        'C:\\Program Files\\Zulu\\zulu-8\\bin\\java.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium', 'jdk-8.0.392.8-hotspot', 'bin', 'java.exe'),
      ];
    } else if (platform === 'darwin') {
      return [
        '/Library/Java/JavaVirtualMachines/temurin-8.jdk/Contents/Home/bin/java',
        '/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin/java',
        '/usr/bin/java',
      ];
    }

    return [
      '/usr/lib/jvm/java-8-openjdk-amd64/bin/java',
      '/usr/lib/jvm/java-8-openjdk/bin/java',
      '/usr/lib/jvm/java-1.8.0/bin/java',
      '/usr/bin/java',
    ];
  }

  executeCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { stdio: 'pipe' });
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      proc.stderr.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  async createLauncherProfiles() {
    const profilesPath = path.join(this.gameDir, 'launcher_profiles.json');
    const profiles = {
      profiles: {
        palacraft: {
          name: 'PalaCraft',
          type: 'custom',
          created: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          lastVersionId: this.forgeFullVersion,
          gameDir: this.gameDir,
          javaArgs: `-Xmx${this.settings.ram}M -Xms${Math.min(this.settings.ram, 512)}M`,
        },
      },
      selectedProfile: 'palacraft',
    };

    fs.writeJsonSync(profilesPath, profiles, { spaces: 2 });
  }

  async launchGame(session, onProgress) {
    const installed = await this.isGameInstalled();
    if (!installed) {
      throw new Error('Le jeu n\'est pas installé. Veuillez l\'installer d\'abord.');
    }

    const javaPath = await this.ensureJava();

    onProgress({
      stage: 'Lancement',
      progress: 10,
      detail: 'Préparation du lancement...',
    });

    const nativesDir = path.join(this.gameDir, 'natives', this.mcVersion);
    fs.ensureDirSync(nativesDir);
    await this.extractNatives(nativesDir);

    onProgress({
      stage: 'Lancement',
      progress: 30,
      detail: 'Construction du classpath...',
    });

    const classpath = await this.buildClasspath();
    const args = this.buildGameArguments(session, classpath, nativesDir);

    onProgress({
      stage: 'Lancement',
      progress: 50,
      detail: 'Démarrage de Minecraft...',
    });

    log.info('Launching game with args count:', args.length);

    return new Promise((resolve, reject) => {
      const gameProcess = spawn(javaPath, args, {
        cwd: this.gameDir,
        stdio: 'pipe',
        detached: true,
      });

      gameProcess.stdout.on('data', (data) => {
        log.info('[MC]', data.toString().trim());
      });

      gameProcess.stderr.on('data', (data) => {
        log.warn('[MC-ERR]', data.toString().trim());
      });

      gameProcess.on('error', (error) => {
        log.error('Game process error:', error);
        reject(error);
      });

      gameProcess.on('close', (code) => {
        log.info('Game process exited with code:', code);
      });

      setTimeout(() => {
        onProgress({
          stage: 'Lancement',
          progress: 100,
          detail: 'Minecraft est lancé !',
        });
        gameProcess.unref();
        resolve();
      }, 3000);
    });
  }

  async extractNatives(nativesDir) {
    const libDir = path.join(this.gameDir, 'libraries');
    const nativeSuffixes = ['-natives-linux.jar', '-natives-windows.jar', '-natives-osx.jar'];

    const findNatives = (dir) => {
      if (!fs.existsSync(dir)) return [];
      const results = [];
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          results.push(...findNatives(fullPath));
        } else if (nativeSuffixes.some((suffix) => item.name.endsWith(suffix))) {
          const osKey = this.getOSKey();
          if (item.name.includes(osKey) || item.name.includes('natives-' + osKey)) {
            results.push(fullPath);
          }
        }
      }
      return results;
    };

    const nativeJars = findNatives(libDir);

    for (const jarPath of nativeJars) {
      try {
        const zip = new AdmZip(jarPath);
        const entries = zip.getEntries();

        for (const entry of entries) {
          if (
            !entry.isDirectory &&
            !entry.entryName.startsWith('META-INF') &&
            (entry.entryName.endsWith('.so') ||
              entry.entryName.endsWith('.dll') ||
              entry.entryName.endsWith('.dylib') ||
              entry.entryName.endsWith('.jnilib'))
          ) {
            const outPath = path.join(nativesDir, path.basename(entry.entryName));
            fs.writeFileSync(outPath, entry.getData());
          }
        }
      } catch (error) {
        log.warn('Failed to extract native from', jarPath, error.message);
      }
    }
  }

  async buildClasspath() {
    const classpath = [];

    const forgeJar = path.join(
      this.gameDir,
      'versions',
      this.forgeFullVersion,
      `${this.forgeFullVersion}.jar`
    );
    if (fs.existsSync(forgeJar)) {
      classpath.push(forgeJar);
    }

    const vanillaJar = path.join(
      this.gameDir,
      'versions',
      this.mcVersion,
      `${this.mcVersion}.jar`
    );
    if (fs.existsSync(vanillaJar)) {
      classpath.push(vanillaJar);
    }

    const libDir = path.join(this.gameDir, 'libraries');
    const addJars = (dir) => {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          addJars(fullPath);
        } else if (
          item.name.endsWith('.jar') &&
          !item.name.includes('-natives-') &&
          !item.name.includes('-sources') &&
          !item.name.includes('-javadoc')
        ) {
          classpath.push(fullPath);
        }
      }
    };

    addJars(libDir);
    return classpath;
  }

  buildGameArguments(session, classpath, nativesDir) {
    const separator = process.platform === 'win32' ? ';' : ':';
    const assetsDir = path.join(this.gameDir, 'assets', 'virtual', 'legacy');

    const args = [
      `-Xmx${this.settings.ram}M`,
      `-Xms${Math.min(this.settings.ram, 512)}M`,
      '-XX:+UseConcMarkSweepGC',
      '-XX:+CMSIncrementalMode',
      '-XX:-UseAdaptiveSizePolicy',
      '-Xmn128M',
      `-Djava.library.path=${nativesDir}`,
      '-cp',
      classpath.join(separator),
      'net.minecraft.launchwrapper.Launch',
      '--username', session.username,
      '--version', this.forgeFullVersion,
      '--gameDir', this.gameDir,
      '--assetsDir', assetsDir,
      '--assetIndex', '1.7.10',
      '--uuid', session.uuid.replace(/-/g, ''),
      '--accessToken', session.accessToken,
      '--userProperties', '{}',
      '--userType', session.type === 'microsoft' ? 'mojang' : 'legacy',
      '--tweakClass', 'cpw.mods.fml.common.launcher.FMLTweaker',
    ];

    if (this.settings.autoConnect && this.config.serverIp) {
      args.push('--server', this.config.serverIp);
      args.push('--port', String(this.config.serverPort || 25565));
    }

    if (this.settings.fullscreen) {
      args.push('--fullscreen');
    } else {
      args.push('--width', String(this.settings.width || 854));
      args.push('--height', String(this.settings.height || 480));
    }

    return args;
  }

  async repairGame(onProgress) {
    onProgress({
      stage: 'Réparation',
      progress: 0,
      detail: 'Suppression des fichiers corrompus...',
    });

    const versionsDir = path.join(this.gameDir, 'versions');
    const modsDir = path.join(this.gameDir, 'mods');

    try {
      fs.removeSync(versionsDir);
      fs.removeSync(modsDir);
    } catch (error) {
      log.warn('Cleanup error:', error.message);
    }

    await this.installGame(onProgress);
  }

  async downloadFile(url, destPath) {
    fs.ensureDirSync(path.dirname(destPath));

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'PalaCraft-Launcher/1.0.0',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    fs.writeFileSync(destPath, Buffer.from(response.data));
  }

  async downloadFileWithProgress(url, destPath, onProgress) {
    fs.ensureDirSync(path.dirname(destPath));

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'PalaCraft-Launcher/1.0.0',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const totalLength = parseInt(response.headers['content-length'], 10) || 0;
    let downloaded = 0;

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(destPath);

      response.data.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalLength > 0) {
          onProgress(downloaded, totalLength);
        }
      });

      response.data.pipe(writer);

      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.on('error', reject);
    });
  }

  parseLibraryName(name) {
    const parts = name.split(':');
    const group = parts[0].replace(/\./g, '/');
    const artifact = parts[1];
    const version = parts[2];
    const classifier = parts[3] || '';

    const fileName = classifier
      ? `${artifact}-${version}-${classifier}.jar`
      : `${artifact}-${version}.jar`;

    const urlPath = `${group}/${artifact}/${version}/${fileName}`;

    return {
      group,
      artifact,
      version,
      classifier,
      fileName,
      urlPath,
      path: path.join(this.gameDir, 'libraries', urlPath),
    };
  }

  checkLibraryRules(rules) {
    const osKey = this.getOSKey();
    let dominated = false;
    let result = false;

    for (const rule of rules) {
      if (rule.os) {
        dominated = true;
        if (rule.os.name === osKey) {
          result = rule.action === 'allow';
        }
      } else {
        result = rule.action === 'allow';
      }
    }

    return dominated ? result : true;
  }

  getOSKey() {
    switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'osx';
    default:
      return 'linux';
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

module.exports = MinecraftInstaller;
