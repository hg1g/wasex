import { WASocket, AnyMessageContent } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_FOLDER = path.join(__dirname, '../../data/media');

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
  let message: AnyMessageContent;

  if (media && media.type !== 'none') {
    // Verificar que el archivo existe
    try {
      const stats = await fs.stat(media.path);
      console.log(`Archivo encontrado: ${media.name} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (e) {
      console.error(`ERROR: Archivo no encontrado: ${media.path}`);
      // Enviar solo texto si no se encuentra el archivo
      await socket.sendMessage(jid, { text });
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

  try {
    const result = await socket.sendMessage(jid, message);
    console.log('Mensaje enviado OK:', result?.key?.id);
  } catch (error) {
    console.error('ERROR al enviar:', error);
    throw error;
  }
}

export function getMediaFolder(): string {
  return MEDIA_FOLDER;
}
