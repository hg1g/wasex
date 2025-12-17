import { WASocket, AnyMessageContent } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_FOLDER = path.join(__dirname, '../../data/media');

// Normalizar número de teléfono argentino al formato de WhatsApp
function normalizePhoneNumber(jid: string): string {
  // Extraer el número del JID
  let phone = jid.replace('@s.whatsapp.net', '').replace(/[\s\-\(\)]/g, '');

  // Si ya tiene el formato correcto (549 + 10 dígitos), no hacer nada
  if (/^549\d{10}$/.test(phone)) {
    return phone + '@s.whatsapp.net';
  }

  // Quitar + inicial si existe
  phone = phone.replace(/^\+/, '');

  // Formato: 0XX-XXXX-XXXX (local argentino con código de área)
  // Convertir a: 549-XX-XXXX-XXXX
  if (phone.startsWith('0')) {
    phone = '549' + phone.substring(1);
  }
  // Formato: 15-XXXX-XXXX (móvil local sin código de área - asumimos Buenos Aires 11)
  else if (phone.startsWith('15') && phone.length === 10) {
    phone = '54911' + phone.substring(2);
  }
  // Formato: 54-XX-XXXX-XXXX (sin el 9 de móvil)
  else if (phone.startsWith('54') && !phone.startsWith('549') && phone.length === 12) {
    phone = '549' + phone.substring(2);
  }
  // Número corto sin código de país - agregar 549 (Argentina móvil)
  else if (phone.length === 10 && !phone.startsWith('54')) {
    phone = '549' + phone;
  }

  console.log(`Número normalizado: ${jid} -> ${phone}@s.whatsapp.net`);
  return phone + '@s.whatsapp.net';
}

export type MediaType = 'image' | 'video' | 'none';

export interface MediaFile {
  path: string;
  name: string;
  type: MediaType;
}

export async function listMediaFiles(): Promise<MediaFile[]> {
  try {
    const files = await fs.readdir(MEDIA_FOLDER);
    return files
      .filter((f) => /\.(jpg|jpeg|png|webp|gif|mp4|mov|avi)$/i.test(f))
      .map((name) => ({
        path: path.join(MEDIA_FOLDER, name),
        name,
        type: getMediaType(name),
      }));
  } catch {
    return [];
  }
}

function getMediaType(filename: string): MediaType {
  const ext = filename.toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) {
    return 'image';
  }
  if (['mp4', 'mov', 'avi'].includes(ext || '')) {
    return 'video';
  }
  return 'none';
}

export async function sendMessage(
  socket: WASocket,
  jid: string,
  text: string,
  media?: MediaFile
): Promise<void> {
  // Normalizar el número antes de enviar
  const normalizedJid = normalizePhoneNumber(jid);
  let message: AnyMessageContent;

  if (media && media.type !== 'none') {
    // Verificar que el archivo existe
    try {
      const stats = await fs.stat(media.path);
      console.log(`Archivo encontrado: ${media.name} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (e) {
      console.error(`ERROR: Archivo no encontrado: ${media.path}`);
      // Enviar solo texto si no se encuentra el archivo
      await socket.sendMessage(normalizedJid, { text });
      return;
    }

    const buffer = await fs.readFile(media.path);
    console.log(`Buffer leido: ${buffer.length} bytes`);

    if (media.type === 'image') {
      console.log('Enviando como IMAGEN...');
      message = {
        image: buffer,
        caption: text,
      };
    } else if (media.type === 'video') {
      console.log('Enviando como VIDEO...');
      message = {
        video: buffer,
        caption: text,
        mimetype: 'video/mp4',
        gifPlayback: false,
      };
    } else {
      message = { text };
    }
  } else {
    console.log('Enviando solo TEXTO (sin media seleccionado)');
    message = { text };
  }

  // Reintentar hasta 3 veces en caso de timeout
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Intento ${attempt}/${maxRetries}...`);
      const result = await socket.sendMessage(normalizedJid, message);
      console.log('Mensaje enviado OK:', result?.key?.id);
      return;
    } catch (error: any) {
      lastError = error;
      console.error(`ERROR intento ${attempt}:`, error?.message || error);

      // Si es timeout y no es el último intento, esperar y reintentar
      if (error?.message?.includes('Timed Out') && attempt < maxRetries) {
        console.log(`Esperando 5s antes de reintentar...`);
        await new Promise(r => setTimeout(r, 5000));
      } else if (!error?.message?.includes('Timed Out')) {
        // Si no es timeout, no reintentar
        break;
      }
    }
  }

  console.error('ERROR al enviar después de reintentos:', lastError);
  throw lastError;
}

export function getMediaFolder(): string {
  return MEDIA_FOLDER;
}
