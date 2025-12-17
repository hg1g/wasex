import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FOLDER = path.join(__dirname, '../../data/auth');

let socket: WASocket | null = null;
let isConnected = false;
let currentQR: string | null = null;

const logger = pino({ level: 'silent' });

export async function connectWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: ['WasEx', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60000,
    markOnlineOnConnect: false,
    syncFullHistory: true, // Sincronizar historial completo para obtener contactos
  });

  socket.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout de conexion - intenta de nuevo'));
    }, 120000);

    socket!.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = await QRCode.toDataURL(qr);
        console.log('QR generado - escanea desde la web');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        currentQR = null;

        if (statusCode === DisconnectReason.loggedOut) {
          clearTimeout(timeout);
          isConnected = false;
          console.log('Sesion cerrada');
          reject(new Error('Sesion cerrada'));
        } else if (statusCode !== DisconnectReason.loggedOut) {
          console.log('Reconectando...');
          connectWhatsApp().then(resolve).catch(reject);
        }
      }

      if (connection === 'open') {
        clearTimeout(timeout);
        isConnected = true;
        currentQR = null;
        console.log('WhatsApp conectado!');
        resolve(socket!);
      }
    });
  });
}

export function getSocket(): WASocket {
  if (!socket) throw new Error('WhatsApp no esta conectado');
  return socket;
}

export function isWhatsAppConnected(): boolean {
  return isConnected;
}

export function getQRCode(): string | null {
  return currentQR;
}
