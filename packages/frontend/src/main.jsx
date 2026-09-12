import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { arrancarIA, iaLocalActivada } from './lib/llm/arranque.js';
import { crearSeguimientoDeCarga } from './lib/llm/carga.js';
import { asegurarPersistencia } from './lib/persistencia.js';
import './styles/styles.css';
import './styles/theme.css';

/* Raíz de composición. Es el ÚNICO archivo que sabe que existe WebLLM, y ni
   siquiera lo importa: se lo pregunta a arranque.js. Ninguna pantalla toca el
   modelo, y esa es la regla que el README tiene que decir (hoy dice otra cosa,
   y nombra paquetes que no existen).

   LA APP SE DIBUJA ANTES DE QUE EL MODELO ESTÉ LISTO, a propósito. Bajar los
   pesos tarda minutos y el registro de ánimo, el check-in y "Tu camino" NO
   necesitan modelo: hacer esperar a alguien para que pueda anotar cómo se siente
   sería regalar la única parte que ya funciona.

   PENDIENTE, Y BLOQUEADO POR COPY: mientras carga, quien intente hablar vuelve a
   idle sin explicación. Falta lo que dice la pantalla mientras bajan 873 MB y lo
   que dice si el equipo no puede. El copy del proyecto es final y no se inventa,
   así que la IA local queda detrás de un flag hasta entonces (REGLAS §5). */
const raiz = createRoot(document.getElementById('root'));

const seguimiento = crearSeguimientoDeCarga();
let carga = null;
let puertoActual = null;

function dibujar() {
  raiz.render(<App llm={puertoActual} carga={carga} />);
}

arrancarIA({
  activado: iaLocalActivada(),
  onProgreso: (p) => {
    seguimiento.registrar(p);
    carga = { estado: 'cargando', ...seguimiento.estado() };
    dibujar();
  },
}).then(({ puerto, modo, adaptador, modelo }) => {
  puertoActual = puerto;

  /* 'demo' no muestra espera: no hay nada que esperar. */
  carga = modo === 'local' ? { estado: 'cargando', porcentaje: 0, segundosRestantes: null }
    : modo === 'sin-soporte' ? { estado: 'sin-soporte' }
      : null;
  dibujar();

  if (adaptador) {
    /* Antes de bajar 873 MB, pedir que el navegador no los borre. Sin await: si
       lo niegan, la descarga sigue igual — lo que se pierde es la garantía de que
       no haya que repetirla. */
    asegurarPersistencia();

    /* Sin await: la carga corre por detrás mientras la persona usa la app. */
    adaptador.cargar().then(
      (r) => {
        carga = { estado: 'listo' };
        dibujar();
        if (typeof console !== 'undefined') {
          console.info('[nadie] modelo listo: ' + r.modelo
            + (r.descartados.length ? ' (descartados: ' + r.descartados.join(', ') + ')' : ''));
        }
      },
      () => {
        /* Ni un modelo de la escalera cargó. Perder el modelo no puede tirar la
           app: el registro de ánimo sigue funcionando entero sin él. */
        carga = { estado: 'sin-soporte' };
        dibujar();
      },
    );
  }

  if (typeof console !== 'undefined' && modo !== 'demo') {
    console.info('[nadie] inferencia: ' + modo + (modelo ? ' (' + modelo + ')' : ''));
  }
});
