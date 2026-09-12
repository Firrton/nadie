import { describe, expect, it } from 'vitest';
import { FRASES_DE_ESPERA } from '../../data/content.js';
import { crearSeguimientoDeCarga, fraseDeEspera, indiceInicial } from './carga.js';

function seguimiento(pasos) {
  let t = 0;
  const s = crearSeguimientoDeCarga({ ahora: () => t });
  pasos.forEach(([ms, fraccion]) => { t = ms; s.registrar({ progress: fraccion }); });
  return s;
}

describe('porcentaje', () => {
  it('arranca en 0 y sigue la última muestra', () => {
    expect(crearSeguimientoDeCarga().estado().porcentaje).toBe(0);
    expect(seguimiento([[1000, 0.42]]).estado().porcentaje).toBe(42);
  });

  it('ignora lo que no es un progreso', () => {
    const s = seguimiento([[1000, 0.5]]);
    s.registrar(null);
    s.registrar({ progress: 'mucho' });

    expect(s.estado().porcentaje).toBe(50);
  });
});

/* Medimos 37 KB/s, 156 KB/s y 3.4 MB/s el mismo día. Un estimado hecho con el
   primer minuto puede errar por un factor de 50, y esta app no puede permitirse
   prometer un número que se va a caer. */
describe('el estimado no sale hasta que la medición se sostiene', () => {
  it('no estima con pocas muestras', () => {
    expect(seguimiento([[5000, 0.1], [9000, 0.2]]).estimar()).toBeNull();
  });

  it('no estima en los primeros segundos, por más muestras que haya', () => {
    expect(seguimiento([[1000, 0.1], [2000, 0.2], [3000, 0.3], [4000, 0.4]]).estimar()).toBeNull();
  });

  it('estima cuando la velocidad se mantiene', () => {
    const s = seguimiento([[10000, 0.1], [20000, 0.2], [30000, 0.3], [40000, 0.4]]);

    // 40s para el 40% => faltan 60s para el 60% restante.
    expect(s.estimar()).toBe(60);
  });

  /* La red se cayó a la mitad: cualquier número que demos envejece mal. */
  it('deja de estimar si la velocidad se desploma', () => {
    const s = seguimiento([[10000, 0.2], [20000, 0.4], [30000, 0.42], [40000, 0.43]]);

    expect(s.estimar()).toBeNull();
  });

  it('deja de estimar si se dispara', () => {
    const s = seguimiento([[10000, 0.02], [20000, 0.04], [30000, 0.3], [40000, 0.6]]);

    expect(s.estimar()).toBeNull();
  });

  it('al terminar no quedan segundos', () => {
    expect(seguimiento([[10000, 0.3], [20000, 0.6], [30000, 0.9], [40000, 1]]).estimar()).toBe(0);
  });
});

describe('frases de espera', () => {
  it('las eligió el equipo y cada una trae su autor', () => {
    expect(FRASES_DE_ESPERA.length).toBeGreaterThan(10);
    FRASES_DE_ESPERA.forEach((f) => {
      expect(f.texto.length).toBeGreaterThan(20);
      expect(f.autor.length).toBeGreaterThan(3);
    });
  });

  it('rota sin salirse, incluso con índices grandes o negativos', () => {
    expect(fraseDeEspera(0)).toBe(FRASES_DE_ESPERA[0]);
    expect(fraseDeEspera(FRASES_DE_ESPERA.length)).toBe(FRASES_DE_ESPERA[0]);
    expect(fraseDeEspera(-1)).toBe(FRASES_DE_ESPERA[FRASES_DE_ESPERA.length - 1]);
  });

  it('el arranque es al azar pero cae siempre dentro', () => {
    expect(indiceInicial(() => 0)).toBe(0);
    expect(indiceInicial(() => 0.999)).toBe(FRASES_DE_ESPERA.length - 1);
  });
});
