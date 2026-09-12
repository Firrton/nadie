import { FRASES_DE_ESPERA } from '../../data/content.js';

/* La espera de la primera carga: qué se sabe y qué NO se puede prometer.

   SOBRE EL TIEMPO ESTIMADO. Medimos el ancho de banda al CDN tres veces el mismo
   día: 37 KB/s, 156 KB/s y 3.4 MB/s. Un estimado calculado con el primer minuto
   puede errar por un factor de 50. Y en una app cuyo diferencial es no prometer
   de más, decir "15 minutos" y tardar dos horas traiciona exactamente lo que
   vende.

   Por eso el estimado NO sale hasta que la medición se sostiene: hacen falta
   varias muestras, un piso de tiempo, y que la velocidad reciente no se haya
   movido de golpe. Mientras tanto hay porcentaje —que es un hecho— y una frase.
   Preferimos no decir nada antes que decir un número que se va a caer. */

const MIN_MUESTRAS = 4;
const MIN_SEGUNDOS = 15;
/* Cuánto puede moverse la velocidad entre dos mitades de la ventana sin que
   dejemos de creerle. 2 = una puede ser el doble de la otra. */
const TOLERANCIA = 2;

export function crearSeguimientoDeCarga({ ahora = () => Date.now() } = {}) {
  const muestras = [];
  const t0 = ahora();

  return {
    /* Recibe el progreso de WebLLM: { progress: 0..1 }. */
    registrar(progreso) {
      const fraccion = progreso && typeof progreso.progress === 'number' ? progreso.progress : null;
      if (fraccion == null || !Number.isFinite(fraccion)) return;
      muestras.push({ ms: ahora() - t0, fraccion: Math.min(1, Math.max(0, fraccion)) });
    },

    estado() {
      const ultima = muestras[muestras.length - 1];
      const fraccion = ultima ? ultima.fraccion : 0;
      return {
        porcentaje: Math.round(fraccion * 100),
        segundosRestantes: this.estimar(),
      };
    },

    /* null significa "todavía no sé", y es una respuesta legítima. */
    estimar() {
      if (muestras.length < MIN_MUESTRAS) return null;

      const ultima = muestras[muestras.length - 1];
      if (ultima.ms < MIN_SEGUNDOS * 1000) return null;
      if (ultima.fraccion <= 0) return null;
      if (ultima.fraccion >= 1) return 0;

      /* Se compara la velocidad de la primera mitad de la ventana contra la de la
         segunda. Si cambiaron mucho, la red está inestable y cualquier número
         que demos va a envejecer mal en un minuto. */
      const medio = muestras[Math.floor(muestras.length / 2)];
      const vPrimera = medio.ms > 0 ? medio.fraccion / medio.ms : 0;
      const vSegunda = ultima.ms > medio.ms
        ? (ultima.fraccion - medio.fraccion) / (ultima.ms - medio.ms)
        : 0;
      if (vPrimera <= 0 || vSegunda <= 0) return null;

      const razon = vPrimera > vSegunda ? vPrimera / vSegunda : vSegunda / vPrimera;
      if (razon > TOLERANCIA) return null;

      const velocidad = ultima.fraccion / ultima.ms;
      return Math.round(((1 - ultima.fraccion) / velocidad) / 1000);
    },
  };
}

/* Rota las frases sin repetir hasta agotarlas. El orden arranca en un punto al
   azar para que dos personas que instalan a la vez no vean lo mismo, pero es
   determinista si se le pasa el índice: así se puede probar. */
export function fraseDeEspera(indice, frases = FRASES_DE_ESPERA) {
  if (!frases.length) return null;
  const i = ((indice % frases.length) + frases.length) % frases.length;
  return frases[i];
}

export function indiceInicial(aleatorio = Math.random, frases = FRASES_DE_ESPERA) {
  return Math.floor(aleatorio() * frases.length);
}
