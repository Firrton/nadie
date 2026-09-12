/* Sirve pesos de modelos desde el disco, para el banco de pruebas.
   Herramienta de desarrollo: no entra al producto, no lo importa nadie de src/.

   POR QUÉ EXISTE: la caché del navegador NO se puede reanudar. Si la descarga de
   2 GB se corta —y se cortó, con ERR_NETWORK_CHANGED— WebLLM vuelve a empezar
   de cero. Con los pesos en disco, bajados con `curl -C -`, el A/B se corre
   cuantas veces haga falta sin volver a tocar el CDN.

   TRES COSAS QUE HAY QUE HACER BIEN, Y NINGUNA ES OBVIA:

   1. `resolve/main/`. WebLLM pasa el `model` por cleanModelUrl(), que le agrega
      "resolve/main/" a CUALQUIER url que no lo traiga ya — no solo a las de
      huggingface, es incondicional. Verificado leyendo el fuente de la 0.2.85.
      Así que este servidor habla ese dialecto: saca ese tramo de la ruta. De ese
      modo el appConfig local es idéntico al de producción salvo el host, que es
      justo lo que un A/B honesto necesita.

   2. CORS. La página vive en :5174 y los pesos en :8899. Puertos distintos son
      orígenes distintos, así que sin Access-Control-Allow-Origin el navegador
      bloquea la descarga sin decir gran cosa.

   3. Range. WebLLM pide archivos grandes y puede pedirlos por tramos; un 200 con
      el archivo entero ante un Range es una respuesta incorrecta. */

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const RAIZ = resolve(process.env.MODELOS_DIR || join(process.env.HOME, '.cache', 'nadie-modelos'));
const PUERTO = Number(process.env.PUERTO || 8899);

const TIPOS = {
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.model': 'application/octet-stream',
};

const servidor = createServer((pedido, respuesta) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'range',
    'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges',
  };

  if (pedido.method === 'OPTIONS') {
    respuesta.writeHead(204, cors);
    return respuesta.end();
  }

  /* El dialecto de HuggingFace que WebLLM da por sentado. */
  let ruta = decodeURIComponent(new URL(pedido.url, 'http://x').pathname).replace('/resolve/main/', '/');

  /* Nada de subir por el árbol: este servidor solo existe para una carpeta. */
  const destino = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
  if (!destino.startsWith(RAIZ)) {
    respuesta.writeHead(403, cors);
    return respuesta.end('fuera de la raíz');
  }

  let info;
  try {
    info = statSync(destino);
  } catch (e) {
    respuesta.writeHead(404, cors);
    return respuesta.end('no está: ' + ruta);
  }
  if (info.isDirectory()) {
    respuesta.writeHead(404, cors);
    return respuesta.end('es un directorio');
  }

  const tipo = TIPOS[extname(destino)] || 'application/octet-stream';
  const rango = pedido.headers.range;

  if (rango) {
    const m = /bytes=(\d*)-(\d*)/.exec(rango);
    const desde = m && m[1] ? Number(m[1]) : 0;
    const hasta = m && m[2] ? Number(m[2]) : info.size - 1;
    respuesta.writeHead(206, {
      ...cors,
      'Content-Type': tipo,
      'Accept-Ranges': 'bytes',
      'Content-Range': 'bytes ' + desde + '-' + hasta + '/' + info.size,
      'Content-Length': hasta - desde + 1,
    });
    return createReadStream(destino, { start: desde, end: hasta }).pipe(respuesta);
  }

  respuesta.writeHead(200, {
    ...cors,
    'Content-Type': tipo,
    'Accept-Ranges': 'bytes',
    'Content-Length': info.size,
  });
  createReadStream(destino).pipe(respuesta);
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log('modelos: ' + RAIZ);
  console.log('sirviendo en http://127.0.0.1:' + PUERTO);
});
