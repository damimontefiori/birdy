import crypto from 'node:crypto';
import { resolveServerEnv, serverFetch, type ServerEnv } from './secureAiProxy.ts';

/**
 * Servicio real de persistencia en la nube para Bioma:
 * 1) Google Cloud Firestore (REST API v1 con Service Account JWT RS256) para cuadernos,
 *    láminas, avistamientos, especies descubiertas y enlaces públicos compartidos.
 * 2) Cloudflare R2 (API S3 con AWS Signature V4 puro en Node.js) para almacenar
 *    fotografías sanitizadas (sin EXIF) e ilustraciones IA como objetos binarios reales.
 *
 * Sin dependencias pesadas adicionales: usa únicamente `node:crypto` + `serverFetch`.
 */

export interface CloudStorageStatus {
  firestoreConfigured: boolean;
  r2BucketConfigured: boolean;
  r2PublicUrlConfigured: boolean;
  firestoreProjectId: string | null;
  r2BucketName: string | null;
}

interface ParsedFirebaseServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface ParsedR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

// Caché de token OAuth2 de Google para Firestore (validez ~55 min)
let cachedFirestoreToken: {
  cacheKey: string;
  accessToken: string;
  expiresAt: number;
} | null = null;

export function parseFirebaseServiceAccount(
  env: ServerEnv = resolveServerEnv()
): ParsedFirebaseServiceAccount | null {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      let raw = env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
      if (!raw.startsWith('{')) {
        raw = Buffer.from(raw, 'base64').toString('utf-8');
      }
      const parsed = JSON.parse(raw) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id.trim(),
          clientEmail: parsed.client_email.trim(),
          privateKey: parsed.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch {
      // Continuar con variables individuales
    }
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID.trim(),
      clientEmail: env.FIREBASE_CLIENT_EMAIL.trim(),
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

export function parseCloudflareR2Config(
  env: ServerEnv = resolveServerEnv()
): ParsedR2Config | null {
  const accountId = (env.CLOUDFLARE_R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const accessKeyId = (env.CLOUDFLARE_R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = (env.CLOUDFLARE_R2_BUCKET_NAME || '').trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }
  const publicUrl = env.CLOUDFLARE_R2_PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl,
  };
}

export function getCloudStorageStatus(env: ServerEnv = resolveServerEnv()): CloudStorageStatus {
  const fb = parseFirebaseServiceAccount(env);
  const r2 = parseCloudflareR2Config(env);
  return {
    firestoreConfigured: Boolean(fb),
    r2BucketConfigured: Boolean(r2),
    r2PublicUrlConfigured: Boolean(r2?.publicUrl),
    firestoreProjectId: fb?.projectId || null,
    r2BucketName: r2?.bucketName || null,
  };
}

// ============================================================================
// 1. CLOUDFLARE R2 (AWS Signature V4 — S3 compatible)
// ============================================================================

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function encodeRfc3986Path(rawPath: string): string {
  return rawPath
    .split('/')
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/');
}

export function buildR2SignedRequest(params: {
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  key: string;
  body?: Buffer;
  contentType?: string;
  cacheControl?: string;
  config: ParsedR2Config;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const { method, key, config } = params;
  const body = params.body ?? Buffer.alloc(0);
  const now = params.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const cleanKey = key.replace(/^\/+/, '');
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986Path(config.bucketName)}/${encodeRfc3986Path(cleanKey)}`;
  const payloadHash = sha256Hex(body);

  const canonicalHeadersObj: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (params.contentType) {
    canonicalHeadersObj['content-type'] = params.contentType;
  }
  if (params.cacheControl) {
    canonicalHeadersObj['cache-control'] = params.cacheControl;
  }

  const sortedKeys = Object.keys(canonicalHeadersObj).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${canonicalHeadersObj[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (params.contentType) headers['Content-Type'] = params.contentType;
  if (params.cacheControl) headers['Cache-Control'] = params.cacheControl;

  return {
    url: `https://${host}${canonicalUri}`,
    headers,
  };
}

export function isValidMediaObjectKey(key: string): boolean {
  const clean = key.replace(/^\/+/, '');
  if (!clean || clean.length > 320) return false;
  if (clean.includes('..') || clean.includes('\\')) return false;
  return /^[a-zA-Z0-9/_\-.]+$/.test(clean);
}

export function resolveR2ObjectUrl(key: string, config: ParsedR2Config): string {
  const cleanKey = key.replace(/^\/+/, '');
  if (config.publicUrl) {
    return `${config.publicUrl}/${cleanKey}`;
  }
  return `/api/media/${cleanKey}`;
}

export function parseBinaryImageDataUrl(
  dataUrl: string
): { mimeType: string; ext: string; buffer: Buffer } | null {
  const match = /^data:(image\/(jpeg|jpg|png|webp|gif));base64,(.+)$/is.exec(dataUrl.trim());
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : 'jpg';
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length === 0) return null;
  return { mimeType, ext, buffer };
}

export async function uploadDataUrlToR2(params: {
  keyPrefix: string;
  dataUrl: string;
  env?: ServerEnv;
}): Promise<{ url: string; key: string } | null> {
  const config = parseCloudflareR2Config(params.env);
  if (!config) return null;

  const parsed = parseBinaryImageDataUrl(params.dataUrl);
  if (!parsed) return null;

  const cleanPrefix = params.keyPrefix.replace(/^\/+/, '').replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
  const key = `${cleanPrefix}.${parsed.ext}`;
  if (!isValidMediaObjectKey(key)) return null;

  const signed = buildR2SignedRequest({
    method: 'PUT',
    key,
    body: parsed.buffer,
    contentType: parsed.mimeType,
    cacheControl: 'public, max-age=31536000, immutable',
    config,
  });

  const res = await serverFetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: parsed.buffer,
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`R2_UPLOAD_FAILED (${res.status}): ${errText.slice(0, 180)}`);
  }

  return {
    key,
    url: resolveR2ObjectUrl(key, config),
  };
}

export async function fetchObjectFromR2(
  key: string,
  env: ServerEnv = resolveServerEnv()
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const config = parseCloudflareR2Config(env);
  if (!config || !isValidMediaObjectKey(key)) return null;

  const signed = buildR2SignedRequest({
    method: 'GET',
    key,
    config,
  });

  const res = await serverFetch(signed.url, {
    method: 'GET',
    headers: signed.headers,
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`R2_FETCH_FAILED (${res.status})`);
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

// ============================================================================
// 2. GOOGLE CLOUD FIRESTORE (REST API v1 con Service Account JWT)
// ============================================================================

async function getFirestoreAccessToken(sa: ParsedFirebaseServiceAccount): Promise<string> {
  const cacheKey = `${sa.projectId}:${sa.clientEmail}`;
  if (
    cachedFirestoreToken &&
    cachedFirestoreToken.cacheKey === cacheKey &&
    cachedFirestoreToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedFirestoreToken.accessToken;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  ).toString('base64url');

  const signingInput = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(sa.privateKey).toString('base64url');
  const assertion = `${signingInput}.${signature}`;

  const tokenRes = await serverFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(12000),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error(`FIRESTORE_AUTH_FAILED (${tokenRes.status}): ${errText.slice(0, 180)}`);
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
  if (!tokenJson.access_token) {
    throw new Error('FIRESTORE_AUTH_MISSING_TOKEN');
  }

  cachedFirestoreToken = {
    cacheKey,
    accessToken: tokenJson.access_token,
    expiresAt: Date.now() + (tokenJson.expires_in || 3600) * 1000,
  };
  return tokenJson.access_token;
}

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export function jsToFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    if (Number.isInteger(val) && Math.abs(val) <= Number.MAX_SAFE_INTEGER) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((v) => v !== undefined).map((v) => jsToFirestoreValue(v)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = jsToFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function firestoreValueToJs(val: Record<string, unknown> | undefined): unknown {
  if (!val || typeof val !== 'object') return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = (val.arrayValue as { values?: Array<Record<string, unknown>> })?.values || [];
    return arr.map((item) => firestoreValueToJs(item));
  }
  if ('mapValue' in val) {
    const fields = (val.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = firestoreValueToJs(v);
    }
    return out;
  }
  return undefined;
}

function encodeDocFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = jsToFirestoreValue(v);
    }
  }
  return fields;
}

function decodeDocFields(doc: { fields?: Record<string, Record<string, unknown>> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    out[k] = firestoreValueToJs(v);
  }
  return out;
}

function sanitizeDocId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_.\-:]/g, '_').slice(0, 180) || `doc_${Date.now()}`;
}

function firestoreDocsBase(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/(default)/documents`;
}

async function listFirestoreCollection(
  sa: ParsedFirebaseServiceAccount,
  accessToken: string,
  collectionPath: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const results: Array<{ id: string; data: Record<string, unknown> }> = [];
  let pageToken = '';

  do {
    const url = `${firestoreDocsBase(sa.projectId)}/${collectionPath}?pageSize=300${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;
    const res = await serverFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 404) {
      return [];
    }
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`FIRESTORE_LIST_FAILED (${res.status}): ${errTxt.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      documents?: Array<{ name: string; fields?: Record<string, Record<string, unknown>> }>;
      nextPageToken?: string;
    };
    for (const doc of json.documents || []) {
      const id = doc.name.split('/').pop() || '';
      results.push({ id, data: decodeDocFields(doc) });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);

  return results;
}

async function commitFirestoreWrites(
  sa: ParsedFirebaseServiceAccount,
  accessToken: string,
  writes: Array<Record<string, unknown>>
): Promise<void> {
  if (writes.length === 0) return;

  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    sa.projectId
  )}/databases/(default)/documents:commit`;

  // Firestore admite hasta 500 operaciones por commit; dividimos en lotes seguros de 350
  for (let i = 0; i < writes.length; i += 350) {
    const chunk = writes.slice(i, i + 350);
    const res = await serverFetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: chunk }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`FIRESTORE_COMMIT_FAILED (${res.status}): ${errTxt.slice(0, 220)}`);
    }
  }
}

export interface CloudSyncStatePayload {
  notebooks: Array<Record<string, unknown>>;
  sheets: Array<Record<string, unknown>>;
  sightings: Array<Record<string, unknown>>;
  illustrations: Array<Record<string, unknown>>;
  customSpecies?: Array<Record<string, unknown>>;
  fullSync?: boolean;
}

export interface LoadedCloudState {
  uid: string;
  updatedAt: string | null;
  notebooks: Array<Record<string, unknown>>;
  sheets: Array<Record<string, unknown>>;
  sightings: Array<Record<string, unknown>>;
  illustrations: Array<Record<string, unknown>>;
  customSpecies: Array<Record<string, unknown>>;
}

export async function loadUserCloudStateFromFirestore(
  uid: string,
  env: ServerEnv = resolveServerEnv()
): Promise<LoadedCloudState | null> {
  const sa = parseFirebaseServiceAccount(env);
  if (!sa) return null;

  const token = await getFirestoreAccessToken(sa);
  const safeUid = encodeURIComponent(sanitizeDocId(uid));

  const [notebooks, sheets, sightings, illustrations, customSpecies] = await Promise.all([
    listFirestoreCollection(sa, token, `users/${safeUid}/notebooks`),
    listFirestoreCollection(sa, token, `users/${safeUid}/sheets`),
    listFirestoreCollection(sa, token, `users/${safeUid}/sightings`),
    listFirestoreCollection(sa, token, `users/${safeUid}/illustrations`),
    listFirestoreCollection(sa, token, `users/${safeUid}/custom_species`),
  ]);

  const allUpdatedAts = [
    ...notebooks.map((d) => String(d.data.updatedAt || '')),
    ...sightings.map((d) => String(d.data.updatedAt || '')),
    ...sheets.map((d) => String(d.data.updatedAt || '')),
  ].filter(Boolean);
  allUpdatedAts.sort();

  return {
    uid,
    updatedAt: allUpdatedAts[allUpdatedAts.length - 1] || null,
    notebooks: notebooks.map((d) => d.data),
    sheets: sheets.map((d) => d.data),
    sightings: sightings.map((d) => d.data),
    illustrations: illustrations.map((d) => d.data),
    customSpecies: customSpecies.map((d) => d.data),
  };
}

export async function syncUserStateToCloud(
  uid: string,
  payload: CloudSyncStatePayload,
  env: ServerEnv = resolveServerEnv()
): Promise<{
  syncedAt: string;
  firestoreSynced: boolean;
  r2UploadedCount: number;
  sightingPhotoUrls: Record<string, string>;
  illustrationUrls: Record<string, string>;
}> {
  const sa = parseFirebaseServiceAccount(env);
  const r2 = parseCloudflareR2Config(env);
  if (!sa && !r2) {
    throw new Error('CLOUD_STORAGE_NOT_CONFIGURED');
  }

  const safeUid = sanitizeDocId(uid);
  const sightingPhotoUrls: Record<string, string> = {};
  const illustrationUrls: Record<string, string> = {};
  let r2UploadedCount = 0;

  // 1. Subir binarios nuevos (data:image/...) a Cloudflare R2 antes de escribir metadata en Firestore
  const processedSightings = await Promise.all(
    (payload.sightings || []).map(async (raw) => {
      const s = { ...raw };
      const id = sanitizeDocId(String(s.id || ''));
      const photoUrl = typeof s.sanitizedPhotoDataUrl === 'string' ? s.sanitizedPhotoDataUrl : '';
      if (r2 && id && photoUrl.startsWith('data:image/') && !photoUrl.startsWith('data:image/svg')) {
        const uploaded = await uploadDataUrlToR2({
          keyPrefix: `users/${safeUid}/photos/${id}`,
          dataUrl: photoUrl,
          env,
        });
        if (uploaded) {
          s.sanitizedPhotoDataUrl = uploaded.url;
          sightingPhotoUrls[String(s.id)] = uploaded.url;
          r2UploadedCount += 1;
        }
      }
      s.syncStatus = 'respaldado';
      return s;
    })
  );

  const processedIllustrations = await Promise.all(
    (payload.illustrations || []).map(async (raw) => {
      const ill = { ...raw };
      const id = sanitizeDocId(String(ill.id || ''));
      const imgUrl = typeof ill.imageUrl === 'string' ? ill.imageUrl : '';
      if (
        r2 &&
        id &&
        !ill.isPendingAi &&
        imgUrl.startsWith('data:image/') &&
        !imgUrl.startsWith('data:image/svg')
      ) {
        const uploaded = await uploadDataUrlToR2({
          keyPrefix: `users/${safeUid}/illustrations/${id}`,
          dataUrl: imgUrl,
          env,
        });
        if (uploaded) {
          ill.imageUrl = uploaded.url;
          illustrationUrls[String(ill.id)] = uploaded.url;
          r2UploadedCount += 1;
        }
      }
      return ill;
    })
  );

  const syncedAt = new Date().toISOString();

  // 2. Persistir colecciones estructuradas en Google Cloud Firestore
  if (sa) {
    const token = await getFirestoreAccessToken(sa);
    const dbRoot = `projects/${sa.projectId}/databases/(default)/documents`;
    const writes: Array<Record<string, unknown>> = [];

    const addUpserts = (
      subcollection: string,
      items: Array<Record<string, unknown>>,
      idField: string
    ) => {
      const currentIds = new Set<string>();
      for (const item of items) {
        const rawId = String(item[idField] || '');
        if (!rawId) continue;
        const docId = sanitizeDocId(rawId);
        currentIds.add(docId);
        writes.push({
          update: {
            name: `${dbRoot}/users/${safeUid}/${subcollection}/${docId}`,
            fields: encodeDocFields(item),
          },
        });
      }
      return currentIds;
    };

    const notebooksMarked = (payload.notebooks || []).map((nb) => ({
      ...nb,
      syncStatus: 'respaldado',
    }));

    const nbIds = addUpserts('notebooks', notebooksMarked, 'id');
    const shIds = addUpserts('sheets', payload.sheets || [], 'id');
    const siIds = addUpserts('sightings', processedSightings, 'id');
    const illIds = addUpserts('illustrations', processedIllustrations, 'id');
    addUpserts('custom_species', payload.customSpecies || [], 'taxonId');

    // En fullSync, eliminar de Firestore documentos que la usuaria borró localmente
    if (payload.fullSync) {
      const [existingNbs, existingSheets, existingSightings, existingIlls] = await Promise.all([
        listFirestoreCollection(sa, token, `users/${encodeURIComponent(safeUid)}/notebooks`),
        listFirestoreCollection(sa, token, `users/${encodeURIComponent(safeUid)}/sheets`),
        listFirestoreCollection(sa, token, `users/${encodeURIComponent(safeUid)}/sightings`),
        listFirestoreCollection(sa, token, `users/${encodeURIComponent(safeUid)}/illustrations`),
      ]);

      const queueDeletes = (
        subcollection: string,
        existing: Array<{ id: string }>,
        keepIds: Set<string>
      ) => {
        for (const doc of existing) {
          if (!keepIds.has(doc.id)) {
            writes.push({
              delete: `${dbRoot}/users/${safeUid}/${subcollection}/${doc.id}`,
            });
          }
        }
      };

      queueDeletes('notebooks', existingNbs, nbIds);
      queueDeletes('sheets', existingSheets, shIds);
      queueDeletes('sightings', existingSightings, siIds);
      queueDeletes('illustrations', existingIlls, illIds);
    }

    // Guardar marca de última sincronización en el perfil raíz del usuario
    writes.push({
      update: {
        name: `${dbRoot}/users/${safeUid}`,
        fields: encodeDocFields({
          uid,
          lastSyncedAt: syncedAt,
          notebooksCount: notebooksMarked.length,
          sightingsCount: processedSightings.length,
        }),
      },
    });

    await commitFirestoreWrites(sa, token, writes);
  }

  return {
    syncedAt,
    firestoreSynced: Boolean(sa),
    r2UploadedCount,
    sightingPhotoUrls,
    illustrationUrls,
  };
}

// ============================================================================
// 3. PROYECCIONES PÚBLICAS DE CUADERNOS COMPARTIDOS EN FIRESTORE + R2
// ============================================================================

export async function publishPublicNotebookToCloud(
  ownerUid: string,
  projection: Record<string, unknown>,
  env: ServerEnv = resolveServerEnv()
): Promise<{ published: boolean; projection: Record<string, unknown> }> {
  const sa = parseFirebaseServiceAccount(env);
  const r2 = parseCloudflareR2Config(env);
  if (!sa) {
    return { published: false, projection };
  }

  const shareToken = sanitizeDocId(String(projection.shareToken || ''));
  if (!shareToken) {
    throw new Error('MISSING_SHARE_TOKEN');
  }

  // Si hay imágenes en dataUrl dentro de la proyección pública y R2 está activo, subirlas bajo public/{shareToken}/
  const rawSheets = Array.isArray(projection.sheets)
    ? (projection.sheets as Array<Record<string, unknown>>)
    : [];

  const processedSheets = await Promise.all(
    rawSheets.map(async (sheet, sIdx) => {
      const next = { ...sheet };
      const illUrl = typeof next.illustrationUrl === 'string' ? next.illustrationUrl : '';
      if (r2 && illUrl.startsWith('data:image/') && !illUrl.startsWith('data:image/svg')) {
        const up = await uploadDataUrlToR2({
          keyPrefix: `public/${shareToken}/ill_${sanitizeDocId(String(next.taxonId || sIdx))}`,
          dataUrl: illUrl,
          env,
        });
        if (up) next.illustrationUrl = up.url;
      }
      if (r2 && Array.isArray(next.publicPhotos)) {
        const uploadedPhotos: string[] = [];
        for (let pIdx = 0; pIdx < next.publicPhotos.length; pIdx++) {
          const pUrl = String(next.publicPhotos[pIdx] || '');
          if (pUrl.startsWith('data:image/') && !pUrl.startsWith('data:image/svg')) {
            const up = await uploadDataUrlToR2({
              keyPrefix: `public/${shareToken}/photo_${sIdx}_${pIdx}`,
              dataUrl: pUrl,
              env,
            });
            uploadedPhotos.push(up ? up.url : pUrl);
          } else if (pUrl) {
            uploadedPhotos.push(pUrl);
          }
        }
        next.publicPhotos = uploadedPhotos;
      }
      return next;
    })
  );

  const docData: Record<string, unknown> = {
    ...projection,
    shareToken,
    ownerUid,
    sheets: processedSheets,
    publishedAt: new Date().toISOString(),
  };

  const token = await getFirestoreAccessToken(sa);
  const dbRoot = `projects/${sa.projectId}/databases/(default)/documents`;
  await commitFirestoreWrites(sa, token, [
    {
      update: {
        name: `${dbRoot}/public_shared_notebooks/${shareToken}`,
        fields: encodeDocFields(docData),
      },
    },
  ]);

  return { published: true, projection: docData };
}

export async function revokePublicNotebookInCloud(
  ownerUid: string,
  shareToken: string,
  env: ServerEnv = resolveServerEnv()
): Promise<boolean> {
  const sa = parseFirebaseServiceAccount(env);
  if (!sa) return false;

  const cleanToken = sanitizeDocId(shareToken);
  const token = await getFirestoreAccessToken(sa);
  const dbRoot = `projects/${sa.projectId}/databases/(default)/documents`;
  await commitFirestoreWrites(sa, token, [
    {
      update: {
        name: `${dbRoot}/public_shared_notebooks/${cleanToken}`,
        fields: encodeDocFields({
          shareToken: cleanToken,
          ownerUid,
          isEnabled: false,
          revokedAt: new Date().toISOString(),
          sheets: [],
        }),
      },
    },
  ]);
  return true;
}

export async function fetchPublicNotebookFromCloud(
  shareToken: string,
  env: ServerEnv = resolveServerEnv()
): Promise<
  | { status: 'ok'; notebook: Record<string, unknown> }
  | { status: 'revoked' | 'not_found' | 'unconfigured' }
> {
  const sa = parseFirebaseServiceAccount(env);
  if (!sa) {
    return { status: 'unconfigured' };
  }

  const cleanToken = sanitizeDocId(shareToken);
  const token = await getFirestoreAccessToken(sa);
  const url = `${firestoreDocsBase(sa.projectId)}/public_shared_notebooks/${encodeURIComponent(
    cleanToken
  )}`;
  const res = await serverFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  });

  if (res.status === 404) {
    return { status: 'not_found' };
  }
  if (!res.ok) {
    throw new Error(`FIRESTORE_PUBLIC_READ_FAILED (${res.status})`);
  }

  const doc = (await res.json()) as { fields?: Record<string, Record<string, unknown>> };
  const data = decodeDocFields(doc);
  if (!data.isEnabled || data.revokedAt) {
    return { status: 'revoked' };
  }
  // Nunca devolver ownerUid al invitado público
  const { ownerUid: _hidden, ...publicData } = data;
  return { status: 'ok', notebook: publicData };
}
