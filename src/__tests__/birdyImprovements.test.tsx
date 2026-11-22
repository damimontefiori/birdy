import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from '../App';
import {
  ARGENTINA_BIRDS_CATALOG,
  searchSpeciesCatalog,
} from '../data/argentinaBirdsCatalog';
import { identifyBirdFromPhoto } from '../services/aiBirdService';
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
import { isAllowedImageProxyUrl } from '../../server/secureAiProxy';

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
    fireEvent.click(screen.getByRole('button', { name: /Registrar mi primera ave/i }));

    // Seleccionar foto de ejemplo con duda para probar comparación visual
    fireEvent.click(
      screen.getByRole('button', {
        name: /Ave a contraluz \(Con duda · Comparar candidatas\)/i,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirmar foto e identificar ave/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /Registrar mi primera ave/i }));

    // Estamos en add_sighting -> Atrás vuelve al cuaderno (notebook_detail)
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Registrar mi primera ave/i })).toBeInTheDocument();
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
      expect(screen.getByText(/Ya estás en el inicio de Birdy/i)).toBeInTheDocument();
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
});
