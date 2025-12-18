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
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FOLDER = path.join(__dirname, '../../data/auth');

let socket: WASocket | null = null;
let isConnected = false;
let currentQR: string | null = null;
let sessionErrorCount = 0;

const logger = pino({ level: 'silent' });

// Borrar sesión corrupta
export function clearSession() {
  try {
    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
      console.log('Sesión borrada - escanea QR de nuevo');
    }
    isConnected = false;
    socket = null;
    currentQR = null;
    sessionErrorCount = 0;
  } catch (e) {
    console.error('Error borrando sesión:', e);
  }
}

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
    defaultQueryTimeoutMs: 60000, // Timeout para queries
    markOnlineOnConnect: false,
    syncFullHistory: true,
    retryRequestDelayMs: 2000, // Delay entre reintentos internos
  });

  socket.ev.on('creds.update', saveCreds);

  // Manejar errores de sesión (Bad MAC, etc.)
  process.on('unhandledRejection', (reason: any) => {
    const errorMsg = reason?.message || String(reason);
    if (errorMsg.includes('Bad MAC') || errorMsg.includes('Bad Decrypt')) {
      sessionErrorCount++;
      console.error(`Error de sesión (${sessionErrorCount}/3): ${errorMsg}`);

      if (sessionErrorCount >= 3) {
        console.log('Demasiados errores de sesión - borrando sesión automáticamente...');
        clearSession();
      }
    }
  });

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

// Obtener listas de difusión
export async function getBroadcastLists(): Promise<Array<{ id: string; name: string; recipients: string[] }>> {
  if (!socket) return [];

  try {
    // Obtener todos los chats
    const store = await socket.groupFetchAllParticipating();
    const broadcasts: Array<{ id: string; name: string; recipients: string[] }> = [];

    // Los broadcast tienen JID terminado en @broadcast
    for (const [jid, data] of Object.entries(store)) {
      if (jid.endsWith('@broadcast')) {
        broadcasts.push({
          id: jid,
          name: (data as any).subject || 'Lista sin nombre',
          recipients: ((data as any).participants || []).map((p: any) => p.id),
        });
      }
    }

    return broadcasts;
  } catch (e) {
    console.error('Error obteniendo listas de difusión:', e);
    return [];
  }
}
