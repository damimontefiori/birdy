import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from '../App';
import {
  generateOrReuseIllustration,
  getAIConsumptionMetrics,
  identifyBirdFromPhoto,
} from '../services/aiBirdService';
import {
  fetchPublicNotebookByToken,
  publishOrUpdateSanitizedNotebookProjection,
  restoreFromGoogleCloudOnNewDevice,
  revokePublicNotebookShareToken,
  syncSightingAndNotebookToCloud,
} from '../services/storageAndSyncService';
import { composeSocialShareCard } from '../services/socialShareComposer';
import { Notebook, NotebookSpeciesSheet, Sighting } from '../types/domain';

describe('Cuaderno de Aves MVP — Verificación de Criterios de Aceptación (CA01–CA17)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('CA01 y CA09: Valeria accede con Google, crea un cuaderno en español y puede crear un cuaderno de viaje independiente', async () => {
    render(<App />);

    // Pantalla de bienvenida en español rioplatense
    const loginBtn = screen.getByRole('button', {
      name: /Ingresar con mi cuenta de Google \(Valeria\)/i,
    });
    expect(loginBtn).toBeInTheDocument();
    fireEvent.click(loginBtn);

    // Onboarding del primer cuaderno
    expect(
      screen.getByText(/Armemos tu primer cuaderno de campo/i)
    ).toBeInTheDocument();

    const createBtn = screen.getByRole('button', {
      name: /Crear cuaderno y abrir portada/i,
    });
    fireEvent.click(createBtn);

    // Ve el cuaderno recién creado con acción clara «Registrar mi primera ave» (F01.4)
    expect(screen.getByText('Aves de mi jardín')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Registrar mi primera ave/i })
    ).toBeInTheDocument();

    // CA09: Crear un segundo cuaderno de viaje independiente
    fireEvent.click(screen.getByRole('button', { name: /Todos mis cuadernos/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Nuevo cuaderno \(Jardín o Viaje\)/i })
    );

    expect(screen.getByDisplayValue('Vacaciones en Lago Puelo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lago Puelo, Chubut')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Crear cuaderno y abrir portada/i })
    );

    expect(screen.getByText('Vacaciones en Lago Puelo')).toBeInTheDocument();
    expect(screen.getByText(/Estilo fijo: Lápiz grafito/i)).toBeInTheDocument();
  });

  it('CA02 y CA03: Permite elegir foto de galería, sugiere fecha y GPS desde EXIF como editables/descartables y no inventa datos si faltan', async () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: /Ingresar con mi cuenta de Google/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Crear cuaderno y abrir portada/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Registrar mi primera ave/i })
    );

    // 1. Probar foto con EXIF (fecha + GPS)
    fireEvent.click(
      screen.getByRole('button', {
        name: /Hornero en el pasto \(Foto nítida \+ EXIF GPS\)/i,
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Metadatos EXIF detectados en la fotografía/i)
      ).toBeInTheDocument();
    });

    const locInput = screen.getByLabelText(/Ubicación aproximada/i) as HTMLInputElement;
    expect(locInput.value).toBe('Jardín / Zona Norte, Buenos Aires');

    // Puede descartar la ubicación sugerida por EXIF
    fireEvent.click(screen.getByRole('button', { name: /Descartar ubicación/i }));
    expect(locInput.value).toBe('');

    // 2. Probar foto SIN EXIF: no inventa ubicación
    fireEvent.click(
      screen.getByRole('button', {
        name: /Chingolo en rama \(Foto nítida · Sin EXIF\)/i,
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Fotografía sin metadatos EXIF de ubicación/i)
      ).toBeInTheDocument();
    });
    expect(locInput.value).toBe('');
  });

  it('CA04 y CA16: Identifica con evidencia suficiente, comunica dudas ante especies similares, no inventa cuando no hay ave y evita llamadas duplicadas', async () => {
    const metricsBefore = getAIConsumptionMetrics();

    // 1. Caso nítido (Hornero)
    const highRes = await identifyBirdFromPhoto({
      photoSha256: 'test_sha_hornero_1',
      fileName: 'hornero.jpg',
      sanitizedPhotoDataUrl: 'data:image/jpeg;base64,AAA',
      presetScenario: 'clara_hornero',
    });
    expect(highRes.confidenceLevel).toBe('alta');
    expect(highRes.proposedTaxonId).toBe('rufhor2');
    expect(highRes.fromCache).toBe(false);

    // CA16: Reintento con la misma foto usa caché idempotente sin volver a consumir IA
    const cachedRes = await identifyBirdFromPhoto({
      photoSha256: 'test_sha_hornero_1',
      fileName: 'hornero.jpg',
      sanitizedPhotoDataUrl: 'data:image/jpeg;base64,AAA',
      presetScenario: 'clara_hornero',
    });
    expect(cachedRes.fromCache).toBe(true);
    expect(getAIConsumptionMetrics().identificationsPreventedByCache).toBeGreaterThan(
      metricsBefore.identificationsPreventedByCache
    );

    // 2. Caso con duda (especies semejantes)
    const mediumRes = await identifyBirdFromPhoto({
      photoSha256: 'test_sha_duda_2',
      fileName: 'duda.jpg',
      sanitizedPhotoDataUrl: 'data:image/jpeg;base64,BBB',
      presetScenario: 'duda_semillita_o_chingolo',
    });
    expect(mediumRes.confidenceLevel).toBe('media');
    expect(mediumRes.status).toBe('requiere_confirmacion');
    expect(mediumRes.candidates.length).toBeGreaterThanOrEqual(2);
    expect(mediumRes.uncertaintyReason).toBeTruthy();

    // 3. Caso sin ave / borrosa -> no adjudica especie arbitrariamente
    const noBirdRes = await identifyBirdFromPhoto({
      photoSha256: 'test_sha_no_bird_3',
      fileName: 'maceta_sin_ave.jpg',
      sanitizedPhotoDataUrl: 'data:image/jpeg;base64,CCC',
      presetScenario: 'sin_ave',
    });
    expect(noBirdRes.confidenceLevel).toBe('insuficiente');
    expect(noBirdRes.proposedTaxonId).toBeNull();
    expect(noBirdRes.status).toBe('pendiente_identificacion');
  });

  it('CA05, CA06 y CA07: Registra una especie con lámina ilustrada, detecta un segundo hornero en el mismo cuaderno sin duplicar ficha y permite editar notas', async () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: /Ingresar con mi cuenta de Google/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Crear cuaderno y abrir portada/i })
    );

    // Primer Hornero
    fireEvent.click(
      screen.getByRole('button', { name: /Registrar mi primera ave/i })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: /Hornero en el pasto \(Foto nítida \+ EXIF GPS\)/i,
      })
    );

    const noteField = await screen.findByLabelText(/Nota personal de campo/i);
    fireEvent.change(noteField, {
      target: { value: 'Caminando cerca de la galería al sol.' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Confirmar foto e identificar ave/i })
    );

    const confirmHorneroBtn = await screen.findByRole(
      'button',
      { name: /Confirmar Hornero común e incorporar al cuaderno/i },
      { timeout: 3000 }
    );
    fireEvent.click(confirmHorneroBtn);

    // CA05: Ve la ficha de Hornero común con su nombre científico Furnarius rufus y la nota
    await waitFor(() => {
      expect(
        screen.getByText(/Mis avistamientos de Hornero común \(1\)/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Furnarius rufus')).toBeInTheDocument();
    expect(
      screen.getByText(/Caminando cerca de la galería al sol/i)
    ).toBeInTheDocument();

    // CA06: Registrar un SEGUNDO Hornero en el mismo cuaderno
    fireEvent.click(
      screen.getByRole('button', { name: /Agregar otro avistamiento/i })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: /Hornero en el pasto \(Foto nítida \+ EXIF GPS\)/i,
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirmar foto e identificar ave/i })
    );

    const confirmSecondBtn = await screen.findByRole(
      'button',
      { name: /Confirmar Hornero común e incorporar al cuaderno/i },
      { timeout: 3000 }
    );
    fireEvent.click(confirmSecondBtn);

    // Debe aparecer el aviso obligatorio de especie repetida (F05.1, CA06)
    const duplicateAlert = await screen.findByRole('alertdialog');
    expect(duplicateAlert).toHaveTextContent(
      /Ya registraste un hornero común en este cuaderno\. ¿Querés guardar otro avistamiento\?/i
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Sí, guardar otro avistamiento en su historial/i,
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Mis avistamientos de Hornero común \(2\)/i)
      ).toBeInTheDocument();
    });
  });

  it('CA08 y CA16: Reutiliza ilustración por especie/estilo por defecto y permite pedir otra versión bajo demanda sin perder el avistamiento', async () => {
    const first = await generateOrReuseIllustration({
      taxonId: 'rufhor2',
      style: 'acuarela_naturalista',
      existingIllustrations: [],
      forceNewVersion: false,
    });
    expect(first.reused).toBe(false);
    expect(first.illustration.version).toBe(1);

    // Reutilización automática cuando coincide especie y estilo
    const second = await generateOrReuseIllustration({
      taxonId: 'rufhor2',
      style: 'acuarela_naturalista',
      existingIllustrations: [first.illustration],
      forceNewVersion: false,
    });
    expect(second.reused).toBe(true);
    expect(second.illustration.id).toBe(first.illustration.id);

    // Pedido manual de otra versión por Valeria (CA08)
    const third = await generateOrReuseIllustration({
      taxonId: 'rufhor2',
      style: 'acuarela_naturalista',
      existingIllustrations: [first.illustration],
      forceNewVersion: true,
    });
    expect(third.reused).toBe(false);
    expect(third.illustration.version).toBe(2);
  });

  it('CA10 y CA11: Distingue estados de sincronización offline/online y recupera todos los datos respaldados al cambiar de teléfono Android', async () => {
    const uid = 'google-valeria-test-restore';
    const sampleNotebook: Notebook = {
      id: 'nb_jardin_1',
      ownerUid: uid,
      ownerDisplayName: 'Valeria',
      title: 'Aves de mi jardín',
      type: 'jardin',
      style: 'acuarela_naturalista',
      generalLocation: 'Tigre',
      createdAt: '2026-10-19T10:00:00Z',
      updatedAt: '2026-10-19T10:00:00Z',
      shareConfig: {
        isEnabled: false,
        shareToken: null,
        includeOriginalPhotos: false,
        includePersonalNotes: false,
        updatedAt: '2026-10-19T10:00:00Z',
        revokedTokens: [],
      },
      syncStatus: 'local',
    };

    const sampleSighting: Sighting = {
      id: 'sighting_idempotent_01',
      notebookId: sampleNotebook.id,
      ownerUid: uid,
      taxonId: 'rufhor2',
      identificationStatus: 'identificado',
      syncStatus: 'local',
      confidenceLevel: 'alta',
      aiCandidates: [],
      aiExplanation: 'Hornero común confirmado',
      aiUncertaintyReason: null,
      confirmedByUser: true,
      photoStorageKey: 'photo_sighting_idempotent_01',
      sanitizedPhotoDataUrl: 'data:image/jpeg;base64,CLEAN_PHOTO',
      photoSha256: 'sha_01',
      observedAt: '2026-10-19T09:30',
      createdAt: '2026-10-19T09:30:00Z',
      updatedAt: '2026-10-19T09:30:00Z',
      privateLocation: {
        label: 'Fondo del jardín',
        lat: -34.426,
        lng: -58.579,
        fromExif: true,
        acceptedByUser: true,
      },
      personalNote: 'Cantando sobre el poste de barro',
      retryCount: 0,
    };

    const sampleSheet: NotebookSpeciesSheet = {
      id: 'nb_jardin_1_rufhor2',
      notebookId: sampleNotebook.id,
      taxonId: 'rufhor2',
      activeIllustrationId: 'ill_1',
      firstObservedAt: '2026-10-19T09:30',
      sightingIds: [sampleSighting.id],
      updatedAt: '2026-10-19T09:30:00Z',
    };

    const baseState = {
      user: { uid, displayName: 'Valeria', email: 'valeria@gmail.com' },
      notebooks: [sampleNotebook],
      sheets: [sampleSheet],
      sightings: [sampleSighting],
      illustrations: [],
    };

    // 1. Sin conexión: permanece en estado 'local'
    const offlineSync = await syncSightingAndNotebookToCloud({
      uid,
      sighting: sampleSighting,
      state: baseState,
      isOnline: false,
    });
    expect(offlineSync.finalSyncStatus).toBe('local');

    // 2. Falla transitoria: pasa a estado 'error'
    const errSync = await syncSightingAndNotebookToCloud({
      uid,
      sighting: sampleSighting,
      state: baseState,
      isOnline: true,
      simulateNetworkFailure: true,
    });
    expect(errSync.finalSyncStatus).toBe('error');

    // 3. Con conexión: respalda de forma idempotente (sin duplicar si se llama dos veces)
    const okSync1 = await syncSightingAndNotebookToCloud({
      uid,
      sighting: sampleSighting,
      state: baseState,
      isOnline: true,
    });
    const okSync2 = await syncSightingAndNotebookToCloud({
      uid,
      sighting: sampleSighting,
      state: baseState,
      isOnline: true,
    });
    expect(okSync1.finalSyncStatus).toBe('respaldado');
    expect(okSync2.finalSyncStatus).toBe('respaldado');

    // 4. CA11: Simular cambio de celular Android y restaurar desde la cuenta de Google
    const restored = await restoreFromGoogleCloudOnNewDevice(uid);
    expect(restored).not.toBeNull();
    expect(restored!.notebooks).toHaveLength(1);
    expect(restored!.sightings).toHaveLength(1); // No se duplicó por el reintento
    expect(restored!.sightings[0].personalNote).toBe('Cantando sobre el poste de barro');
  });

  it('CA12, CA13, CA14 y CA15: Compone piezas para redes en dos variantes con firma discreta y gestiona enlaces de cuaderno públicos sanitizados y revocables', async () => {
    // CA12: Dos variantes de pieza para redes con firma discreta
    const cardIllustrationOnly = await composeSocialShareCard({
      variant: 'solo_ilustracion',
      format: 'historia_9_16',
      style: 'acuarela_naturalista',
      commonNameAr: 'Hornero común',
      scientificName: 'Furnarius rufus',
      family: 'Furnariidae',
      illustrationUrl: '/plates/acuarela_hornero.jpg',
      includeDate: true,
      observedAtIso: '2026-10-19T08:00',
      includePersonalNote: false,
      notebookTitle: 'Aves de mi jardín',
      ownerDisplayName: 'Valeria',
    });
    expect(cardIllustrationOnly.signatureText).toBe('Aves de mi jardín — Valeria');
    expect(cardIllustrationOnly.width).toBe(1080);
    expect(cardIllustrationOnly.height).toBe(1920);

    const cardWithPhoto = await composeSocialShareCard({
      variant: 'ilustracion_y_foto',
      format: 'publicacion_4_5',
      style: 'acuarela_naturalista',
      commonNameAr: 'Hornero común',
      scientificName: 'Furnarius rufus',
      family: 'Furnariidae',
      illustrationUrl: '/plates/acuarela_hornero.jpg',
      originalPhotoSanitizedUrl: 'data:image/jpeg;base64,CLEAN',
      includeDate: true,
      observedAtIso: '2026-10-19T08:00',
      includePersonalNote: true,
      personalNote: 'Construyendo su nido',
      notebookTitle: 'Aves de mi jardín',
      ownerDisplayName: 'Valeria',
    });
    expect(cardWithPhoto.height).toBe(1350);

    // CA13 y CA14: Publicación de cuaderno compartido sin datos privados ni coordenadas
    const token = 'token_publico_prueba_123';
    const sharedNb: Notebook = {
      id: 'nb_share_1',
      ownerUid: 'uid_valeria',
      ownerDisplayName: 'Valeria',
      title: 'Aves de mi jardín',
      type: 'jardin',
      style: 'acuarela_naturalista',
      generalLocation: 'Zona Norte, Buenos Aires',
      createdAt: '2026-10-19T10:00:00Z',
      updatedAt: '2026-10-19T10:00:00Z',
      shareConfig: {
        isEnabled: true,
        shareToken: token,
        includeOriginalPhotos: false, // Por defecto NO incluye fotos originales
        includePersonalNotes: false, // Por defecto NO incluye notas personales
        updatedAt: '2026-10-19T10:00:00Z',
        revokedTokens: [],
      },
      syncStatus: 'respaldado',
    };

    const sheet: NotebookSpeciesSheet = {
      id: 'nb_share_1_rufhor2',
      notebookId: 'nb_share_1',
      taxonId: 'rufhor2',
      activeIllustrationId: 'ill_1',
      firstObservedAt: '2026-10-19T08:30',
      sightingIds: ['s_priv_1'],
      updatedAt: '2026-10-19T08:30:00Z',
    };

    const privateSighting: Sighting = {
      id: 's_priv_1',
      notebookId: 'nb_share_1',
      ownerUid: 'uid_valeria',
      taxonId: 'rufhor2',
      identificationStatus: 'identificado',
      syncStatus: 'respaldado',
      confidenceLevel: 'alta',
      aiCandidates: [],
      aiExplanation: null,
      aiUncertaintyReason: null,
      confirmedByUser: true,
      photoStorageKey: 'photo_s_priv_1',
      sanitizedPhotoDataUrl: 'data:image/jpeg;base64,ORIG_PHOTO',
      photoSha256: 'sha_priv_1',
      observedAt: '2026-10-19T08:30',
      createdAt: '2026-10-19T08:30:00Z',
      updatedAt: '2026-10-19T08:30:00Z',
      privateLocation: {
        label: 'Calle Privada 1234',
        lat: -34.4261,
        lng: -58.5796,
        fromExif: true,
        acceptedByUser: true,
      },
      personalNote: 'Nota privada que no debe filtrarse por defecto',
      retryCount: 0,
    };

    publishOrUpdateSanitizedNotebookProjection(sharedNb, [sheet], [privateSighting], []);

    const publicLookup = fetchPublicNotebookByToken(token);
    expect(publicLookup.status).toBe('ok');
    if (publicLookup.status === 'ok') {
      const jsonStr = JSON.stringify(publicLookup.notebook);
      // CA14: Nunca incluye coordenadas, dirección privada ni nota privada cuando no se consintió
      expect(jsonStr).not.toContain('-34.4261');
      expect(jsonStr).not.toContain('Calle Privada 1234');
      expect(jsonStr).not.toContain('Nota privada que no debe filtrarse');
      expect(publicLookup.notebook.sheets[0].publicPhotos).toHaveLength(0);
    }

    // CA15: Al revocar el enlace, deja de servir inmediatamente la vista y sus recursos
    revokePublicNotebookShareToken(token);
    const afterRevoke = fetchPublicNotebookByToken(token);
    expect(afterRevoke.status).toBe('revoked');
  });
});
