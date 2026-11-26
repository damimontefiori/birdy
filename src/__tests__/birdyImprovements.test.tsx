import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from '../App';
import {
  ARGENTINA_BIRDS_CATALOG,
  BIOMA_ARGENTINA_CATALOG,
  getSpeciesGardenEcology,
  getSpeciesGroup,
  inferOrganismGroupFromMeta,
  searchSpeciesCatalog,
} from '../data/argentinaBirdsCatalog';
import {
  ILLUSTRATION_STYLES_ORDER,
  ORGANISM_GROUPS_ORDER,
} from '../types/domain';
import { generateOrReuseIllustration, identifyBirdFromPhoto } from '../services/aiBirdService';
import { computeAutoFrameCrop } from '../services/plateAutoFramer';
import {
  exportFullBackupJson,
  importFullBackupJson,
} from '../services/storageAndSyncService';
import {
  DEFAULT_ALLOWED_EMAILS,
  getAuthenticatedUserFromRequest,
  isAuthEnforced,
  isEmailAllowed,
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
} from '../../server/authService';
import {
  buildNaturalistIllustrationPrompt,
  DEFAULT_VISION_MODELS,
  inferServerOrganismGroup,
  isAllowedImageProxyUrl,
  resolveActiveVisionModel,
  SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR,
} from '../../server/secureAiProxy';
import {
  buildR2SignedRequest,
  firestoreValueToJs,
  getCloudStorageStatus,
  isValidMediaObjectKey,
  jsToFirestoreValue,
} from '../../server/cloudStorageService';
import {
  classifySpeciesAcousticProfile,
  isAllowedSoundProxyUrl,
} from '../../server/speciesSoundService';

describe('Birdy — Mejoras de detección, comparación visual, ficha compacta y visor ampliado', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('Incluye Ratona común (Ratucha / Troglodytes aedon) en el catálogo argentino y encuentra por apodo local sin tildes', () => {
    const byRatucha = searchSpeciesCatalog('ratucha');
    expect(byRatucha.some((s) => s.scientificName === 'Troglodytes aedon')).toBe(true);

    const byRatona = searchSpeciesCatalog('ratona comun');
    expect(byRatona[0]?.commonNameAr).toBe('Ratona común');
    expect(byRatona[0]?.quickSummary).toBeTruthy();

    // Ninguna especie sin lámina propia debe reutilizar falsamente la lámina del hornero
    const nonHorneroWithHorneroPlate = ARGENTINA_BIRDS_CATALOG.filter(
      (s) => s.taxonId !== 'rufhor2' && s.defaultWatercolorPlate?.includes('hornero')
    );
    expect(nonHorneroWithHorneroPlate).toHaveLength(0);
  });

  it('Nunca adjudica Hornero común por defecto cuando una foto real no tiene motor de IA configurado', async () => {
    const res = await identifyBirdFromPhoto({
      photoSha256: 'real_ratucha_photo_sha',
      fileName: 'IMG_20261121_154000.jpg',
      sanitizedPhotoDataUrl: 'data:image/jpeg;base64,FAKE_RATUCHA',
      presetScenario: 'auto',
    });

    expect(res.aiMode).toBe('unconfigured');
    expect(res.proposedTaxonId).toBeNull();
    expect(res.status).toBe('pendiente_identificacion');
    expect(res.candidates).toHaveLength(0);
  });

  it('Permite comparar candidatas lado a lado con mi foto, despliega la Ficha de campo bajo demanda y amplía la foto original en Lightbox', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Ingresar con mi cuenta de Google/i }));
    fireEvent.click(screen.getByRole('button', { name: /Crear cuaderno y abrir portada/i }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar mi primer hallazgo/i }));

    // Seleccionar foto de ejemplo con duda para probar comparación visual
    fireEvent.click(
      screen.getByRole('button', {
        name: /Ave a contraluz \(Con duda · Comparar candidatas\)/i,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirmar foto e identificar especie/i }));

    // Abrir el comparador visual lado a lado desde una candidata
    const compareButtons = await screen.findAllByRole(
      'button',
      { name: /Comparar con mi foto/i },
      { timeout: 3000 }
    );
    expect(compareButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(compareButtons[1]); // Segunda candidata: Ratona común

    const compareDialog = await screen.findByRole('dialog', {
      name: /Comparar tu foto con Ratona común/i,
    });
    expect(compareDialog).toBeInTheDocument();
    expect(compareDialog).toHaveTextContent(/Tu foto/i);
    expect(compareDialog).toHaveTextContent(/Referencia real/i);

    // Confirmar la especie desde el comparador y registrarla en el cuaderno
    fireEvent.click(screen.getByRole('button', { name: /Sí, es Ratona común/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Confirmar Ratona común e incorporar al cuaderno/i })
    );

    // En la página del cuaderno: Lámina y foto protagonistas, y la Ficha de campo colapsada por defecto
    await waitFor(() => {
      expect(screen.getByText('Troglodytes aedon')).toBeInTheDocument();
    });

    const accordionBtn = screen.getByRole('button', { name: /Ficha de campo/i });
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Comportamiento')).not.toBeInTheDocument();

    // Expandir la ficha de campo
    fireEvent.click(accordionBtn);
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Comportamiento')).toBeInTheDocument();
    expect(screen.getByText('Alimentación y hábitat')).toBeInTheDocument();

    // Ampliar la foto original en el visor Lightbox con zoom
    const zoomOriginalBtn = screen.getByRole('button', {
      name: /Ampliar fotografía original de Ratona común/i,
    });
    fireEvent.click(zoomOriginalBtn);

    const lightbox = await screen.findByRole('dialog', { name: /Ratona común/i });
    expect(lightbox).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Acercar/i }));
    expect(screen.getByText('175%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cerrar vista ampliada/i }));
    expect(screen.queryByRole('dialog', { name: /Ratona común/i })).not.toBeInTheDocument();
  });

  it('Valida estrictamente la lista blanca de dominios permitidos en el proxy de imágenes', () => {
    expect(
      isAllowedImageProxyUrl('https://inaturalist-open-data.s3.amazonaws.com/photos/123/medium.jpg')
    ).toBe(true);
    expect(
      isAllowedImageProxyUrl('https://static.inaturalist.org/photos/456/large.jpg')
    ).toBe(true);
    expect(isAllowedImageProxyUrl('http://127.0.0.1:8080/secret')).toBe(false);
    expect(isAllowedImageProxyUrl('https://evil.example.com/photo.jpg')).toBe(false);
  });

  it('El botón Atrás del celular cierra visores/modales y vuelve a la sección anterior sin sacar de la app', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Ingresar con mi cuenta de Google/i }));
    fireEvent.click(screen.getByRole('button', { name: /Crear cuaderno y abrir portada/i }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar mi primer hallazgo/i }));

    // Estamos en add_sighting -> Atrás vuelve al cuaderno (notebook_detail)
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Registrar mi primer hallazgo/i })).toBeInTheDocument();
    });

    // Abrir modal Compartir cuaderno -> Atrás cierra el modal sin salir del cuaderno
    fireEvent.click(screen.getByRole('button', { name: /Compartir/i }));
    expect(
      screen.getByRole('dialog', { name: /Compartir cuaderno completo/i })
    ).toBeInTheDocument();

    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Compartir cuaderno completo/i })
      ).not.toBeInTheDocument();
    });

    // Atrás desde notebook_detail vuelve a Mis cuadernos (library)
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(screen.getByText('Mis cuadernos')).toBeInTheDocument();
    });

    // Atrás en el inicio mantiene dentro de la app y avisa
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(screen.getByText(/Ya estás en el inicio de Bioma/i)).toBeInTheDocument();
    });
  });

  it('Exporta e importa una copia de seguridad portátil (.json) completa', async () => {
    const json = await exportFullBackupJson({
      user: { uid: 'u1', displayName: 'Valeria', email: 'valeria@test.com' },
      notebooks: [
        {
          id: 'nb_1',
          ownerUid: 'u1',
          ownerDisplayName: 'Valeria',
          title: 'Aves de mi jardín',
          type: 'jardin',
          style: 'acuarela_naturalista',
          createdAt: '2026-11-22T10:00:00Z',
          updatedAt: '2026-11-22T10:00:00Z',
          shareConfig: {
            isEnabled: false,
            shareToken: null,
            includeOriginalPhotos: false,
            includePersonalNotes: false,
            updatedAt: '2026-11-22T10:00:00Z',
            revokedTokens: [],
          },
          syncStatus: 'local',
        },
      ],
      sheets: [],
      sightings: [],
      illustrations: [],
      customSpecies: [],
    });

    const restored = await importFullBackupJson(json);
    expect(restored.notebooks).toHaveLength(1);
    expect(restored.notebooks[0].title).toBe('Aves de mi jardín');
  });

  it('Restringe la autenticación de Google únicamente a valedepadua@gmail.com y damiyvale@gmail.com y valida cookies firmadas', () => {
    expect(DEFAULT_ALLOWED_EMAILS).toEqual(['valedepadua@gmail.com', 'damiyvale@gmail.com']);

    const env = {
      GOOGLE_CLIENT_ID: '123456-test.apps.googleusercontent.com',
      AUTH_SESSION_SECRET: 'super-secret-test-key-32-chars-minimum',
    };

    // Allowlist estricta (insensible a mayúsculas y espacios)
    expect(isEmailAllowed('valedepadua@gmail.com', env)).toBe(true);
    expect(isEmailAllowed('  DamiYVale@Gmail.com ', env)).toBe(true);
    expect(isEmailAllowed('otra.persona@gmail.com', env)).toBe(false);
    expect(isEmailAllowed('valedepadua@outlook.com', env)).toBe(false);
    expect(isEmailAllowed('', env)).toBe(false);
    expect(isAuthEnforced(env)).toBe(true);

    // Firma y verificación de token de sesión HttpOnly
    const validToken = signSessionToken(
      {
        uid: 'google_123',
        email: 'valedepadua@gmail.com',
        displayName: 'Valeria',
      },
      env
    );
    const verified = verifySessionToken(validToken, env);
    expect(verified?.email).toBe('valedepadua@gmail.com');

    // Rechazar token manipulado
    const tampered = `${validToken.slice(0, -4)}AAAA`;
    expect(verifySessionToken(tampered, env)).toBeNull();

    // Rechazar token expirado
    const expiredToken = signSessionToken(
      {
        uid: 'google_123',
        email: 'valedepadua@gmail.com',
        displayName: 'Valeria',
      },
      env,
      -10
    );
    expect(verifySessionToken(expiredToken, env)).toBeNull();

    // Validación de request con cookie HttpOnly: autorizada vs prohibida vs sin sesión
    const okReq = {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(validToken)}` },
    } as never;
    expect(getAuthenticatedUserFromRequest(okReq, env).status).toBe('ok');

    const forbiddenToken = signSessionToken(
      {
        uid: 'google_999',
        email: 'intruso@gmail.com',
        displayName: 'Intruso',
      },
      env
    );
    const forbiddenReq = {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(forbiddenToken)}` },
    } as never;
    expect(getAuthenticatedUserFromRequest(forbiddenReq, env)).toEqual({
      status: 'forbidden',
      email: 'intruso@gmail.com',
    });

    const anonReq = { headers: {} } as never;
    expect(getAuthenticatedUserFromRequest(anonReq, env).status).toBe('unauthenticated');
  });

  it('Construye prompts de ilustración botánica sobre papel crema limpio sin fondos fotográficos ni texto', () => {
    const wcPrompt = buildNaturalistIllustrationPrompt({
      commonNameAr: 'Chivi-chiví',
      scientificName: 'Vireo chivi',
      identificationTraits: 'Ceja clara marcada, corona grisácea, dorso oliva y vientre blancuzco',
      style: 'acuarela_naturalista',
      version: 1,
    });
    expect(wcPrompt).toContain('Vireo chivi');
    expect(wcPrompt).toContain('#FAF6E9');
    expect(wcPrompt).toContain('NO photo bokeh');
    expect(wcPrompt).toContain('NO text');
    expect(wcPrompt).toContain('NO watermarks');

    const grPrompt = buildNaturalistIllustrationPrompt({
      commonNameAr: 'Codorniz japonesa',
      scientificName: 'Coturnix japonica',
      identificationTraits: 'Cuerpo rechoncho pardo jaspeado con rayas cremosas',
      style: 'lapiz_grafito',
      version: 2,
    });
    expect(grPrompt).toContain('Coturnix japonica');
    expect(grPrompt).toContain('graphite pencil');
    expect(grPrompt).toContain('NO text');
  });

  it('Cubre los 5 grupos de Bioma Argentina con rol ecológico, apodos locales y prompts adaptados por grupo', () => {
    for (const group of ORGANISM_GROUPS_ORDER) {
      const items = BIOMA_ARGENTINA_CATALOG.filter((sp) => getSpeciesGroup(sp) === group);
      expect(items.length).toBeGreaterThanOrEqual(5);
      expect(items.every((sp) => Boolean(sp.ecologicalRole && sp.coexistenceNote))).toBe(true);
    }

    // Búsqueda por apodos argentinos en todos los grupos
    expect(searchSpeciesCatalog('manganga').some((s) => s.scientificName === 'Xylocopa augusti')).toBe(true);
    expect(searchSpeciesCatalog('espejitos').some((s) => s.scientificName === 'Agraulis vanillae')).toBe(true);
    expect(searchSpeciesCatalog('mamboreta').some((s) => s.scientificName === 'Coptopteryx argentina')).toBe(true);
    expect(searchSpeciesCatalog('salamanquesa').some((s) => s.scientificName === 'Hemidactylus mabouia')).toBe(true);

    // Inferencia automática de grupos desde iNaturalist / taxonomía
    expect(
      inferOrganismGroupFromMeta({ iconicTaxonName: 'Insecta', scientificName: 'Danaus erippus' })
    ).toBe('mariposas');
    expect(
      inferOrganismGroupFromMeta({ iconicTaxonName: 'Insecta', scientificName: 'Bombus pauloensis' })
    ).toBe('abejas_abejorros');
    expect(
      inferOrganismGroupFromMeta({ iconicTaxonName: 'Arachnida', scientificName: 'Argiope argentata' })
    ).toBe('insectos_aracnidos');
    expect(
      inferServerOrganismGroup({ iconicTaxonName: 'Amphibia', scientificName: 'Rhinella arenarum' })
    ).toBe('fauna_vecina');

    // Prompts naturalistas adaptados a mariposas y polinizadores
    const butterflyPrompt = buildNaturalistIllustrationPrompt({
      commonNameAr: 'Mariposa monarca del sur',
      scientificName: 'Danaus erippus',
      identificationTraits: 'Alas anaranjadas con venas negras y puntitos blancos',
      style: 'acuarela_naturalista',
      organismGroup: 'mariposas',
    });
    expect(butterflyPrompt).toContain('lepidopterological');
    expect(butterflyPrompt).toContain('Danaus erippus');
    expect(butterflyPrompt).toContain('#FAF6E9');

    const beePrompt = buildNaturalistIllustrationPrompt({
      commonNameAr: 'Abejorro negro y amarillo',
      scientificName: 'Bombus pauloensis',
      identificationTraits: 'Cuerpo peludo negro y amarillo',
      style: 'acuarela_naturalista',
      organismGroup: 'abejas_abejorros',
    });
    expect(beePrompt).toContain('entomological');
    expect(beePrompt).toContain('pollinator');

    // Orden de prioridad de estilos: 1) Muralismo (por defecto), 2) Acuarela, 3) Grafito
    expect(ILLUSTRATION_STYLES_ORDER).toEqual([
      'muralismo_fauna',
      'acuarela_naturalista',
      'lapiz_grafito',
    ]);

    const muralPrompt = buildNaturalistIllustrationPrompt({
      commonNameAr: 'Mariposa monarca del sur',
      scientificName: 'Danaus erippus',
      identificationTraits: 'Alas anaranjadas con venas negras y puntitos blancos',
      style: 'muralismo_fauna',
      organismGroup: 'mariposas',
    });
    expect(muralPrompt).toContain('muralism');
    expect(muralPrompt).toContain('Danaus erippus');
    expect(muralPrompt).toContain('NO text');
    expect(muralPrompt).toContain('NO graffiti tags');

    // Ningún modelo obsoleto 2.x (404) debe quedar en la lista activa de visión ni pasar desde env viejo
    expect(DEFAULT_VISION_MODELS).not.toContain('gemini-2.0-flash');
    expect(DEFAULT_VISION_MODELS).not.toContain('gemini-2.5-flash');
    expect(DEFAULT_VISION_MODELS[0]).toBe('gemini-3-flash-preview');
    expect(resolveActiveVisionModel({ GEMINI_VISION_MODEL: 'gemini-2.0-flash' })).toBe(
      'gemini-3-flash-preview'
    );
    expect(resolveActiveVisionModel({ GEMINI_VISION_MODEL: 'gemini-2.5-flash' })).toBe(
      'gemini-3-flash-preview'
    );
    expect(resolveActiveVisionModel({ GEMINI_VISION_MODEL: 'gemini-3.5-flash-lite' })).toBe(
      'gemini-3.5-flash-lite'
    );
  });

  it('Incluye Mariposa limonera (cola de golondrina / Heraclides thoas) y ecología de jardín completa en todo el catálogo', () => {
    const swallowtail = searchSpeciesCatalog('cola de golondrina');
    expect(swallowtail.some((s) => s.scientificName === 'Heraclides thoas')).toBe(true);

    // Toda especie del catálogo debe explicar qué busca en el jardín, flores, frutales y qué come
    for (const sp of BIOMA_ARGENTINA_CATALOG) {
      const eco = getSpeciesGardenEcology(sp);
      expect(eco.seeksInGarden.length).toBeGreaterThan(8);
      expect(eco.preferredFlowers.length).toBeGreaterThan(8);
      expect(eco.preferredFruitTrees.length).toBeGreaterThan(8);
      expect(eco.insectsOrFoodEaten.length).toBeGreaterThan(8);
    }

    // El prompt de visión exige observación visual previa, coherencia cromática y gardenEcology
    expect(SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR).toContain('visualObservation');
    expect(SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR).toContain('Heraclides thoas');
    expect(SYSTEM_PROMPT_IDENTIFICACION_BIOMA_AR).toContain('gardenEcology');
  });

  it('No degrada ilustraciones con filtros locales: deja en estado pendiente IA cuando falta proveedor de imagen', async () => {
    const res = await generateOrReuseIllustration({
      taxonId: 'sp_heraclides_thoas',
      style: 'muralismo_fauna',
      existingIllustrations: [],
      forceNewVersion: false,
    });
    expect(res.reused).toBe(false);
    expect(res.illustration.isPendingAi).toBe(true);
    expect(res.aiError).toBeTruthy();
    expect(res.illustration.modelProvider).toContain('pendiente');
  });

  it('Serializa Firestore correctamente, firma peticiones AWS SigV4 para Cloudflare R2 y bloquea rutas inválidas', () => {
    const sample = {
      id: 'nb_1',
      count: 3,
      ratio: 1.5,
      active: true,
      note: null,
      tags: ['jardin', 'mariposa'],
      nested: { seeksInGarden: 'Néctar de lantanas y cítricos' },
    };
    const encoded = jsToFirestoreValue(sample);
    const decoded = firestoreValueToJs(encoded as unknown as Record<string, unknown>);
    expect(decoded).toEqual(sample);

    const signed = buildR2SignedRequest({
      method: 'PUT',
      key: 'users/uid_1/photos/sighting_1.jpg',
      body: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
      config: {
        accountId: 'acc123',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'SECRET_TEST',
        bucketName: 'bioma-media',
      },
      now: new Date('2026-11-24T15:00:00Z'),
    });
    expect(signed.url).toBe('https://acc123.r2.cloudflarestorage.com/bioma-media/users/uid_1/photos/sighting_1.jpg');
    expect(signed.headers.Authorization).toContain('AWS4-HMAC-SHA256 Credential=AKIA_TEST/20261124/auto/s3/aws4_request');
    expect(signed.headers['x-amz-date']).toBe('20261124T150000Z');

    expect(isValidMediaObjectKey('users/google_123/photos/abc.jpg')).toBe(true);
    expect(isValidMediaObjectKey('public/tok_1/ill_1.png')).toBe(true);
    expect(isValidMediaObjectKey('../secret.env')).toBe(false);
    expect(isValidMediaObjectKey('users/..\\evil.jpg')).toBe(false);

    const emptyCloud = getCloudStorageStatus({});
    expect(emptyCloud.firestoreConfigured).toBe(false);
    expect(emptyCloud.r2BucketConfigured).toBe(false);
  });

  it('Deja vacío "Lugar general (opcional)" en Vida de mi jardín con placeholder correcto y limpia "Lago Puelo, Chubut" al cambiar a Jardín', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Ingresar con mi cuenta de Google/i }));

    // Onboarding inicial: "Vida de mi jardín" no debe venir autocompletado
    const locInput = (await screen.findByLabelText(/Lugar general \(opcional\)/i)) as HTMLInputElement;
    expect(locInput.value).toBe('');
    expect(locInput.placeholder).toBe('Ej.: San Antonio de Padua, Buenos Aires');

    // Crear el cuaderno y probar "+ Nuevo cuaderno" -> cambiar a "Hogar / Jardín"
    fireEvent.click(screen.getByRole('button', { name: /Crear cuaderno y abrir portada/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Todos mis cuadernos/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo cuaderno \(Jardín o Viaje\)/i }));

    const locInCreate = (await screen.findByLabelText(/Lugar general \(opcional\)/i)) as HTMLInputElement;
    expect(locInCreate.value).toBe('Lago Puelo, Chubut');

    fireEvent.click(screen.getByRole('button', { name: /Hogar \/ Jardín/i }));
    expect(locInCreate.value).toBe('');
    expect(locInCreate.placeholder).toBe('Ej.: San Antonio de Padua, Buenos Aires');
  });

  it('Muestra el placeholder actualizado en Registrar hallazgo y permite recortar/acercar la fotografía', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Ingresar con mi cuenta de Google/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Crear cuaderno y abrir portada/i }));

    fireEvent.click(await screen.findByRole('button', { name: /Registrar mi primer hallazgo/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Chingolo en rama \(Foto nítida · Sin EXIF\)/i }));

    const obsLocInput = (await screen.findByLabelText(/Ubicación aproximada \(privada\)/i)) as HTMLInputElement;
    expect(obsLocInput.placeholder).toBe('Opcional (ej.: Jardín del fondo, Jardín del frente)');

    // Abrir editor de recorte y zoom
    const cropBtn = screen.getByRole('button', { name: /Recortar \/ Acercar/i });
    fireEvent.click(cropBtn);

    const dialog = await screen.findByRole('dialog', { name: /Recortar y acercar fotografía/i });
    expect(dialog).toBeInTheDocument();

    const zoomSlider = screen.getByLabelText(/Nivel de zoom/i) as HTMLInputElement;
    fireEvent.change(zoomSlider, { target: { value: '1.8' } });
    expect(screen.getByText('180%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Girar 90°/i }));
    fireEvent.click(screen.getByRole('tab', { name: '4:3' }));
    fireEvent.click(screen.getByRole('button', { name: /Aplicar recorte/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Recortar y acercar fotografía/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Restaurar original/i })).toBeInTheDocument();
  });

  it('Encuadra inteligentemente láminas de Acuarela/Grafito pequeñas y pide encuadre amplio en los prompts', () => {
    // Sujeto tipo geco pequeño centrado en una lámina 1024×1024
    const smallGecko = {
      bgR: 250,
      bgG: 246,
      bgB: 233,
      bgCss: 'rgb(250, 246, 233)',
      left: 0.2,
      top: 0.36,
      right: 0.8,
      bottom: 0.72,
    };

    const storyCrop = computeAutoFrameCrop({
      imgW: 1024,
      imgH: 1024,
      targetW: 924,
      targetH: 924,
      subject: smallGecko,
    });
    expect(storyCrop).not.toBeNull();
    // Debe acercar para que el sujeto ocupe ~87% del ancho (cropW ≈ 0.60 / 0.87 * 1024 ≈ 706)
    expect(storyCrop!.cropW).toBeLessThan(740);
    expect(storyCrop!.cropW).toBeGreaterThan(680);

    // En Feed 4:5 (588×716), incluso una lámina ya grande horizontal (0.06..0.94) no debe recortar cola ni cabeza
    const wideAlreadyLarge = {
      bgR: 250,
      bgG: 246,
      bgB: 233,
      bgCss: 'rgb(250, 246, 233)',
      left: 0.06,
      top: 0.26,
      right: 0.94,
      bottom: 0.74,
    };
    const feedCrop = computeAutoFrameCrop({
      imgW: 1024,
      imgH: 1024,
      targetW: 588,
      targetH: 716,
      subject: wideAlreadyLarge,
    });
    expect(feedCrop).not.toBeNull();
    expect(feedCrop!.cropX).toBeLessThanOrEqual(wideAlreadyLarge.left * 1024);
    expect(feedCrop!.cropX + feedCrop!.cropW).toBeGreaterThanOrEqual(wideAlreadyLarge.right * 1024);

    // Sujeto cuadrado centrado que ya llena el 86% no requiere reencuadre
    const alreadyFilled = {
      bgR: 250,
      bgG: 246,
      bgB: 233,
      bgCss: 'rgb(250, 246, 233)',
      left: 0.07,
      top: 0.07,
      right: 0.93,
      bottom: 0.93,
    };
    expect(
      computeAutoFrameCrop({
        imgW: 1024,
        imgH: 1024,
        targetW: 924,
        targetH: 924,
        subject: alreadyFilled,
      })
    ).toBeNull();

    // Prompts actualizados para Acuarela y Grafito piden ocupar 80%–86% del lienzo sin grandes márgenes vacíos
    const wc = buildNaturalistIllustrationPrompt({
      commonNameAr: 'Geco tosco',
      scientificName: 'Homonota darwinii',
      identificationTraits: 'Cuerpo rugoso moteado pardo y crema sobre piedra musgosa',
      style: 'acuarela_naturalista',
      organismGroup: 'fauna_vecina',
    });
    expect(wc).toContain('80% to 86%');
    expect(wc).not.toContain('generous clean ivory paper margins');

    const gr = buildNaturalistIllustrationPrompt({
      commonNameAr: 'Geco tosco',
      scientificName: 'Homonota darwinii',
      identificationTraits: 'Cuerpo rugoso moteado pardo y crema sobre piedra musgosa',
      style: 'lapiz_grafito',
      organismGroup: 'fauna_vecina',
    });
    expect(gr).toContain('80% to 86%');
    expect(gr).not.toContain('generous clean archival paper margins');
  });

  it('Clasifica perfiles bioacústicos con rigor (aves, polinizadores, insectos vs especies silenciosas) y protege el proxy de audio', () => {
    const bird = classifySpeciesAcousticProfile({
      scientificName: 'Furnarius rufus',
      commonNameAr: 'Hornero común',
      organismGroup: 'aves',
    });
    expect(bird.kind).toBe('vocal_bird');
    expect(bird.elevenLabsPrompt).toContain('NO human voice');

    const bee = classifySpeciesAcousticProfile({
      scientificName: 'Bombus pauloensis',
      commonNameAr: 'Abejorro negro y amarillo',
      organismGroup: 'abejas_abejorros',
    });
    expect(bee.kind).toBe('buzzing_pollinator');
    expect(bee.elevenLabsPrompt).toContain('NO human voice');

    const cricket = classifySpeciesAcousticProfile({
      scientificName: 'Gryllus assimilis',
      commonNameAr: 'Grillo común de jardín',
      organismGroup: 'insectos_aracnidos',
    });
    expect(cricket.kind).toBe('stridulating_insect');

    const butterfly = classifySpeciesAcousticProfile({
      scientificName: 'Danaus erippus',
      commonNameAr: 'Mariposa monarca del sur',
      organismGroup: 'mariposas',
    });
    expect(butterfly.kind).toBe('silent');
    expect(butterfly.silentExplanation).toContain('silenciosas');

    const spider = classifySpeciesAcousticProfile({
      scientificName: 'Argiope argentata',
      commonNameAr: 'Araña tigre plateada',
      organismGroup: 'insectos_aracnidos',
    });
    expect(spider.kind).toBe('silent');

    expect(isAllowedSoundProxyUrl('https://static.inaturalist.org/sounds/2231243.m4a')).toBe(true);
    expect(isAllowedSoundProxyUrl('https://upload.wikimedia.org/wikipedia/commons/e/ec/song.mp3')).toBe(true);
    expect(isAllowedSoundProxyUrl('http://127.0.0.1:8080/internal.mp3')).toBe(false);
    expect(isAllowedSoundProxyUrl('https://evil.example.com/fake.mp3')).toBe(false);
  });

  it('Convierte cada hoja en un registro en el tiempo con reproductor de sonido, verificación IA al sumar foto, desvío si es otra especie y soporte de videos cortos', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Ingresar con mi cuenta de Google/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Crear cuaderno y abrir portada/i }));

    // 1. Registrar primera entrada de Hornero común
    fireEvent.click(await screen.findByRole('button', { name: /Registrar mi primer hallazgo/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Hornero en el pasto \(Foto nítida \+ EXIF GPS\)/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirmar foto e identificar especie/i }));
    const confirmHorneroBtn = await screen.findByRole(
      'button',
      { name: /Confirmar Hornero común e incorporar al cuaderno/i },
      { timeout: 3000 }
    );
    fireEvent.click(confirmHorneroBtn);

    // 2. Verificar que la hoja muestra el reproductor bioacústico y el registro en el tiempo
    expect(
      await screen.findByRole('button', { name: /Escuchar sonido de Hornero común/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Registro en el tiempo de Hornero común \(1\)/i)).toBeInTheDocument();

    // 3. Sumar una 2.ª fotografía de la MISMA especie con su propia ubicación y nota -> IA verifica coincidencia
    fireEvent.click(screen.getByRole('button', { name: /Sumar foto o video a esta hoja/i }));
    const addDialog = await screen.findByRole('dialog', {
      name: /Sumar nueva entrada a la hoja de Hornero común/i,
    });
    expect(addDialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hornero en el pasto/i }));
    fireEvent.change(screen.getByLabelText(/Ubicación aproximada \(privada\)/i), {
      target: { value: 'Jardín del frente' },
    });
    fireEvent.change(screen.getByLabelText(/Nota personal de esta entrada/i), {
      target: { value: 'Volvió a juntar barro húmedo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar especie y sumar entrada/i }));

    await waitFor(() => {
      expect(screen.getByText(/Registro en el tiempo de Hornero común \(2\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Jardín del frente/i)).toBeInTheDocument();
    expect(screen.getByText(/Volvió a juntar barro húmedo/i)).toBeInTheDocument();
    expect(screen.getByText(/IA verificada/i)).toBeInTheDocument();

    // 4. Intentar sumar por error una foto de OTRA especie (Benteveo común) en la hoja del Hornero -> IA bloquea y ofrece llevarla a su hoja
    fireEvent.click(screen.getByRole('button', { name: /Sumar foto o video a esta hoja/i }));
    await screen.findByRole('dialog', { name: /Sumar nueva entrada a la hoja de Hornero común/i });
    fireEvent.click(screen.getByRole('button', { name: /Benteveo común al sol/i }));
    fireEvent.click(screen.getByRole('button', { name: /Verificar especie y sumar entrada/i }));

    expect(await screen.findByText(/Parece ser otra especie diferente/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Guardar en su propia hoja \(Benteveo común\)/i })
    );

    // Ahora estamos en la hoja independiente de Benteveo común (sin mezclar con Hornero)
    expect(
      await screen.findByRole('button', { name: /Escuchar sonido de Benteveo común/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Registro en el tiempo de Benteveo común \(1\)/i)).toBeInTheDocument();

    // 5. Sumar un VIDEO CORTO a la hoja de Benteveo común (sin revisión de especie por IA)
    fireEvent.click(screen.getByRole('button', { name: /Sumar foto o video a esta hoja/i }));
    await screen.findByRole('dialog', { name: /Sumar nueva entrada a la hoja de Benteveo común/i });
    fireEvent.click(screen.getByRole('tab', { name: /Video corto/i }));

    const fileInputs = document.querySelectorAll('input[type="file"][accept*="video"]');
    const videoInput = fileInputs[0] as HTMLInputElement;
    const shortMp4 = new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], 'benteveo_rama.mp4', {
      type: 'video/mp4',
    });
    fireEvent.change(videoInput, { target: { files: [shortMp4] } });

    const noteArea = await screen.findByLabelText(/Nota personal de esta entrada/i);
    fireEvent.change(noteArea, { target: { value: 'Cantando fuerte en el fresno' } });
    fireEvent.click(screen.getByRole('button', { name: /Sumar video a esta hoja/i }));

    await waitFor(() => {
      expect(screen.getByText(/Registro en el tiempo de Benteveo común \(2\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Cantando fuerte en el fresno/i)).toBeInTheDocument();
  });
});
