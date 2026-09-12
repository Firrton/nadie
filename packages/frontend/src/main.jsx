import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { arrancarIA, iaLocalActivada } from './lib/llm/arranque.js';
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

arrancarIA({ activado: iaLocalActivada() }).then(({ puerto, modo, adaptador, modelo }) => {
  raiz.render(<App llm={puerto} />);

  if (adaptador) {
    /* Sin await: la carga corre por detrás mientras la persona usa la app. */
    adaptador.cargar().catch(() => {
      /* Perder el modelo no puede tirar la app: el registro de ánimo sigue
         funcionando entero sin él. Cuando exista el copy, acá va el aviso. */
    });
  }

  if (typeof console !== 'undefined' && modo !== 'demo') {
    console.info('[nadie] inferencia: ' + modo + (modelo ? ' (' + modelo + ')' : ''));
  }
});
