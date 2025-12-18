import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectWhatsApp, getSocket, isWhatsAppConnected, getQRCode, getBroadcastLists } from './whatsapp/client.js';
import { loadContacts, searchContacts, getContacts, addManualContact, markContactUsed, clearContacts } from './contacts/manager.js';
import { sendMessage, listMediaFiles, getMediaFolder } from './whatsapp/sender.js';
import { parseTemplate, setTemplate, getTemplate, extractFirstName } from './templates/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Configurar multer para subir archivos
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../data/media'),
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });
const uploadCsv = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/media', express.static(path.join(__dirname, '../data/media')));

// Crear carpetas necesarias
const folders = [
  path.join(__dirname, '../data/auth'),
  path.join(__dirname, '../data/media'),
  path.join(__dirname, '../public'),
];
folders.forEach((f) => fs.mkdirSync(f, { recursive: true }));

// Estado de la app
let selectedMediaFile: string | null = null;

// ============ RUTAS API ============

// Estado de conexion
app.get('/api/status', (req, res) => {
  res.json({
    connected: isWhatsAppConnected(),
    qrCode: getQRCode(),
    contactsCount: getContacts().length,
    template: getTemplate(),
    selectedMedia: selectedMediaFile,
  });
});

// Conectar a WhatsApp
app.post('/api/connect', async (req, res) => {
  try {
    if (isWhatsAppConnected()) {
      return res.json({ success: true, message: 'Ya conectado' });
    }
    connectWhatsApp().then(async (socket) => {
      console.log('WhatsApp conectado, cargando contactos...');
      await loadContacts(socket);
      console.log(`${getContacts().length} contactos cargados`);
    });
    res.json({ success: true, message: 'Conectando...' });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Listar todos los contactos
app.get('/api/contacts', (req, res) => {
  const query = req.query.q as string;
  if (query) {
    res.json(searchContacts(query));
  } else {
    res.json(getContacts()); // Todos los contactos
  }
});

// Obtener listas de difusión
app.get('/api/broadcasts', async (req, res) => {
  if (!isWhatsAppConnected()) {
    return res.json([]);
  }
  const lists = await getBroadcastLists();
  res.json(lists);
});

// Importar contactos desde CSV
app.post('/api/contacts/import', (req, res) => {
  const { csv } = req.body;
  if (!csv) {
    return res.status(400).json({ success: false, error: 'No CSV data' });
  }

  const lines = csv.split('\n').filter((l: string) => l.trim());
  let imported = 0;

  for (const line of lines) {
    // Formato: telefono,nombre o telefono;nombre
    const parts = line.split(/[,;]/).map((p: string) => p.trim());
    if (parts.length >= 2) {
      const [phone, name] = parts;
      if (phone && name) {
        addManualContact(phone, name);
        imported++;
      }
    }
  }

  res.json({ success: true, imported });
});

// Importar contactos desde Google Contacts CSV
app.post('/api/contacts/import-google', uploadCsv.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  try {
    const content = req.file.buffer.toString('utf-8');
    const lines = content.split('\n');

    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'CSV vacío' });
    }

    // Borrar contactos existentes antes de importar
    clearContacts();

    // Parsear header para encontrar columnas
    const header = parseCSVLine(lines[0]);

    // Buscar columna de nombre (varias variantes)
    const nameIndex = header.findIndex(h => h === 'Name');
    let firstNameIndex = header.findIndex(h => h === 'Given Name' || h === 'First Name');
    const lastNameIndex = header.findIndex(h => h === 'Family Name' || h === 'Last Name');

    // Si no encontró First Name, usar la primera columna (Google a veces la corta)
    if (firstNameIndex === -1 && header.length > 0) {
      firstNameIndex = 0;
    }

    // Buscar todas las columnas de teléfono
    const phoneIndices: number[] = [];
    header.forEach((h, i) => {
      if (h.includes('Phone') && h.includes('Value')) {
        phoneIndices.push(i);
      }
    });

    if (phoneIndices.length === 0) {
      return res.status(400).json({ success: false, error: 'No se encontraron columnas de teléfono. Asegurate de exportar como "Google CSV".' });
    }

    console.log('CSV Headers encontrados:', { nameIndex, firstNameIndex, lastNameIndex, phoneIndices });

    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);

      // Obtener nombre
      let name = '';
      if (nameIndex >= 0 && values[nameIndex]) {
        name = values[nameIndex];
      } else {
        const firstName = firstNameIndex >= 0 ? values[firstNameIndex] || '' : '';
        const lastName = lastNameIndex >= 0 ? values[lastNameIndex] || '' : '';
        name = `${firstName} ${lastName}`.trim();
      }

      if (!name) continue;

      // Obtener teléfonos
      for (const phoneIndex of phoneIndices) {
        const phone = values[phoneIndex];
        if (phone) {
          // Limpiar número de teléfono
          const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
          if (cleanPhone.length >= 8) {
            addManualContact(cleanPhone, name);
            imported++;
          }
        }
      }
    }

    res.json({ success: true, imported });
  } catch (error) {
    console.error('Error parsing Google CSV:', error);
    res.status(500).json({ success: false, error: 'Error al procesar CSV' });
  }
});

// Parser de línea CSV (maneja comillas)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Guardar plantilla
app.post('/api/template', (req, res) => {
  const { template } = req.body;
  setTemplate(template);
  res.json({ success: true });
});

// Obtener plantilla
app.get('/api/template', (req, res) => {
  res.json({ template: getTemplate() });
});

// Listar archivos de media
app.get('/api/media', async (req, res) => {
  const files = await listMediaFiles();
  res.json(files.map((f) => ({ ...f, selected: f.name === selectedMediaFile })));
});

// Subir archivo
app.post('/api/media/upload', upload.single('file'), (req, res) => {
  if (req.file) {
    selectedMediaFile = req.file.filename;
    res.json({ success: true, filename: req.file.filename });
  } else {
    res.status(400).json({ success: false, error: 'No file' });
  }
});

// Seleccionar archivo existente
app.post('/api/media/select', (req, res) => {
  const { filename } = req.body;
  selectedMediaFile = filename || null;
  res.json({ success: true });
});

// Previsualizar mensaje
app.post('/api/preview', (req, res) => {
  const { contactName, contactPhone } = req.body;
  const message = parseTemplate({
    nombre: extractFirstName(contactName),
    telefono: contactPhone,
  });
  res.json({ message, media: selectedMediaFile });
});

// Enviar mensaje
app.post('/api/send', async (req, res) => {
  const { contactId, contactName, contactPhone, customMessage } = req.body;

  console.log('=== ENVIANDO ===');
  console.log('Contacto:', contactName, contactId);
  console.log('Mensaje:', customMessage?.substring(0, 50) + '...');
  console.log('Media seleccionado:', selectedMediaFile);

  if (!isWhatsAppConnected()) {
    console.log('ERROR: WhatsApp no conectado');
    return res.status(400).json({ success: false, error: 'WhatsApp no conectado' });
  }

  try {
    const message = customMessage || parseTemplate({
      nombre: extractFirstName(contactName),
      telefono: contactPhone,
    });

    const mediaFiles = await listMediaFiles();
    const media = selectedMediaFile
      ? mediaFiles.find((f) => f.name === selectedMediaFile)
      : undefined;

    console.log('Media encontrado:', media?.name, media?.type);

    await sendMessage(getSocket(), contactId, message, media);
    console.log('ENVIADO OK');

    // Marcar contacto como usado (para ordenar por frecuencia)
    markContactUsed(contactId);

    res.json({ success: true });
  } catch (error) {
    console.log('ERROR:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║   WasEx - WhatsApp Sender                 ║
║                                           ║
║   Abre en tu navegador:                   ║
║   http://localhost:${PORT}                    ║
║                                           ║
╚═══════════════════════════════════════════╝
  `);
});
