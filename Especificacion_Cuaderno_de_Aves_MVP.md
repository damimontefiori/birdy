# Cuaderno de Aves — Especificación de producto y desarrollo

**Versión:** 1.0 (MVP)  
**Fecha:** 19 de octubre de 2026  
**Estado:** Especificación funcional para análisis técnico y posterior implementación asistida por IA  
**Usuaria inicial:** Valeria  
**Idioma de la aplicación:** español (Argentina)

> **Instrucción para la IA desarrolladora:** Este documento contiene el alcance funcional, las experiencias esperadas, los requisitos no funcionales y los criterios de aceptación. No es una orden de empezar a programar inmediatamente. Primero analizá ambigüedades, riesgos y dependencias; evaluá y justificá el stack tecnológico propuesto; definí una arquitectura y un plan de entregas; identificá decisiones pendientes que afecten el producto. Podés elegir tecnologías distintas de las recomendadas, pero **no podés cambiar requisitos funcionales acordados sin solicitar aprobación**. No agregues complejidad multipersona, monetización ni funcionalidades ajenas al MVP por iniciativa propia.

## 1. Visión del producto

Una aplicación personal para descubrir, identificar y registrar aves observadas en el jardín del hogar y durante viajes, presentada como un **cuaderno de campo naturalista, artístico y artesanal**. La experiencia debe despertar curiosidad y satisfacción al completar la colección: cada especie descubierta se incorpora como una lámina ilustrada (acuarela o lápiz grafito), acompañada de información breve y de los avistamientos reales de Valeria.

No se busca una herramienta profesional de censos ornitológicos ni una red social, sino **un álbum personal de naturaleza** que también permita compartir descubrimientos y cuadernos con familiares y amigos.

### Objetivos del MVP

1. Permitir identificar especies de aves a partir de fotografías.
2. Crear cuadernos temáticos (principalmente *Aves de mi jardín*, y otros de viajes).
3. Conservar ilustraciones naturalistas de cada especie, fotos originales, fechas, lugares y notas.
4. Proteger los registros frente a pérdida o cambio de celular mediante respaldo asociado a una cuenta de Google.
5. Permitir compartir una lámina/avistamiento en redes y un cuaderno mediante enlace web de solo lectura.
6. Brindar una experiencia visual cálida y sencilla, sin sensación de software técnico.

## 2. Público y plataformas

- **Usuaria principal inicial:** Valeria. Diseñar para una única persona; no construir capacidades administrativas o multiusuario generalizadas en el MVP.
- **Dispositivo de uso principal:** teléfono **Android**.
- **Origen habitual de fotografías:** cámara nativa del teléfono, desde la cual luego se selecciona una imagen en la app. También debe poder capturarse una foto directamente desde la app si resulta conveniente.
- **Personas destinatarias de contenido compartido:** no tienen que instalar la app, registrarse ni usar Android. Deben poder abrir un **enlace HTTPS en cualquier navegador moderno**, desde celular o computadora.
- **Conectividad:** normalmente disponible, pero puede interrumpirse transitoriamente en el fondo del jardín o durante viajes.

## 3. Principios de experiencia y estilo visual

- Estética de **cuaderno botánico/naturalista tradicional**: papel de tonos cálidos, textura sutil, verdes apagados, ilustraciones de aves y detalles delicados de hojas y flores.
- Personalidad artística y contemplativa, inspirada en acuarelas y apuntes de campo. No recargar la interfaz con adornos que compitan con el contenido.
- Tipografía legible para información y una variante manuscrita **solo para acentos** (títulos, notas, pequeñas firmas); garantizar lectura y contraste.
- Metáfora de páginas y cuaderno que se hojea, con transiciones suaves y opción de reducir animaciones.
- Gamificación **sutil**: satisfacción por especies nuevas y evolución de la colección. **Sin** puntuaciones, rankings, logros competitivos ni presión por uso.
- Los formularios y estados deben ser comprensibles para una persona sin conocimientos técnicos.
- Mantener coherencia entre app, vistas compartidas y piezas para redes.

## 4. Entidades y reglas del dominio

### 4.1. Cuaderno

- Nombre editable (p. ej., *Aves de mi jardín*, *Vacaciones en Lago Puelo*).
- Tipo: **hogar/jardín** o **viaje** (sin restringir futuros cuadernos temáticos).
- Descripción o contexto opcional.
- Lugar general opcional y período opcional (p. ej., localidad, región, vacaciones de verano).
- Estilo de ilustración **elegido al crear el cuaderno**: `acuarela_naturalista` o `lapiz_grafito`.
- El estilo permanece fijo una vez que hay ilustraciones; cambiarlo requeriría una funcionalidad explícita futura de regeneración/migración de todas las láminas.
- Portada y navegación por especies descubiertas; historial separado por cuaderno.

### 4.2. Especie

- Identificador taxonómico estable cuando esté disponible, nombre científico, nombre común en español apropiado para Argentina y, opcionalmente, nombres alternativos.
- Breve información comprensible: rasgos para reconocerla, comportamiento típico, alimentación o hábitat y distribución general. Priorizar veracidad y concisión, sin inventar datos.
- Posible procedencia de la identificación, alternativas sugeridas, nivel de certeza y confirmación humana.
- **Una ficha/lámina por especie y por cuaderno**, no una ficha por fotografía.
- Una misma especie puede aparecer en varios cuadernos. Puede reutilizarse una ilustración existente **si coincide especie y estilo**, preservando la coherencia visual de cada cuaderno.

### 4.3. Avistamiento

- Cuaderno al que pertenece y especie asignada cuando esté identificada.
- Una fotografía original como mínimo en el flujo habitual, preservada sin alteraciones.
- Fecha/hora observada (puede diferir de la fecha de carga).
- Ubicación privada y opcional (aproximada; coordenadas solo si se obtienen y la usuaria las acepta).
- Nota personal opcional y editable.
- Estado: `pendiente_identificacion`, `requiere_confirmacion`, `identificado`, `error_procesamiento` u otro modelo equivalente justificado.
- Estado de respaldo/sincronización, distinguible del estado de identificación.
- Múltiples avistamientos de la misma especie pueden agregarse al historial de **una única lámina** en el cuaderno.

### 4.4. Ilustración

- Imagen generada por IA para una especie confirmada, vinculada a un estilo artístico.
- Pose libre: **no necesita replicar la posición de la fotografía**, pero debe respetar características diagnósticas, colores, morfología y plumaje típicos de la especie.
- Se genera después de la confirmación de identidad y normalmente **una sola vez por combinación de especie y estilo**.
- La usuaria puede pedir manualmente otra versión si no le convence; la seleccionada reemplaza la visualización principal, sin necesidad de perder la foto original.
- Guardar archivo final, datos mínimos de procedencia y vínculo a especie/estilo; no depender de que el proveedor de IA conserve imágenes.

## 5. Flujos funcionales

### F01. Primer uso / onboarding

1. Iniciar sesión con Google y autorizar el acceso estrictamente necesario.
2. Explicar el concepto de cuaderno personal y protección de registros sin un tutorial largo.
3. Guiar a crear el primer cuaderno: **nombre**, tipo, **estilo (acuarela o grafito)** y **ubicación general opcional**.
4. Abrir el cuaderno recién creado con una acción clara: **«Registrar mi primera ave»**.
5. Las siguientes aperturas ingresan con la sesión persistida, siempre que corresponda.

### F02. Incorporar una fotografía

1. Desde un cuaderno, tocar «Registrar ave».
2. Elegir entre:
   - **«Elegir foto de la galería»**: caso principal. Admitir fotografías tomadas antes, incluso durante vacaciones.
   - **«Sacar foto»**: capturar con cámara desde la app o usando el flujo nativo, según la tecnología elegida.
3. Mostrar vista previa y confirmar la foto.
4. Leer **metadatos EXIF cuando existan y el sistema permita acceder a ellos**:
   - Fecha/hora de captura.
   - Ubicación GPS, si está presente.
5. Sugerir fecha y ubicación, indicando que provienen de la foto, y permitir **revisar, corregir o eliminar** esos valores. Si no hay metadatos, ofrecer valores editables sin inventar precisión.
6. Permitir incorporar una nota personal opcional.
7. Guardar el borrador y comenzar la identificación cuando haya conectividad.

**Privacidad EXIF:** la ubicación exacta obtenida de una foto es privada. No debe filtrarse en vistas públicas, URL, archivos para redes ni propiedades EXIF de imágenes exportadas. Considerar que galerías/plataformas pueden eliminar o limitar metadatos; la app debe funcionar igual.

### F03. Identificación de ave asistida por IA

1. Analizar fotografía (y, cuando corresponda y con permiso, contexto geográfico/temporal).
2. Proponer especie, nombre común/científico, explicación muy breve y **grado de seguridad expresado de manera comprensible**.
3. Si hay seguridad suficiente, **proponer** el registro como especie identificada, sin inventar datos y manteniendo posibilidad de corrección. Si la seguridad es limitada, declarar la duda y presentar una o más especies candidatas para que Valeria confirme.
4. Si no hay evidencia suficiente, **no adjudicar arbitrariamente una especie**. Permitir guardar como «Pendiente de identificar» y reintentar posteriormente con la misma u otra fotografía.
5. La validación debe utilizar, cuando proceda, referencias taxonómicas y de distribución confiables. Un catálogo como eBird puede aportar taxonomía y datos de observación/distribución según disponibilidad, **pero no debe asumirse que su API identifica especies directamente desde fotos**.
6. La confirmación final, o la corrección manual, precede a la generación definitiva de la lámina.

**Nota técnica:** una puntuación numérica dada por un LLM no equivale automáticamente a probabilidad calibrada. La IA desarrolladora debe proponer cómo evaluar precisión y gestionar incertidumbre. Incluir pruebas con fotos reales de aves argentinas, especies visualmente semejantes, fotografías borrosas, aves parcialmente ocultas y fotos que no contienen aves.

### F04. Registro de una especie nueva

1. Tras confirmar la especie, verificar si ya existe en el cuaderno actual.
2. Si es nueva, crear una ficha/lámina de especie.
3. Generar la ilustración con el estilo elegido para ese cuaderno.
4. Mostrar el resultado con: ilustración, nombre común y científico, datos concisos, fecha del primer avistamiento, foto original, nota opcional y referencias generales de lugar.
5. Habilitar regenerar ilustración a pedido, conservando el vínculo a la foto original y evitando llamadas redundantes a la IA.

### F05. Registrar una especie ya observada

1. Avisar: **«Ya registraste un hornero en este cuaderno. ¿Querés guardar otro avistamiento?»** (texto ajustado a la especie).
2. Si confirma, añadir foto, fecha, lugar y nota al historial de esa especie.
3. **No duplicar la ficha ni generar otra ilustración por defecto**.
4. Si no confirma, permitir cancelar sin alterar el registro previo.
5. El mismo pájaro/especie puede aparecer sin conflictos en otro cuaderno.

### F06. Revisar y editar un cuaderno

- Abrir biblioteca de cuadernos y seleccionar uno.
- Hojear o recorrer especies registradas y abrir su lámina.
- Ver galería/historial de avistamientos de una especie.
- Editar notas, fechas y ubicaciones privadas; corregir identificaciones cuando corresponda, con tratamiento consistente de fichas duplicadas o ilustraciones previas.
- Ver avistamientos pendientes e iniciar nuevo intento de identificación.
- Mostrar indicadores discretos de sincronización: guardado local, subiendo, respaldado, error/reintentar.

### F07. Compartir un avistamiento individual

1. Desde una ficha o avistamiento, elegir «Compartir avistamiento».
2. Mostrar previsualización con dos variantes seleccionables:
   - **Solo ilustración artística + datos básicos**.
   - **Ilustración artística + fotografía real + datos básicos**.
3. Componer una **imagen lista para compartir**, sin volver a llamar al modelo generativo, en formatos adecuados para historia y publicación de redes.
4. Incluir nombre del ave, fecha si se desea, nota opcional elegida explícitamente y una **firma discreta** del estilo «Aves de mi jardín — Valeria» (adaptable al nombre real del cuaderno).
5. Abrir mecanismo de compartir nativo de Android o una solución equivalente justificada que permita publicar o enviar por Instagram, WhatsApp y otras apps instaladas.
6. No exigir integraciones con cuentas ni almacenar credenciales de redes sociales.
7. Nunca incluir coordenadas, dirección postal ni metadatos privados. Permitir comprobar exactamente qué se compartirá antes de hacerlo.

### F08. Compartir un cuaderno completo

1. Valeria puede activar «Compartir cuaderno» y obtener un **enlace HTTPS público de solo lectura**.
2. Abrir ese enlace desde **cualquier navegador actual, sin instalar la app ni autenticarse**.
3. La experiencia debe preservar la estética del cuaderno y permitir hojear/consultar las láminas publicadas.
4. Permitir **revocar el enlace** (y, si fuera necesario, crear otro).
5. No publicar datos privados: ubicación precisa, coordenadas, EXIF, notas marcadas como privadas ni información de cuenta de Google.
6. Diferenciar claramente la información **visible para invitados** del registro privado de Valeria. Como propuesta de MVP, publicar por defecto las fichas artísticas y datos generales; las fotos originales y notas personales deben requerir decisión explícita si se incluyen. La IA desarrolladora debe documentar esta decisión de UX antes de implementarla.
7. La vista pública debe ser realmente de solo lectura, con controles de acceso aplicados **en el backend**, no solo ocultando botones.

## 6. Respaldo, persistencia y funcionamiento sin conexión

- **Inicio de sesión:** Google; sesión persistente.
- **Fuente de verdad:** almacenamiento remoto de cuadernos, especies, avistamientos, notas, fotografías e ilustraciones.
- **Recuperación:** al iniciar sesión en otro teléfono con la misma cuenta, deben reaparecer todos los registros **confirmados como respaldados**.
- **Corte de conexión:** permitir que se elija/tome una foto y se guarde como borrador local aunque no exista internet, para procesarla luego. **No exigir identificación por IA offline**.
- **Cola de pendientes:** reintentar subidas/interrupciones sin duplicar avistamientos (operaciones idempotentes y reanudables).
- **Diferencia fundamental:** una ficha de Firestore cacheada localmente **no garantiza que el archivo binario original ya esté respaldado**. Diseñar una estrategia explícita para persistencia y subida de imágenes, y no declarar «respaldado» hasta confirmar que foto y metadatos relevantes llegaron a la nube.
- **Evitar pérdidas:** manejar cierres de app, falta de espacio, permisos revocados y fotos seleccionadas mediante accesos temporales. Copiar de forma segura al almacenamiento propio de la app cuando sea necesario para pendientes.
- **Respaldos adicionales:** considerar mecanismos simples de recuperación o exportación técnica de datos si fueran necesarios; **exportación de un cuaderno a PDF para imprimir no forma parte del MVP**.

## 7. Propuesta de arquitectura y servicios de IA

### 7.1. Recomendación inicial, no vinculante

- **Cliente principal:** Flutter para Android.
- **Identidad:** Firebase Authentication con proveedor Google.
- **Datos estructurados:** Cloud Firestore.
- **Imágenes originales e ilustraciones:** Cloud Storage for Firebase, con reglas de seguridad apropiadas.
- **Operaciones privilegiadas y proveedores de IA:** backend ligero (por ejemplo, Cloud Functions o Cloud Run), con secretos solo en servidor.
- **Compartir cuaderno:** sitio web público de lectura (puede compartir componentes/diseño o implementarse por separado), servido desde dominio HTTPS propio. **No usar Firebase Dynamic Links**, servicio discontinuado.
- **Generación de piezas para redes:** composición local o controlada en servidor, utilizando ilustración y foto existentes, sin generación de imagen nueva por defecto.

### 7.2. Identificación de especies

La selección concreta del proveedor/modelo **queda abierta a evaluación técnica**. Comparar como mínimo un modelo multimodal adecuado de OpenAI y uno de Google, considerando calidad real con imágenes de aves locales, costo, latencia, facilidad de integración y capacidad de describir incertidumbre. Comprobar taxonomía y distribución con fuentes ornitológicas confiables y distinguir esta validación de la identificación visual.

### 7.3. Generación de láminas artísticas

Seleccionar un modelo de generación/edición de imágenes de calidad alta, con pruebas visuales reales en **acuarela naturalista** y **lápiz grafito**. El prompt debe preservar morfología y rasgos característicos de la especie aunque admita libertad en la pose. Evitar especies híbridas ficticias, anatomía imposible, cambios de color incorrectos y texto ilegible embebido en la imagen. **Componer textos y etiquetas mediante la interfaz, no dentro de la imagen generativa**, salvo decisión fundada.

### 7.4. Control de costos

- Evitar identificaciones repetidas por reintentos accidentales.
- No regenerar una lámina si ya existe para especie/estilo, salvo solicitud expresa.
- Registrar métricas mínimas y límites razonables de consumo de IA.
- Asegurar que la experiencia informe fallas sin perder fotografías ni registros.

## 8. Decisión tecnológica delegada a la IA desarrolladora

**Objetivo:** elegir el stack más apropiado para una experiencia principal excelente en **Android**, sin sacrificar la publicación y consulta de cuadernos por parte de **cualquier persona desde cualquier navegador y dispositivo**.

### Alternativas mínimas a evaluar

1. **Flutter Android + vista web pública** (recomendación inicial).
2. **PWA/web app mobile-first + vista web pública** con un solo stack web.
3. Solución híbrida adicional solo si demuestra una ventaja material, sin complejidad injustificada.

### Criterios de comparación

- Experiencia de galería y cámara, manejo de permisos, procesamiento/copia de fotos y lectura de EXIF.
- Funcionamiento confiable con conexión intermitente y cola de sincronización de fotografías.
- Compartir por hoja nativa de Android hacia Instagram/WhatsApp (y alternativas reales de navegador según compatibilidad).
- Experiencia visual, animaciones de páginas, rendimiento, estabilidad y accesibilidad.
- Complejidad de construcción y mantenimiento por una IA de desarrollo, velocidad hasta MVP y posibilidad de depurar.
- Distribución/instalación y actualizaciones: APK/instalación, Play Store o PWA.
- Costo y complejidad del sitio web público y posibilidad de reutilizar código.
- Seguridad, recuperación de datos, costos operativos y limitaciones de terceros.

### Entregable obligatorio de esta etapa

**Antes de programar**, la IA desarrolladora debe entregar una **matriz comparativa breve y fundamentada**, una **recomendación final de stack** y una **arquitectura propuesta**. Tiene libertad para decidir la tecnología; si su elección difiere de Flutter/Firebase debe explicar por qué cumple mejor los requisitos. **Las decisiones tecnológicas son suyas; las decisiones de producto y el alcance requieren aprobación si se modifican**.

## 9. Seguridad, privacidad y calidad

- Autenticación segura con Google y autorización mínima.
- Reglas de acceso que impidan que personas no autorizadas consulten o modifiquen cuadernos privados, imágenes o notas.
- Separar claramente rutas privadas de vistas públicas y preferir una representación explícita/sanitizada para compartir.
- Revocación efectiva de enlaces compartidos; considerar cachés, imágenes públicas indexables y URLs de archivos que pudieran permanecer válidas tras revocar. No tratar un enlace de almacenamiento permanente como mecanismo suficiente de revocación.
- No exponer tokens, claves de modelos ni secretos en el cliente Android/PWA.
- Eliminar GPS/EXIF y otros detalles sensibles de medios publicados cuando corresponda.
- Validar tamaños, formatos de archivo, errores de permisos, entradas inesperadas y límites de consumo.
- La IA debe informar dudas y no inventar especies o datos naturalistas. Diferenciar contenido educativo de identificación confirmada.
- Aplicación en español rioplatense, con mensajes breves, adecuados para una persona no técnica.

## 10. Pantallas o vistas mínimas

1. **Bienvenida / acceso con Google**.
2. **Onboarding y creación del primer cuaderno** (nombre, tipo, estilo, contexto opcional).
3. **Biblioteca de cuadernos** (jardín, viajes).
4. **Cuaderno abierto** (portada, índice y páginas de especies con estética artesanal).
5. **Agregar avistamiento** (galería/cámara, vista previa, fecha/ubicación sugeridas, nota).
6. **Identificación** (resultado, candidatas, incertidumbre, confirmar/corregir, pendiente).
7. **Ficha de especie** (ilustración, información breve, historial, fotos y notas).
8. **Pendientes de identificación o sincronización**.
9. **Compartir avistamiento** (vista previa y selector con/sin fotografía, formatos y destino).
10. **Compartir cuaderno** (activar, copiar enlace, abrir y revocar).
11. **Vista web pública del cuaderno** de solo lectura, adaptable a celular y escritorio.

La IA desarrolladora puede reorganizar las pantallas o combinarlas si mejora simplicidad sin eliminar funcionalidad.

## 11. Criterios de aceptación verificables (MVP)

- **CA01:** Valeria accede con Google, crea un cuaderno con uno de los dos estilos y ve la interfaz en español.
- **CA02:** Puede seleccionar una fotografía ya tomada **desde la galería**, sin tener que fotografiar desde la app; también puede sacar una foto nueva.
- **CA03:** Si hay fecha o GPS en EXIF, la app ofrece esos datos como sugerencia **editable y descartable**; si faltan, no inventa información.
- **CA04:** La app identifica una especie cuando tiene evidencia suficiente, comunica dudas cuando no la tiene y permite guardar avistamientos pendientes.
- **CA05:** Una especie confirmada incorpora una ilustración del estilo elegido, su nombre común/científico y datos educativos breves, sin necesidad de replicar la pose original.
- **CA06:** Un segundo hornero en el mismo cuaderno no crea por defecto otra ficha; ofrece añadir un nuevo avistamiento al historial.
- **CA07:** Valeria puede guardar y editar notas personales y consultar fotos originales de sus avistamientos.
- **CA08:** Puede pedir otra versión de una ilustración sin perder el avistamiento.
- **CA09:** Puede crear un cuaderno de viaje independiente y conservar su lugar general, fecha o período y observaciones.
- **CA10:** Sin conexión, puede conservar una foto como pendiente y subirla al recuperar internet. La app diferencia «local», «subiendo», «respaldado» y «error».
- **CA11:** Al cambiar de Android e iniciar sesión con Google, recupera todos los cuadernos, fichas, fotos, ilustraciones y notas respaldadas.
- **CA12:** Puede generar una pieza para redes **solo ilustración** o **ilustración más foto**, ambas con firma discreta, y compartirla usando las capacidades disponibles de Android.
- **CA13:** Puede generar un enlace de cuaderno y una persona sin cuenta puede abrirlo en un navegador móvil o de escritorio.
- **CA14:** El contenido compartido no expone dirección exacta, coordenadas, datos privados de cuenta ni EXIF sensibles.
- **CA15:** Al revocar un enlace, deja de servir para acceder a la vista del cuaderno compartida y a sus recursos protegidos.
- **CA16:** La app no expone claves de proveedores de IA y evita consumos duplicados innecesarios.
- **CA17:** La IA desarrolladora documenta y justifica su elección tecnológica antes de implementar.

## 12. Fuera de alcance del MVP

- Impresión y exportación del cuaderno a PDF.
- Comunidad/red social propia, seguidores, comentarios o perfiles públicos de múltiples personas.
- Rankings, puntos, recompensas, misiones diarias o competición.
- Marketplace, monetización, anuncios o suscripciones.
- Identificación y generación de ilustraciones sin conexión de forma integral.
- Gestión colaborativa avanzada de cuadernos o múltiples cuentas administradas.
- Geolocalización pública precisa de avistamientos.
- Clasificación de plantas/flores: influyen en la **estética** actual, no constituyen todavía un módulo funcional.

## 13. Secuencia recomendada de trabajo para la IA de desarrollo

1. **Revisión de producto:** detectar contradicciones y formular solo preguntas imprescindibles.
2. **Decisión tecnológica:** presentar matriz Flutter vs PWA y propuesta definitiva.
3. **Diseño técnico:** arquitectura, entidades, estados, modelo de sincronización, seguridad, costos y mecanismos de URLs compartidas revocables.
4. **Diseño de UX/UI:** pantallas, flujos y sistema visual botánico/artesanal; mostrar dos ejemplos de lámina (acuarela y grafito).
5. **Plan de implementación incremental:** hitos comprobables con pruebas y criterios de aceptación.
6. **Construcción y validación:** empezar por Google + cuadernos + carga de fotos + persistencia; incorporar luego IA, ilustraciones, historial y compartir; probar especialmente pérdidas de conexión y recuperación al cambiar de teléfono.

## 14. Cuestiones para resolver en diseño, sin bloquear la visión

La IA desarrolladora debe proponer una solución simple a estas cuestiones, indicando la opción recomendada antes de implementarla:

- Umbrales y presentación de la incertidumbre del identificador; forma de confirmar/corregir una especie.
- Contenido público por defecto en un cuaderno compartido: solo láminas y datos generales, o también fotos/notas con consentimiento explícito.
- Si las ilustraciones de una especie en dos cuadernos del mismo estilo se reutilizan directamente o se permite una alternativa por cuaderno.
- Cómo resolver correcciones taxonómicas y mezcla/separación de fichas ya creadas.
- Cuánto tiempo conservar archivos locales después del respaldo y cómo reintentar sin duplicados.
- Formatos exactos de exportación para historias y publicaciones y comportamiento cuando una app externa no acepte la intención de compartir.
- Qué controles mínimos de calidad taxonómica e ilustración pueden automatizarse y cuáles requieren confirmación de Valeria.

---

**Criterio rector:** ante una disyuntiva, priorizar que Valeria pueda fotografiar un ave con su celular, incorporarla sin fricción a un cuaderno hermoso, conservarla a largo plazo y compartir el descubrimiento sin revelar información privada. La tecnología está al servicio de esa experiencia y no a la inversa.
