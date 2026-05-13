const log = require('electron-log');

class ServerManager {
  constructor(config) {
    this.config = config;
    this.serverIp = config.serverIp;
    this.serverPort = config.serverPort;
  }

  async getServerStatus() {
    try {
      const status = await this.pingServer();
      return status;
    } catch (error) {
      log.warn('Server ping failed:', error.message);
      return {
        online: false,
        players: { online: 0, max: 0 },
        motd: 'Serveur hors ligne',
        version: '1.7.10',
      };
    }
  }

  async pingServer() {
    const net = require('net');

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = 5000;

      socket.setTimeout(timeout);

      socket.connect(this.serverPort, this.serverIp, () => {
        const handshake = this.createHandshakePacket(this.serverIp, this.serverPort);
        socket.write(handshake);

        const statusRequest = Buffer.from([0x01, 0x00]);
        socket.write(statusRequest);
      });

      let buffer = Buffer.alloc(0);

      socket.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);

        try {
          const result = this.parseStatusResponse(buffer);
          if (result) {
            socket.destroy();
            resolve(result);
          }
        } catch (_e) {
          // Wait for more data
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
    });
  }

  createHandshakePacket(host, port) {
    const hostBuffer = Buffer.from(host, 'utf8');
    const data = Buffer.alloc(hostBuffer.length + 7);
    let offset = 0;

    data[offset++] = 0x00; // Packet ID
    data[offset++] = 0x04; // Protocol version (4 for 1.7.10)
    data[offset++] = hostBuffer.length;
    hostBuffer.copy(data, offset);
    offset += hostBuffer.length;
    data.writeUInt16BE(port, offset);
    offset += 2;
    data[offset++] = 0x01; // Next state: status

    const packet = Buffer.alloc(offset + 1);
    packet[0] = offset;
    data.copy(packet, 1, 0, offset);

    return packet;
  }

  parseStatusResponse(buffer) {
    try {
      const str = buffer.toString('utf8');
      const jsonStart = str.indexOf('{');
      const jsonEnd = str.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) return null;

      const jsonStr = str.substring(jsonStart, jsonEnd + 1);
      const data = JSON.parse(jsonStr);

      return {
        online: true,
        players: {
          online: data.players ? data.players.online : 0,
          max: data.players ? data.players.max : 0,
          sample: data.players ? data.players.sample : [],
        },
        motd: data.description ? (typeof data.description === 'string' ? data.description : data.description.text) : '',
        version: data.version ? data.version.name : '1.7.10',
        favicon: data.favicon || null,
      };
    } catch (_e) {
      return null;
    }
  }

  getNews() {
    return [
      {
        id: 1,
        title: 'Ouverture du serveur PalaCraft !',
        content: 'Bienvenue sur PalaCraft ! Le serveur est maintenant ouvert a tous les joueurs. Rejoignez-nous pour une aventure incroyable avec des mods uniques, des events reguliers et une communaute active.',
        date: '2024-01-15',
        image: null,
        author: 'Admin',
        category: 'announcement',
        pinned: true,
      },
      {
        id: 2,
        title: 'Nouveau systeme de grades',
        content: 'Decouvrez notre nouveau systeme de grades ! Gagnez de l\'experience et debloquez des avantages exclusifs en jouant sur le serveur. Plus vous jouez, plus vous progressez !',
        date: '2024-01-20',
        image: null,
        author: 'Admin',
        category: 'update',
        pinned: false,
      },
      {
        id: 3,
        title: 'Event PvP ce weekend',
        content: 'Grand tournoi PvP ce weekend ! Des recompenses exceptionnelles attendent les meilleurs combattants. Inscription ouverte des maintenant dans le launcher.',
        date: '2024-01-25',
        image: null,
        author: 'Admin',
        category: 'event',
        pinned: false,
      },
      {
        id: 4,
        title: 'Mise a jour des mods',
        content: 'Nouvelle mise a jour disponible ! Iron Chest a ete mis a jour avec de nouvelles fonctionnalites. Le launcher se mettra a jour automatiquement.',
        date: '2024-02-01',
        image: null,
        author: 'Dev Team',
        category: 'update',
        pinned: false,
      },
    ];
  }

  getShopItems() {
    return {
      categories: [
        {
          id: 'grades',
          name: 'Grades',
          icon: 'crown',
          items: [
            {
              id: 'vip',
              name: 'VIP',
              description: 'Acces VIP avec commandes exclusives, kit VIP journalier, et surnom colore.',
              price: 9.99,
              currency: 'EUR',
              features: [
                'Kit VIP journalier',
                'Surnom colore en jeu',
                '/fly en lobby',
                '3 homes supplementaires',
                'Acces au /craft',
              ],
              color: '#FFD700',
              popular: false,
            },
            {
              id: 'vip_plus',
              name: 'VIP+',
              description: 'Tous les avantages VIP plus des bonus supplementaires exclusifs.',
              price: 19.99,
              currency: 'EUR',
              features: [
                'Tous les avantages VIP',
                'Kit VIP+ journalier',
                '/nick pour changer de pseudo',
                '5 homes supplementaires',
                'Acces au /enchant',
                'Particules exclusives',
              ],
              color: '#FF6B00',
              popular: true,
            },
            {
              id: 'mvp',
              name: 'MVP',
              description: 'Le grade ultime avec tous les privileges et avantages du serveur.',
              price: 34.99,
              currency: 'EUR',
              features: [
                'Tous les avantages VIP+',
                'Kit MVP journalier premium',
                '/fly partout',
                '10 homes supplementaires',
                'Acces prioritaire au serveur',
                'Badge MVP exclusif',
                'Support prioritaire',
              ],
              color: '#E91E63',
              popular: false,
            },
          ],
        },
        {
          id: 'cosmetics',
          name: 'Cosmetiques',
          icon: 'sparkles',
          items: [
            {
              id: 'particle_pack',
              name: 'Pack Particules',
              description: 'Collection de 10 effets de particules uniques.',
              price: 4.99,
              currency: 'EUR',
              features: ['10 effets de particules', 'Activation/desactivation facile'],
              color: '#9C27B0',
              popular: false,
            },
            {
              id: 'pet_pack',
              name: 'Pack Pets',
              description: 'Adoptez un compagnon qui vous suivra partout !',
              price: 7.99,
              currency: 'EUR',
              features: ['5 pets disponibles', 'Personnalisation des noms'],
              color: '#4CAF50',
              popular: false,
            },
          ],
        },
        {
          id: 'boosters',
          name: 'Boosters',
          icon: 'rocket',
          items: [
            {
              id: 'xp_boost',
              name: 'Boost XP x2',
              description: 'Doublez votre gain d\'experience pendant 24h.',
              price: 2.99,
              currency: 'EUR',
              features: ['XP x2 pendant 24h', 'Activable quand vous voulez'],
              color: '#2196F3',
              popular: false,
            },
            {
              id: 'drop_boost',
              name: 'Boost Drop x2',
              description: 'Doublez vos drops pendant 24h.',
              price: 3.99,
              currency: 'EUR',
              features: ['Drops x2 pendant 24h', 'Cumulable avec autres boosts'],
              color: '#FF9800',
              popular: false,
            },
          ],
        },
      ],
    };
  }

  getGrades() {
    return [
      {
        id: 'joueur',
        name: 'Joueur',
        color: '#AAAAAA',
        prefix: '[Joueur]',
        permissions: [
          'Acces au serveur',
          '1 home',
          'Chat global',
        ],
        price: 0,
        isFree: true,
      },
      {
        id: 'vip',
        name: 'VIP',
        color: '#FFD700',
        prefix: '[VIP]',
        permissions: [
          'Tous les droits Joueur',
          '4 homes',
          '/fly en lobby',
          'Kit VIP journalier',
          'Surnom colore',
          '/craft',
        ],
        price: 9.99,
        isFree: false,
      },
      {
        id: 'vip_plus',
        name: 'VIP+',
        color: '#FF6B00',
        prefix: '[VIP+]',
        permissions: [
          'Tous les droits VIP',
          '6 homes',
          '/nick',
          'Kit VIP+ journalier',
          '/enchant',
          'Particules exclusives',
        ],
        price: 19.99,
        isFree: false,
      },
      {
        id: 'mvp',
        name: 'MVP',
        color: '#E91E63',
        prefix: '[MVP]',
        permissions: [
          'Tous les droits VIP+',
          '11 homes',
          '/fly partout',
          'Kit MVP journalier',
          'Acces prioritaire',
          'Badge MVP',
          'Support prioritaire',
        ],
        price: 34.99,
        isFree: false,
      },
    ];
  }

  getPlayerProfile(username) {
    return {
      username: username,
      grade: 'Joueur',
      gradeColor: '#AAAAAA',
      level: 1,
      xp: 0,
      xpToNext: 100,
      playTime: '0h',
      kills: 0,
      deaths: 0,
      money: 0,
      firstJoin: null,
      lastSeen: null,
      achievements: [],
    };
  }
}

module.exports = ServerManager;
