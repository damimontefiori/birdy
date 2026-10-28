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

- La app funciona **de forma autónoma en el navegador**: sin configuración usa un motor de identificación local con escenarios de demostración, un catálogo inicial de aves de Argentina (hornero, chingolo, benteveo, zorzal colorado, celestino, cardenal, calandria, chimango…) y láminas de ejemplo en [`public/plates/`](public/plates/).
- El respaldo en la nube con cuenta de Google está **simulado** sobre IndexedDB; el SDK de Firebase y las reglas de Firestore ya están incluidos para conectarlo.
- Si se define `VITE_BACKEND_API_URL`, la identificación se delega a `POST /api/identify-bird` en un backend seguro. [`server/secureAiProxy.ts`](server/secureAiProxy.ts) es la referencia de ese backend (prompts de identificación e ilustración).
- La suite de criterios de aceptación (CA01–CA17) pasa completa.

## Cómo ejecutarla

Requisitos: Node.js 22+.

```bash
npm install          # instalar dependencias
npm run dev          # servidor de desarrollo en http://localhost:5173 (también accesible desde el celular en la red local)
npm test             # suite de criterios de aceptación CA01–CA17
npm run build        # build de producción en dist/
npm run preview      # servir el build localmente
```

### Configuración opcional

Copiar [`.env.example`](.env.example) a `.env` y completar lo que haga falta:

```bash
# Firebase (respaldo real con cuenta de Google)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Backend seguro para IA y eBird
VITE_BACKEND_API_URL=
```

> 🔒 Las claves de Gemini/Imagen y eBird (`GEMINI_API_KEY`, `EBIRD_API_KEY`) viven **solo en el servidor**, nunca en el cliente.

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
