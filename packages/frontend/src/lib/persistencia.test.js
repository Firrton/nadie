import { afterEach, describe, expect, it, vi } from 'vitest';
import { asegurarPersistencia, olvidarQueSePidio } from './persistencia.js';

afterEach(() => olvidarQueSePidio());

describe('asegurarPersistencia', () => {
  it('sin la API, no rompe nada', async () => {
    expect(await asegurarPersistencia({ storage: null })).toEqual({ ok: false, motivo: 'sin-api' });
    expect(await asegurarPersistencia({ storage: {} })).toEqual({ ok: false, motivo: 'sin-api' });
  });

  /* Volver a pedir algo ya concedido es arriesgarse a un permiso al pedo. */
  it('si ya estaba concedido, no vuelve a pedirlo', async () => {
    const persist = vi.fn();
    const r = await asegurarPersistencia({ storage: { persisted: async () => true, persist } });

    expect(r).toEqual({ ok: true, motivo: 'ya-estaba' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('lo pide cuando todavía no lo tiene', async () => {
    const persist = vi.fn(async () => true);
    const r = await asegurarPersistencia({ storage: { persisted: async () => false, persist } });

    expect(r).toEqual({ ok: true, motivo: 'concedido' });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  /* Que lo nieguen no es un error: la app funciona igual, pierde la garantía. */
  it('un "no" se registra sin lanzar', async () => {
    const r = await asegurarPersistencia({ storage: { persisted: async () => false, persist: async () => false } });

    expect(r).toEqual({ ok: false, motivo: 'denegado' });
  });

  /* Insistir después de un "no" es molestar a alguien que ya contestó. */
  it('no insiste: una sola vez por sesión', async () => {
    const persist = vi.fn(async () => false);
    const storage = { persisted: async () => false, persist };

    await asegurarPersistencia({ storage });
    const segunda = await asegurarPersistencia({ storage });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(segunda.motivo).toBe('ya-se-pidio');
  });

  it('una API que lanza tampoco rompe nada', async () => {
    const explota = { persisted: async () => { throw new Error('denegado por política'); }, persist: async () => true };
    expect((await asegurarPersistencia({ storage: explota })).motivo).toBe('no-se-pudo-consultar');

    olvidarQueSePidio();
    const explotaAlPedir = { persisted: async () => false, persist: async () => { throw new Error('nope'); } };
    expect((await asegurarPersistencia({ storage: explotaAlPedir })).motivo).toBe('no-se-pudo-pedir');
  });

  /* Los mensajes del navegador pueden traer detalle del origen o la política. */
  it('el motivo no filtra el mensaje del navegador', async () => {
    const storage = { persisted: async () => { throw new Error('origen nadie.app bloqueado por perfil corporativo'); } };
    const r = await asegurarPersistencia({ storage });

    expect(JSON.stringify(r)).not.toContain('nadie.app');
  });
});
