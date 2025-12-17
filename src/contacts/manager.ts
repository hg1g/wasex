import { WASocket } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTACTS_FILE = path.join(__dirname, '../../data/contacts.json');

export interface ParsedContact {
  id: string;
  phone: string;
  name: string;
  useCount?: number;
  lastUsed?: number;
}

let contacts: Map<string, ParsedContact> = new Map();

// Cargar contactos guardados
function loadSavedContacts() {
  try {
    if (fs.existsSync(CONTACTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
      for (const c of data) {
        contacts.set(c.id, c);
      }
      console.log(`Contactos cargados desde archivo: ${contacts.size}`);
    }
  } catch (e) {
    console.error('Error cargando contactos:', e);
  }
}

// Guardar contactos
function saveContacts() {
  try {
    const data = Array.from(contacts.values());
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error guardando contactos:', e);
  }
}

// Cargar al iniciar
loadSavedContacts();

export async function loadContacts(socket: WASocket): Promise<ParsedContact[]> {
  socket.ev.on('messaging-history.set', (data) => {
    if (data.chats) {
      for (const chat of data.chats) {
        const jid = chat.id;
        const name = chat.name || (chat as any).pushName || (chat as any).notify;
        addContact(jid, name);
      }
    }
    if (data.contacts) {
      for (const contact of data.contacts) {
        addContact(contact.id, contact.name || contact.notify);
      }
    }
    saveContacts();
    console.log(`Contactos sincronizados: ${contacts.size}`);
  });

  socket.ev.on('contacts.upsert', (newContacts) => {
    for (const contact of newContacts) {
      addContact(contact.id, contact.name || contact.notify);
    }
    saveContacts();
  });

  socket.ev.on('chats.upsert', (chats) => {
    for (const chat of chats) {
      addContact(chat.id, chat.name);
    }
    saveContacts();
  });

  return getContacts();
}

function addContact(jid: string | undefined | null, name: string | undefined | null): boolean {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return false;

  const phone = jid.replace('@s.whatsapp.net', '');
  const displayName = name || phone;

  const existing = contacts.get(jid);

  if (!existing) {
    contacts.set(jid, { id: jid, phone, name: displayName, useCount: 0, lastUsed: 0 });
    return true;
  } else if (displayName !== phone && existing.name === existing.phone) {
    existing.name = displayName;
    return true;
  }
  return false;
}

// Marcar contacto como usado (llamar después de enviar)
export function markContactUsed(contactId: string) {
  const contact = contacts.get(contactId);
  if (contact) {
    contact.useCount = (contact.useCount || 0) + 1;
    contact.lastUsed = Date.now();
    saveContacts();
    console.log(`Contacto ${contact.name} marcado como usado (${contact.useCount} veces)`);
  }
}

export function searchContacts(query: string): ParsedContact[] {
  const q = query.toLowerCase();
  return getContacts().filter(
    (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
  );
}

export function getContacts(): ParsedContact[] {
  // Ordenar: primero los más usados, después alfabético
  return Array.from(contacts.values()).sort((a, b) => {
    const aUse = a.useCount || 0;
    const bUse = b.useCount || 0;

    // Si ambos tienen uso, ordenar por uso descendente
    if (aUse > 0 || bUse > 0) {
      if (aUse !== bUse) return bUse - aUse;
    }

    // Si tienen el mismo uso (o ninguno), ordenar alfabéticamente
    return a.name.localeCompare(b.name);
  });
}

export function addManualContact(phone: string, name: string) {
  const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
  const jid = cleanPhone + '@s.whatsapp.net';
  contacts.set(jid, { id: jid, phone: cleanPhone, name, useCount: 0, lastUsed: 0 });
  saveContacts();
}

export function clearContacts() {
  contacts.clear();
  saveContacts();
}

export function getContactByPhone(phone: string): ParsedContact | undefined {
  const normalized = phone.replace(/[\s\-\(\)]/g, '');
  return getContacts().find((c) => c.phone.includes(normalized));
}
