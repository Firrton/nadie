import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { arrancarIA } from './lib/llm/arranque.js';
import { crearSeguimientoDeCarga } from './lib/llm/carga.js';
import { asegurarPersistencia } from './lib/persistencia.js';
import { caminoDeDemoActivado } from './lib/caminoDeDemo.js';
import { configDeCompartir } from './lib/compartir/red.js';
import { crearCadena } from './lib/compartir/cadena.js';
import { cargarOCrearCuenta } from './lib/compartir/cuenta.js';
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

   EL MODELO REAL ES EL ÚNICO CAMINO (ver arranque.js). La conversación es por
   texto: no hay voz real todavía; si el equipo no puede con el modelo, se
   muestra la pantalla de sin soporte en vez de fingir una conversación. El copy
   de esa espera sigue pendiente de marca. */
const raiz = createRoot(document.getElementById('root'));

const seguimiento = crearSeguimientoDeCarga();
let carga = null;
let puertoActual = null;
const seedDemo = caminoDeDemoActivado();

/* Compartir se arma acá, y solo si el entorno lo configuró entero. Sin config,
   `compartir` es null y la app ni siquiera ofrece el botón. La cuenta se carga
   recién al enviar: abrir la app no crea llaves. */
const configCompartir = configDeCompartir();
const compartir = configCompartir
  ? { config: configCompartir, cadena: crearCadena({ config: configCompartir }), cuenta: () => cargarOCrearCuenta() }
  : null;

function dibujar() {
  raiz.render(<App llm={puertoActual} carga={carga} seedDemo={seedDemo} compartir={compartir} />);
}

arrancarIA({
  onProgreso: (p) => {
    seguimiento.registrar(p);
    carga = { estado: 'cargando', ...seguimiento.estado() };
    dibujar();
  },
}).then(({ puerto, modo, adaptador, modelo }) => {
  puertoActual = puerto;

  carga = modo === 'local' ? { estado: 'cargando', porcentaje: 0, segundosRestantes: null }
    : { estado: 'sin-soporte' };
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

  if (typeof console !== 'undefined') {
    console.info('[nadie] inferencia: ' + modo + (modelo ? ' (' + modelo + ')' : ''));
  }
});
