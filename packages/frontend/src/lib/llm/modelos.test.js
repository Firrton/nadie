import { describe, expect, it } from 'vitest';
import {
  ESCALERA,
  HOSTS_DE_MODELO,
  MODELO_POR_DEFECTO,
  PISO_WEBGPU_MB,
  SIN_PROBAR,
  appConfigDe,
  elegirModelo,
  escaleraQueEntra,
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

  /* El por defecto lo decide una MEDICIÓN, no una tabla de tamaños. El 24-sep,
     con los prompts por modo, en WebLLM real y lectura ciega doble de 138
     respuestas por modelo, Qwen3-1.7B tuvo 5 respuestas graves contra 18 de
     Qwen3.5-2B y 44 de la base, sin medicamentos y con la misma latencia
     (research/model-evaluation/modes). */
  it('el por defecto es el que ganó el banco', () => {
    expect(MODELO_POR_DEFECTO).toBe('Qwen3-1.7B-q4f16_1-MLC');
  });

  /* El 1.5B deja de ser el por defecto pero sigue siendo mejor que el 1B: es el
     peldaño para equipos donde el 1.7B no entra. */
  it('entre el por defecto y el de celular queda un peldaño intermedio', () => {
    expect(escaleraQueEntra(capacidad(2000)).map((m) => m.peldano)).toEqual(['intermedio', 'celular']);
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

describe('escaleraQueEntra', () => {
  it('devuelve todos los que entran, no solo el mejor: es el plan B escrito', () => {
    expect(escaleraQueEntra(capacidad(4096))).toHaveLength(ESCALERA.length);
    expect(escaleraQueEntra(capacidad(1500)).map((m) => m.peldano)).toEqual(['celular']);
    expect(escaleraQueEntra(capacidad(256))).toEqual([]);
  });

  it('mantiene el orden de la escalera', () => {
    const ids = escaleraQueEntra(capacidad(4096)).map((m) => m.id);
    expect(ids).toEqual(ESCALERA.map((m) => m.id));
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
