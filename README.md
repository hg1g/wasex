# WasEx - WhatsApp Sender

Aplicación web local para enviar mensajes personalizados de WhatsApp con plantillas y archivos multimedia (imágenes/videos).

## Requisitos

- Node.js 18+
- WhatsApp en tu celular

## Instalación

```bash
git clone git@github.com:hg1g/wasex.git
cd wasex
npm install
```

## Uso

### 1. Iniciar la aplicación

```bash
npm run dev
```

Abre http://localhost:3000 en tu navegador.

### 2. Conectar WhatsApp

1. Click en **"Conectar"**
2. Escanea el código QR con WhatsApp (Dispositivos vinculados)
3. La sesión queda guardada para futuras sesiones

### 3. Cargar contactos

Los contactos de WhatsApp no incluyen nombres de tu agenda. Tienes dos opciones:

**Opción A: Importar desde CSV**
1. Despliega "Importar contactos desde CSV"
2. Pega tus contactos en formato:
   ```
   5491112345678,Juan Perez
   5491187654321,Maria Garcia
   ```
3. Click en **"Importar"**

**Opción B: Importar desde Excel**
1. Crea un archivo `contacts.xlsx` con columnas: `telefono`, `nombre`
2. Usa el script de importación (próximamente)

### 4. Crear plantilla

Escribe tu mensaje usando variables:
- `{{nombre}}` - Primer nombre del contacto
- `{{telefono}}` - Número de teléfono

Ejemplo:
```
Hola {{nombre}}!

Te invitamos a nuestro evento.
```

**Importante:** Click en **"Guardar Plantilla"** antes de continuar.

### 5. Agregar flyer (opcional)

- Click en la zona de upload o arrastra un archivo
- Formatos soportados: JPG, PNG, WEBP, GIF, MP4, MOV, AVI
- Selecciona el archivo que quieras usar

### 6. Seleccionar contactos

- **Click:** Seleccionar/deseleccionar un contacto
- **Shift+Click:** Seleccionar rango de contactos
- **Ctrl+Click:** Agregar a la selección actual
- Usa el buscador para filtrar por nombre o teléfono

### 7. Enviar mensajes

1. Click en **"Agregar seleccionados a la cola"**
2. Edita los mensajes individuales si es necesario
3. Click en **"ENVIAR TODOS"**

Los mensajes se envían con delays aleatorios de 30-60 segundos para evitar bloqueos de WhatsApp.

## Estructura de archivos

```
wasex/
├── src/                  # Código fuente
├── public/               # Interfaz web
├── data/
│   ├── auth/            # Sesión de WhatsApp (no commitear)
│   ├── media/           # Flyers subidos
│   └── contacts.json    # Contactos guardados
└── plantillas/          # Plantillas de ejemplo
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia en modo desarrollo |
| `npm run build` | Compila TypeScript |
| `npm start` | Inicia versión compilada |

## Notas

- La sesión de WhatsApp se guarda en `data/auth/`
- Los contactos más usados aparecen primero en la lista
- No envíes muchos mensajes seguidos para evitar bloqueos
