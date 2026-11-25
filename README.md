# 🐦 Birdy — Cuaderno de Aves

Álbum naturalista personal para descubrir, identificar y coleccionar las aves que se observan en el jardín y durante los viajes. Cada especie descubierta se incorpora al cuaderno como una **lámina ilustrada** en acuarela naturalista o lápiz grafito, junto con su ficha breve y el historial de avistamientos reales (foto, fecha, lugar y notas).

Pensada para una única usuaria (Valeria), en español rioplatense (`es-AR`), con uso principal desde un teléfono **Android** como PWA instalable.

> No es una herramienta profesional de censos ni una red social: es un cuaderno de campo artesanal que además permite compartir descubrimientos con familia y amigos.

## Funcionalidades del MVP

- **Cuadernos temáticos** — *Aves de mi jardín*, cuadernos de viaje, etc. Cada cuaderno fija su estilo de ilustración (`acuarela_naturalista` o `lapiz_grafito`).
- **Identificación asistida por IA a partir de una foto**, con incertidumbre comunicada en lenguaje claro en lugar de porcentajes:
  - *Seguridad alta* → especie lista para confirmar con un toque.
  - *Con duda* → 2–3 candidatas y el motivo de la duda (`requiere_confirmacion`).
  - *Evidencia insuficiente / sin ave* → queda como «Pendiente de identificar»; nunca se inventa una especie.
- **Una lámina por especie y por cuaderno**: varios avistamientos de la misma especie se agregan a su historial. Las ilustraciones se reutilizan por `(especie, estilo)` y se puede pedir otra versión.
- **Lectura local de EXIF** (fecha/hora y GPS) como sugerencias editables, y **sanitización** completa de metadatos en toda imagen pública o exportada.
- **Funcionamiento offline**: fotos originales en IndexedDB y cola idempotente de respaldo (`local → subiendo → respaldado / error`), con restauración al cambiar de celular.
- **Compartir en redes**: compositor Canvas en formatos `9:16` (historia) y `4:5` (publicación), con o sin la foto real, vía la hoja nativa de compartir de Android.
- **Cuaderno público de solo lectura** por enlace (`/?share=<token>`), sin cuenta ni instalación, revocable al instante. Por defecto no expone fotos ni notas, y nunca coordenadas ni datos de la cuenta.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend / PWA | React 19 + TypeScript + Vite, Service Worker, manifest instalable |
| Persistencia local | IndexedDB (fotos binarias + cola de sincronización) |
| EXIF | [`exifr`](https://github.com/MikeKovarik/exifr) |
| Íconos | `lucide-react` |
| Nube (prevista) | Firebase Auth (Google) + Firestore + Storage + Functions — ver [`firestore.rules`](firestore.rules) |
| IA (backend) | Google Gemini (identificación multimodal) / Imagen (láminas) + eBird (taxonomía `es_AR`) |
| Tests | Vitest + Testing Library + jsdom |

La elección de PWA frente a Flutter o Capacitor está justificada en el [documento de diseño técnico](Diseno_Tecnico_y_Plan_MVP.md#2-evaluación-y-decisión-del-stack-tecnológico-8-11-ca17-132).

## Estado actual

- **Identificación precisa y resiliente con Google Gemini (`gemini-3-flash-preview` + cooldown inteligente ante picos 503/429 + respaldos opcionales Groq/OpenRouter/HF)** + fotos reales de referencia de iNaturalist. Incluye protocolo visual previo (`visualObservation`) para coherencia cromática y morfológica y ecología de jardín (`¿Qué viene a buscar a tu jardín?`: flores, árboles frutales/nativos y qué insectos o alimentos consume).
- **Ilustraciones 100% generadas por IA (sin filtros locales)**: Muralismo de fauna autóctona, Acuarela naturalista y Lápiz grafito se generan exclusivamente mediante modelos de IA en el servidor (Google Gemini Imagen con referencia anatómica, Cloudflare Workers AI FLUX.1-schnell, Hugging Face FLUX.1-schnell u OpenAI `gpt-image-1`).
- **Persistencia real en la nube (Firebase Firestore + Cloudflare R2)**: el servidor sincroniza colecciones estructuradas en Firestore (`users/{uid}/notebooks`, `sheets`, `sightings`, `illustrations`, `custom_species`, `public_shared_notebooks/{token}`) y almacena fotos sanitizadas e ilustraciones en un bucket Cloudflare R2, conservando IndexedDB offline-first en el dispositivo.
- **Postales para compartir (Historia 9:16 y Feed 4:5)** con texto completo en múltiples líneas sin recortes (`…`), tamaños de imagen preservados e información ecológica del jardín aprovechando el espacio cuando no se incluye nota personal.
- La suite de tests (`npm test`) verifica los criterios de aceptación (CA01–CA17), ecología de jardín, política de ilustraciones IA y serialización Firestore / firma SigV4 R2.

## Cómo ejecutarla

Requisitos: Node.js 22+.

```bash
npm install          # instalar dependencias
cp .env.example .env # agregar GEMINI_API_KEY en .env para activar visión e ilustraciones IA
npm run dev          # servidor de desarrollo + endpoints seguros /api/* en http://localhost:5173
npm test             # suite de tests automatizados
npm run build        # build de producción en dist/
npm run preview      # servir el build localmente (con endpoints /api/* activos)
```

### Configuración de IA (Google Gemini) y Acceso con Google

Copiá [`.env.example`](.env.example) a `.env` y agregá:

```bash
# Clave de servidor de Gemini (https://aistudio.google.com/apikey)
GEMINI_API_KEY=tu_clave_aqui

# Autenticación real con Google (protege la cuota de Gemini en producción)
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
ALLOWED_EMAILS=valedepadua@gmail.com,damiyvale@gmail.com
AUTH_SESSION_SECRET=una_clave_aleatoria_larga_de_al_menos_32_caracteres

# Opcional: Firebase (respaldo real con cuenta de Google)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Opcional: backend separado si se despliega server/index.ts en otro host
VITE_BACKEND_API_URL=
```

> 🔒 `GEMINI_API_KEY` y `AUTH_SESSION_SECRET` viven **solo en el servidor**, nunca en el cliente. Cuando `GOOGLE_CLIENT_ID` está configurado (y siempre en producción), `/api/identify-bird` y `/api/generate-illustration` exigen una sesión verificada con Google perteneciente a `ALLOWED_EMAILS`.

## Estructura del proyecto

```
├── public/                     # manifest, service worker y láminas de ejemplo
├── server/
│   └── secureAiProxy.ts        # backend de referencia: prompts de identificación e ilustración
├── src/
│   ├── App.tsx                 # app principal (cuadernos, láminas, avistamientos)
│   ├── components/
│   │   ├── PublicNotebookView.tsx   # vista pública de solo lectura (/?share=<token>)
│   │   ├── ShareNotebookModal.tsx   # activar/revocar el enlace del cuaderno
│   │   └── ShareSightingModal.tsx   # exportar una lámina para redes
│   ├── data/
│   │   └── argentinaBirdsCatalog.ts # catálogo taxonómico (referencia eBird es_AR)
│   ├── services/
│   │   ├── aiBirdService.ts         # identificación, incertidumbre, láminas y caché anti-duplicados
│   │   ├── exifService.ts           # lectura de EXIF y sanitización de imágenes
│   │   ├── storageAndSyncService.ts # IndexedDB, cola de respaldo y proyecciones públicas
│   │   └── socialShareComposer.ts   # composición Canvas 9:16 / 4:5 y Web Share API
│   ├── styles/botanical.css    # sistema visual «cuaderno de campo botánico»
│   ├── types/domain.ts         # entidades y máquinas de estado del dominio
│   └── __tests__/              # criterios de aceptación del MVP
├── firestore.rules             # reglas privadas por usuaria + proyecciones públicas revocables
├── Especificacion_Cuaderno_de_Aves_MVP.md
└── Diseno_Tecnico_y_Plan_MVP.md
```

## Documentación

- [Especificación funcional del MVP](Especificacion_Cuaderno_de_Aves_MVP.md) — visión, entidades del dominio, flujos y criterios de aceptación.
- [Diseño técnico y plan de implementación](Diseno_Tecnico_y_Plan_MVP.md) — decisiones de producto, matriz de stack, arquitectura, proveedores de IA, privacidad y sistema visual.
