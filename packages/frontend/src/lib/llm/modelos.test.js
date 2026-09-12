import { describe, expect, it } from 'vitest';
import {
  ESCALERA,
  HOSTS_DE_MODELO,
  MODELO_POR_DEFECTO,
  PISO_WEBGPU_MB,
  SIN_PROBAR,
  appConfigDe,
  elegirModelo,
} from './modelos.js';

const capacidad = (maxBufferMB, maxStorageBindingMB = 2048) => ({
  soportado: true,
  maxBufferMB,
  maxStorageBindingMB,
});

describe('la escalera', () => {
  it('va de más capaz a más liviana, sin empates', () => {
    const pesos = ESCALERA.map((m) => m.vramMB);

    expect(pesos).toEqual([...pesos].sort((a, b) => b - a));
    expect(new Set(pesos).size).toBe(pesos.length);
  });

  /* Si el roadmap dice celulares, el peldaño de celular tiene que EXISTIR en el
     código, no en una promesa. Esto lo vuelve un hecho verificable. */
  it('tiene un peldaño de celular, no solo de escritorio', () => {
    expect(ESCALERA.map((m) => m.peldano)).toContain('celular');
  });

  it('el modelo por defecto es el peldaño más alto', () => {
    expect(MODELO_POR_DEFECTO).toBe(ESCALERA[0].id);
  });

  /* El por defecto lo decidió una MEDICIÓN, no una tabla de tamaños: el 1.5B fue
     el único con 3/3 en extracción de memoria y 3.5x más rápido que el 1B. */
  it('el por defecto es el que ganó el banco', () => {
    expect(MODELO_POR_DEFECTO).toBe('Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  });

  /* Poner un modelo sin medir en producción es exactamente lo que el banco existe
     para evitar. El 3B era el candidato por tabla y nunca se llegó a correr. */
  it('lo que no pasó por el banco no se sirve', () => {
    expect(SIN_PROBAR.length).toBeGreaterThan(0);
    const ids = ESCALERA.map((m) => m.id);
    SIN_PROBAR.forEach((m) => expect(ids).not.toContain(m.id));
    expect(appConfigDe().model_list.map((m) => m.model_id)).toEqual(ids);
  });

  it('cada peldaño declara de dónde salen sus pesos y su runtime', () => {
    appConfigDe().model_list.forEach((m) => {
      expect(HOSTS_DE_MODELO.some((h) => m.model.startsWith(h))).toBe(true);
      expect(HOSTS_DE_MODELO.some((h) => m.model_lib.startsWith(h))).toBe(true);
    });
  });

  /* Importar prebuiltAppConfig metería ~100 destinos externos en el bundle para
     usar uno. La lista de lo que la app puede pedirle a un tercero tiene que
     entrar en una pantalla. */
  it('el AppConfig solo lleva los modelos que elegimos', () => {
    expect(appConfigDe().model_list).toHaveLength(ESCALERA.length);
    expect(appConfigDe().model_list.length).toBeLessThan(10);
  });
});

describe('elegirModelo', () => {
  it('sin WebGPU no hay modelo: se ofrece el nivel 2', () => {
    expect(elegirModelo({ soportado: false })).toBeNull();
    expect(elegirModelo(null)).toBeNull();
  });

  it('elige el peldaño más alto que entra en el presupuesto', () => {
    expect(elegirModelo(capacidad(4096)).peldano).toBe('escritorio');
    expect(elegirModelo(capacidad(1500)).peldano).toBe('celular');
  });

  it('devuelve null cuando no entra ni el más chico', () => {
    expect(elegirModelo(capacidad(256))).toBeNull();
  });

  /* El muro real de los celulares. Un equipo en el piso del spec de WebGPU no
     está diciendo "tengo poca memoria": está diciendo "implementé el mínimo", y
     ahí no entra NINGÚN modelo por más chico que sea. Elegir uno más liviano no
     lo arregla — por eso se corta antes de mirar el presupuesto. */
  it('el piso de maxStorageBufferBindingSize descarta todo, aunque sobre presupuesto', () => {
    expect(elegirModelo(capacidad(8192, PISO_WEBGPU_MB))).toBeNull();
    expect(elegirModelo(capacidad(8192, PISO_WEBGPU_MB + 1))).not.toBeNull();
  });

  it('deja un margen sobre los pesos: la conversación también ocupa', () => {
    const justo = ESCALERA[ESCALERA.length - 1].vramMB;

    expect(elegirModelo(capacidad(Math.ceil(justo)))).toBeNull();
    expect(elegirModelo(capacidad(Math.ceil(justo * 1.2)))).not.toBeNull();
  });
});
