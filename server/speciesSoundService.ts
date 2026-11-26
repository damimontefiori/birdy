import {
  fetchObjectFromR2,
  getCloudStorageStatus,
  parseCloudflareR2Config,
  resolveR2ObjectUrl,
  buildR2SignedRequest,
} from './cloudStorageService.ts';
import {
  resolveServerEnv,
  serverFetch,
  type ServerEnv,
  type ServerOrganismGroup,
} from './secureAiProxy.ts';

export interface SpeciesSoundTrack {
  /** URL lista para reproducir (vía /api/sound-proxy, /api/media o data:audio/mpeg) */
  audioUrl: string;
  mimeType: string;
  sourceLabel: string;
  attribution?: string;
  license?: string;
  recordedPlace?: string;
  isGenusFallback?: boolean;
  isAiGenerated?: boolean;
}

export interface SpeciesSoundLookupResult {
  status: 'available' | 'silent_species' | 'unavailable';
  scientificName: string;
  commonNameAr: string;
  acousticSummary: string;
  tracks: SpeciesSoundTrack[];
}

const ALLOWED_SOUND_PROXY_HOSTS = new Set([
  'static.inaturalist.org',
  'inaturalist-open-data.s3.amazonaws.com',
  'upload.wikimedia.org',
]);

export function isAllowedSoundProxyUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_SOUND_PROXY_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveElevenLabsApiKey(env: ServerEnv): string | undefined {
  const key = (env.ELEVEN_LABS_API_KEY || env.ELEVENLABS_API_KEY || '').trim();
  return key || undefined;
}

function slugifyScientific(sci: string): string {
  return sci
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export interface AcousticProfile {
  kind: 'vocal_bird' | 'buzzing_pollinator' | 'stridulating_insect' | 'vocal_amphibian_or_mammal' | 'gecko_chirp' | 'silent';
  silentExplanation?: string;
  elevenLabsPrompt?: string;
}

/**
 * Clasifica con rigor biológico si una especie emite sonidos audibles reales
 * (canto, reclamo, estridulación, zumbido de vuelo o croar) o si es naturalmente silenciosa,
 * evitando inventar sonidos artificiales o voces humanas.
 */
export function classifySpeciesAcousticProfile(params: {
  scientificName: string;
  commonNameAr: string;
  organismGroup?: ServerOrganismGroup;
}): AcousticProfile {
  const sci = params.scientificName.trim().toLowerCase();
  const common = params.commonNameAr.trim().toLowerCase();
  const group = params.organismGroup || 'aves';

  // 1. Mariposas y polillas: naturalmente silenciosas al oído humano
  if (group === 'mariposas' || /\b(mariposa|espejitos|monarca|limonera)\b/.test(common)) {
    return {
      kind: 'silent',
      silentExplanation:
        'Las mariposas son especies silenciosas: no emiten canto ni estridulación; solo producen un sutil batir de alas en silencio.',
    };
  }

  // 2. Arañas, caracoles, lombrices, vaquitas de San Antonio, hormigas, mantis: silenciosos
  if (
    /\b(argiope|pholcus|lycosa|latrodectus|kukulcania|grammostola|cornu|helix|lumbricus|eriopis|coccinella|harmonia|coptopteryx|mantis|acromyrmex|atta|camponotus)\b/.test(
      sci
    ) ||
    /\b(araña|caracol|babosa|lombriz|vaquita|mariquita|mamboreta|mantis|hormiga|bicho bolita|cochinilla)\b/.test(
      common
    )
  ) {
    return {
      kind: 'silent',
      silentExplanation:
        'Este habitante del jardín es silencioso al oído humano y se comunica principalmente mediante vibraciones sutiles o señales químicas.',
    };
  }

  // 3. Aves (prioridad principal): todas tienen canto o llamado característico
  if (group === 'aves') {
    const isOwl = /\b(athene|glaucidium|tyto|megascops|asio|bubo)\b/.test(sci) || /\b(lechucita|lechuza|cabure|alicucu)\b/.test(common);
    const isDove = /\b(zenaida|patagioenas|columbina|leptotila)\b/.test(sci) || /\b(torcaza|paloma|torcacita|yeruti)\b/.test(common);
    const isHummingbird = /\b(chlorostilbon|hylocharis|sappho|amazilia|colibri|sepphanoides)\b/.test(sci) || /\b(picaflor|colibri)\b/.test(common);

    let callDesc = 'clear melodic South American garden songbird chirping and whistling phrases perched on a tree branch';
    if (isOwl) {
      callDesc = 'authentic nocturnal small owl soft rhythmic hooting and trilling call in a quiet garden night';
    } else if (isDove) {
      callDesc = 'gentle warm rhythmic dove cooing call perched in a quiet garden tree';
    } else if (isHummingbird) {
      callDesc = 'rapid high-pitched delicate hummingbird metallic chirps and fast soft humming wings near garden flowers';
    }

    return {
      kind: 'vocal_bird',
      elevenLabsPrompt: `${callDesc} (${params.scientificName}). Pure isolated natural ornithological wildlife field recording outdoors with subtle quiet air ambience. Strictly NO human voice, NO speech, NO talking, NO music, NO instruments.`,
    };
  }

  // 4. Abejas, abejorros y sírfidos: zumbido característico de polinización
  if (
    group === 'abejas_abejorros' ||
    /\b(bombus|xylocopa|apis|megachile|augocloropsis|eristalinus|allograpta|polistes|polybia)\b/.test(sci) ||
    /\b(abeja|abejorro|manganga|mosca de las flores|avispa)\b/.test(common)
  ) {
    const isCarpenterOrBumble = /\b(bombus|xylocopa)\b/.test(sci) || /\b(abejorro|manganga)\b/.test(common);
    return {
      kind: 'buzzing_pollinator',
      elevenLabsPrompt: isCarpenterOrBumble
        ? 'Close-up natural field recording of a single large bumblebee deep resonant low-frequency wing buzzing while hovering from flower to flower in a calm garden. Strictly NO human voice, NO speech, NO music.'
        : 'Close-up natural field recording of a single honeybee gentle steady wing buzzing while pollinating garden blossoms outdoors. Strictly NO human voice, NO speech, NO music.',
    };
  }

  // 5. Insectos sonoros: grillos, chicharras/cigarras, langostas/saltamontes, escarabajos zumbadores
  if (
    /\b(gryllus|acheta|miogryllus|anurogryllus|scapteriscus|quesada|fidicina|dorisia|carineta|tettigonia|conocephalus|chromacris|schistocerca|tropidacris|diloboderus)\b/.test(
      sci
    ) ||
    /\b(grillo|chicharra|cigarra|langosta|saltamontes|tucura|grillo topo)\b/.test(common)
  ) {
    const isCicada = /\b(quesada|fidicina|dorisia|carineta)\b/.test(sci) || /\b(chicharra|cigarra)\b/.test(common);
    return {
      kind: 'stridulating_insect',
      elevenLabsPrompt: isCicada
        ? 'Authentic natural summer cicada rhythmic high-frequency tymbal buzzing song in a tree canopy outdoors. Strictly NO human voice, NO speech, NO music.'
        : 'Authentic natural field cricket clear rhythmic evening chirping stridulation in garden grass. Strictly NO human voice, NO speech, NO music.',
    };
  }

  // 6. Anfibios (sapos y ranas)
  if (
    /\b(rhinella|scinax|boana|leptodactylus|odontophrynus|physalaemus|ceratophrys)\b/.test(sci) ||
    /\b(sapo|rana|ranita|escuerzo)\b/.test(common)
  ) {
    return {
      kind: 'vocal_amphibian_or_mammal',
      elevenLabsPrompt:
        'Authentic natural South American garden toad rhythmic low vibrant trill and croaking call near damp foliage at dusk. Strictly NO human voice, NO speech, NO music.',
    };
  }

  // 7. Gecos y salamanquesas (emiten pequeños chasquidos nocturnos)
  if (/\b(homonota|hemidactylus|tarentola)\b/.test(sci) || /\b(geco|salamanquesa)\b/.test(common)) {
    return {
      kind: 'gecko_chirp',
      elevenLabsPrompt:
        'Subtle quiet close-up natural nocturnal house gecko soft short clicking chirps (3 delicate tiny reptile clicks) in a calm quiet night. Strictly NO human voice, NO speech, NO music.',
    };
  }

  // 8. Lagartijas diurnas (Teius, Salvator, Tropidurus) o coleópteros pequeños sin canto conocido
  if (group === 'insectos_aracnidos' || /\b(lagartija|overo|iguana|tortuga)\b/.test(common)) {
    return {
      kind: 'silent',
      silentExplanation:
        'Esta especie no posee un canto o vocalización habitual perceptible en el jardín.',
    };
  }

  return {
    kind: 'vocal_amphibian_or_mammal',
    elevenLabsPrompt: `Authentic natural quiet wildlife acoustic sound of ${params.scientificName} in a calm outdoor garden, strictly natural animal call ONLY, NO human voice, NO speech, NO music.`,
  };
}

function scoreAudioFormat(url: string, mime?: string): number {
  const lower = `${url} ${mime || ''}`.toLowerCase();
  if (lower.includes('.mp3') || lower.includes('audio/mpeg')) return 0;
  if (lower.includes('.m4a') || lower.includes('audio/mp4') || lower.includes('audio/x-m4a')) return 1;
  if (lower.includes('.wav') || lower.includes('audio/wav') || lower.includes('audio/x-wav')) return 2;
  if (lower.includes('.ogg') || lower.includes('audio/ogg') || lower.includes('application/ogg')) return 3;
  return 4;
}

function inferAudioMime(url: string, reportedMime?: string): string {
  if (reportedMime && reportedMime.startsWith('audio/')) return reportedMime;
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.mp3')) return 'audio/mpeg';
  if (clean.endsWith('.m4a') || clean.endsWith('.mp4')) return 'audio/mp4';
  if (clean.endsWith('.wav')) return 'audio/wav';
  if (clean.endsWith('.ogg') || clean.endsWith('.oga')) return 'audio/ogg';
  return 'audio/mpeg';
}

async function fetchINaturalistSoundsForTaxon(
  taxonName: string,
  preferSouthAmerica: boolean,
  isGenusFallback = false
): Promise<SpeciesSoundTrack[]> {
  const placeParam = preferSouthAmerica ? '&place_id=97392' : '';
  const url = `https://api.inaturalist.org/v1/observations?taxon_name=${encodeURIComponent(
    taxonName
  )}&sounds=true&quality_grade=research&per_page=10${placeParam}`;

  try {
    const res = await serverFetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'BiomaCuadernoVivo/1.0' },
      signal: AbortSignal.timeout(8500),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      results?: Array<{
        place_guess?: string;
        user?: { name?: string; login?: string };
        sounds?: Array<{
          file_url?: string;
          file_content_type?: string;
          attribution?: string;
          license_code?: string;
        }>;
      }>;
    };

    const candidates: Array<SpeciesSoundTrack & { rank: number }> = [];
    const seenUrls = new Set<string>();

    for (const obs of json.results || []) {
      for (const snd of obs.sounds || []) {
        const rawUrl = (snd.file_url || '').trim();
        if (!rawUrl || !isAllowedSoundProxyUrl(rawUrl)) continue;
        const baseKey = rawUrl.split('?')[0];
        if (seenUrls.has(baseKey)) continue;
        seenUrls.add(baseKey);

        const author = obs.user?.name || obs.user?.login || '';
        const attribution =
          snd.attribution || (author ? `Grabación por ${author} (iNaturalist)` : 'iNaturalist');

        candidates.push({
          audioUrl: `/api/sound-proxy?url=${encodeURIComponent(rawUrl)}`,
          mimeType: inferAudioMime(rawUrl, snd.file_content_type),
          sourceLabel: isGenusFallback
            ? `Grabación real de campo (género ${taxonName} · iNaturalist)`
            : 'Grabación real de campo · iNaturalist',
          attribution,
          license: snd.license_code ? snd.license_code.toUpperCase() : undefined,
          recordedPlace: obs.place_guess || undefined,
          isGenusFallback: isGenusFallback || undefined,
          rank: scoreAudioFormat(rawUrl, snd.file_content_type),
        });
      }
    }

    candidates.sort((a, b) => a.rank - b.rank);
    return candidates.slice(0, 2).map(({ rank: _r, ...track }) => track);
  } catch {
    return [];
  }
}

async function fetchWikimediaCommonsSounds(scientificName: string): Promise<SpeciesSoundTrack[]> {
  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    `filetype:audio "${scientificName}"`
  )}&gsrlimit=6&prop=imageinfo&iiprop=url|mime|extmetadata&format=json`;

  try {
    const res = await serverFetch(apiUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'BiomaCuadernoVivo/1.0' },
      signal: AbortSignal.timeout(8500),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: Array<{
              url?: string;
              mime?: string;
              extmetadata?: {
                Artist?: { value?: string };
                LicenseShortName?: { value?: string };
              };
            }>;
          }
        >;
      };
    };

    const candidates: Array<SpeciesSoundTrack & { rank: number }> = [];
    for (const page of Object.values(json.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      const rawUrl = (info?.url || '').trim();
      if (!rawUrl || !isAllowedSoundProxyUrl(rawUrl)) continue;
      const mime = info?.mime || '';
      if (!mime.includes('audio') && !mime.includes('ogg')) continue;

      const isXenoCanto = /XC\d+/i.test(page.title || '');
      const rawArtist = (info?.extmetadata?.Artist?.value || '')
        .replace(/<[^>]+>/g, '')
        .trim();
      const license = (info?.extmetadata?.LicenseShortName?.value || '').trim();

      candidates.push({
        audioUrl: `/api/sound-proxy?url=${encodeURIComponent(rawUrl)}`,
        mimeType: inferAudioMime(rawUrl, mime),
        sourceLabel: isXenoCanto
          ? 'Grabación real Xeno-canto · Wikimedia Commons'
          : 'Grabación real · Wikimedia Commons',
        attribution: rawArtist ? `Grabación: ${rawArtist}` : 'Archivo sonoro Wikimedia Commons',
        license: license || undefined,
        rank: scoreAudioFormat(rawUrl, mime) - (isXenoCanto ? 0.2 : 0),
      });
    }

    candidates.sort((a, b) => a.rank - b.rank);
    return candidates.slice(0, 2).map(({ rank: _r, ...track }) => track);
  } catch {
    return [];
  }
}

async function uploadAudioBufferToPublicR2(
  slug: string,
  buffer: Buffer,
  env: ServerEnv
): Promise<string | null> {
  const config = parseCloudflareR2Config(env);
  if (!config) return null;

  const key = `public/sounds/elevenlabs_${slug}.mp3`;
  const signed = buildR2SignedRequest({
    method: 'PUT',
    key,
    body: buffer,
    contentType: 'audio/mpeg',
    cacheControl: 'public, max-age=31536000, immutable',
    config,
  });

  const res = await serverFetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: buffer,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  return resolveR2ObjectUrl(key, config);
}

async function generateOrLoadElevenLabsSoundTrack(params: {
  scientificName: string;
  prompt: string;
  env: ServerEnv;
}): Promise<SpeciesSoundTrack | null> {
  const apiKey = resolveElevenLabsApiKey(params.env);
  if (!apiKey) return null;

  const slug = slugifyScientific(params.scientificName);
  const r2Status = getCloudStorageStatus(params.env);
  const r2Key = `public/sounds/elevenlabs_${slug}.mp3`;

  // 1. Si ya se generó antes y quedó guardado en Cloudflare R2, reutilizar sin gastar créditos
  if (r2Status.r2BucketConfigured) {
    try {
      const cachedR2 = await fetchObjectFromR2(r2Key, params.env);
      if (cachedR2 && cachedR2.buffer.length > 500) {
        const cfg = parseCloudflareR2Config(params.env);
        return {
          audioUrl: cfg ? resolveR2ObjectUrl(r2Key, cfg) : `/api/media/${r2Key}`,
          mimeType: 'audio/mpeg',
          sourceLabel: 'Recreación bioacústica IA · ElevenLabs',
          attribution: 'Síntesis acústica naturalista sin voz humana (respaldo cuando no hay grabación de campo)',
          isAiGenerated: true,
        };
      }
    } catch {
      // continuar a generación
    }
  }

  // 2. Generar efecto bioacústico aislado con ElevenLabs Sound Generation API
  try {
    const res = await serverFetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: params.prompt,
        duration_seconds: 5,
        prompt_influence: 0.78,
      }),
      signal: AbortSignal.timeout(22000),
    });

    if (!res.ok) {
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 500) return null;

    if (r2Status.r2BucketConfigured) {
      try {
        const r2Url = await uploadAudioBufferToPublicR2(slug, buffer, params.env);
        if (r2Url) {
          return {
            audioUrl: r2Url,
            mimeType: 'audio/mpeg',
            sourceLabel: 'Recreación bioacústica IA · ElevenLabs',
            attribution: 'Síntesis acústica naturalista (guardada en Cloudflare R2)',
            isAiGenerated: true,
          };
        }
      } catch {
        // continuar con data URL
      }
    }

    return {
      audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
      mimeType: 'audio/mpeg',
      sourceLabel: 'Recreación bioacústica IA · ElevenLabs',
      attribution: 'Síntesis acústica naturalista sin voz humana',
      isAiGenerated: true,
    };
  } catch {
    return null;
  }
}

const soundLookupCache = new Map<string, { expiresAt: number; result: SpeciesSoundLookupResult }>();
const SOUND_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 horas

/**
 * Obtiene el sonido de una especie priorizando SIEMPRE grabaciones científicas reales de campo:
 * 1) iNaturalist Research-Grade (priorizando Sudamérica y formatos universales MP3/M4A)
 * 2) Wikimedia Commons / archivo abierto Xeno-canto
 * 3) Grabación real del mismo género taxonómico (para abejorros, abejas, grillos o anfibios cercanos)
 * 4) ElevenLabs Sound Effects (con prompt bioacústico estricto sin voces humanas + caché permanente en R2)
 * Y declara honestamente cuando una especie es naturalmente silenciosa (ej.: mariposas, arañas, caracoles).
 */
export async function resolveSpeciesSound(
  params: {
    scientificName: string;
    commonNameAr: string;
    organismGroup?: ServerOrganismGroup;
  },
  env: ServerEnv = resolveServerEnv()
): Promise<SpeciesSoundLookupResult> {
  const cleanSci = params.scientificName.trim();
  const cleanCommon = params.commonNameAr.trim() || cleanSci;
  const cacheKey = `${cleanSci.toLowerCase()}|${params.organismGroup || ''}`;

  const cached = soundLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const profile = classifySpeciesAcousticProfile(params);
  if (profile.kind === 'silent') {
    const silentRes: SpeciesSoundLookupResult = {
      status: 'silent_species',
      scientificName: cleanSci,
      commonNameAr: cleanCommon,
      acousticSummary:
        profile.silentExplanation ||
        'Esta especie es naturalmente silenciosa y no posee canto ni estridulación.',
      tracks: [],
    };
    soundLookupCache.set(cacheKey, { expiresAt: Date.now() + SOUND_CACHE_TTL_MS, result: silentRes });
    return silentRes;
  }

  // Nivel 1: Grabación científica real en Sudamérica (iNaturalist Research Grade) + Wikimedia Commons en paralelo
  const [southAmericaTracks, wikimediaTracks] = await Promise.all([
    fetchINaturalistSoundsForTaxon(cleanSci, true, false),
    fetchWikimediaCommonsSounds(cleanSci),
  ]);

  let tracks: SpeciesSoundTrack[] = [...southAmericaTracks];
  if (tracks.length < 2 && wikimediaTracks.length > 0) {
    for (const wt of wikimediaTracks) {
      if (tracks.length < 2) tracks.push(wt);
    }
  }

  // Nivel 1B: Si no hubo grabación en Sudamérica, buscar grabación real global de la misma especie en iNaturalist
  if (tracks.length === 0) {
    const globalTracks = await fetchINaturalistSoundsForTaxon(cleanSci, false, false);
    tracks.push(...globalTracks);
  }

  // Nivel 3: Para abejas/abejorros, insectos estriduladores y anfibios sin audio exacto, buscar en su mismo género
  if (
    tracks.length === 0 &&
    (profile.kind === 'buzzing_pollinator' ||
      profile.kind === 'stridulating_insect' ||
      profile.kind === 'vocal_amphibian_or_mammal')
  ) {
    const genus = cleanSci.split(/\s+/)[0] || '';
    if (genus.length >= 3 && genus.toLowerCase() !== cleanSci.toLowerCase()) {
      const genusTracks = await fetchINaturalistSoundsForTaxon(genus, false, true);
      tracks.push(...genusTracks.slice(0, 1));
    }
  }

  // Nivel 4: Respaldo bioacústico controlado con ElevenLabs (cacheado en Cloudflare R2)
  if (tracks.length === 0 && profile.elevenLabsPrompt) {
    const aiTrack = await generateOrLoadElevenLabsSoundTrack({
      scientificName: cleanSci,
      prompt: profile.elevenLabsPrompt,
      env,
    });
    if (aiTrack) {
      tracks.push(aiTrack);
    }
  }

  const finalResult: SpeciesSoundLookupResult =
    tracks.length > 0
      ? {
          status: 'available',
          scientificName: cleanSci,
          commonNameAr: cleanCommon,
          acousticSummary: tracks[0].isAiGenerated
            ? 'Recreación bioacústica naturalista (no se hallaron grabaciones abiertas de esta especie).'
            : tracks[0].isGenusFallback
              ? `Grabación acústica real de campo de un representante del género ${cleanSci.split(/\s+/)[0]}.`
              : profile.kind === 'vocal_bird'
                ? 'Canto y vocalización real registrada en la naturaleza.'
                : profile.kind === 'buzzing_pollinator'
                  ? 'Zumbido real de vuelo y polinización registrado en campo.'
                  : 'Sonido natural real registrado en el campo.',
          tracks,
        }
      : {
          status: 'unavailable',
          scientificName: cleanSci,
          commonNameAr: cleanCommon,
          acousticSummary:
            'Todavía no hay una grabación sonora disponible para esta especie en los archivos abiertos.',
          tracks: [],
        };

  if (finalResult.status === 'available') {
    soundLookupCache.set(cacheKey, {
      expiresAt: Date.now() + SOUND_CACHE_TTL_MS,
      result: finalResult,
    });
  }

  return finalResult;
}
