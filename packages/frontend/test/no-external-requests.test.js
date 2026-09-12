import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ESCALERA, HOSTS_DE_MODELO } from '../src/lib/llm/modelos.js';

/* El README promete, textualmente:

     "After the model and application assets are cached, a complete private
      session makes zero outbound network requests, and there is a test that
      proves it."

   Este es ese test. Existe porque la promesa ya se rompió una vez: index.html
   cargaba las tipografías desde fonts.googleapis.com, y lo encontró una persona
   leyendo el HTML, no una corrida de tests. Una app que se presenta como local
   no puede depender de que alguien se acuerde de mirar.

   QUÉ PRUEBA: que ni el código fuente ni el build contienen una URL externa en
   una posición que dispare una petición — un <link>, un src, un url() de CSS,
   un fetch con destino literal.

   QUÉ NO PRUEBA: que en tiempo de ejecución no se arme una URL dinámicamente.
   Eso necesita un navegador de verdad (Playwright) y queda como el siguiente
   escalón. La aserción equivalente en runtime es:

     performance.getEntriesByType('resource')
       .map((r) => r.name)
       .filter((n) => !n.startsWith(location.origin))   // debe dar [] */

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const PAQUETE = join(AQUI, '..');

/* Namespaces XML: son identificadores, no destinos. El navegador nunca los pide. */
const NAMESPACES = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1998/Math/MathML',
];

/* LOS PESOS DEL MODELO SON LA ÚNICA EXCEPCIÓN, Y ES DELIBERADA.

   La promesa del README está redactada con su alcance: "AFTER the model and
   application assets are cached, a complete private session makes zero outbound
   network requests". Bajar los pesos no es una sesión — pasa una vez, antes de
   que exista una conversación, y sin ella no hay IA local en absoluto.

   Pero "hay una excepción" es justo donde se entierran las violaciones reales,
   así que la excepción es de UN archivo y de DOS hosts, ambos declarados en el
   código que se usa (no en una constante de este test que podría quedar vieja).
   Cualquier otro archivo de src/ que nombre un origen externo sigue siendo un
   error, y cualquier otro host también.

   Esto es MÁS estricto que antes, no menos: antes el test decía "ninguna URL";
   ahora dice "ninguna URL, salvo estos dos hosts y solo desde este archivo". */
const ARCHIVO_DE_MODELOS = join('src', 'lib', 'llm', 'modelos.js');

/* Excepciones que valen SOLO para el bundle, nunca para código nuestro.

   - React arma el texto de sus errores minificados concatenando esta URL
     ("visit ... for the full message"). Es un string dentro de un Error, no un
     destino. Si algún día eso cambiara, lo cazaría el test de runtime con
     Playwright, no este. */
const VENDOR_EN_BUNDLE = [
  'https://reactjs.org/docs/error-decoder.html',
  'https://react.dev/errors',
  /* WebLLM la nombra dentro del texto de WebGPUNotAvailableError ("...visit
     https://webgpureport.org/"). Verificado leyendo el bundle: aparece solo
     adentro de ese mensaje, nunca como destino. Misma categoría que la de React. */
  'https://webgpureport.org/',
];

/* Los comentarios se sacan ANTES de buscar. Si no, este mismo archivo — que
   nombra fonts.googleapis.com para explicar por qué existe — se marcaría a sí
   mismo, y un test que da falsos positivos termina siendo un test que se ignora. */
function sinComentarios(texto) {
  return texto
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // el negative lookbehind evita comerse el "//" de "https://"
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function urlsExternas(texto, permitidas = []) {
  const limpio = sinComentarios(texto);
  const encontradas = limpio.match(/https?:\/\/[^\s"'`)<>\\]+/g) || [];
  const ignorables = [...NAMESPACES, ...permitidas];
  return encontradas.filter((url) => !ignorables.some((ok) => url.startsWith(ok)));
}

function archivosDe(dir, extensiones) {
  if (!existsSync(dir)) return [];
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      salida.push(...archivosDe(ruta, extensiones));
    } else if (extensiones.some((ext) => nombre.endsWith(ext)) && !nombre.endsWith('.test.js')) {
      salida.push(ruta);
    }
  }
  return salida;
}

function violaciones(archivos, permitidas = []) {
  const encontradas = [];
  for (const ruta of archivos) {
    for (const url of urlsExternas(readFileSync(ruta, 'utf8'), permitidas)) {
      encontradas.push(relative(PAQUETE, ruta) + ' -> ' + url);
    }
  }
  return encontradas;
}

describe('la app no habla con terceros', () => {
  it('el código fuente no referencia ningún origen externo', () => {
    const archivos = [
      join(PAQUETE, 'index.html'),
      ...archivosDe(join(PAQUETE, 'src'), ['.js', '.jsx', '.css', '.html']),
    ].filter(existsSync);

    // Si esto da 0 archivos, el test estaría pasando por no mirar nada.
    expect(archivos.length).toBeGreaterThan(10);

    const otros = archivos.filter((r) => !relative(PAQUETE, r).endsWith(ARCHIVO_DE_MODELOS));
    expect(violaciones(otros)).toEqual([]);
  });

  it('solo el catálogo de modelos nombra un origen externo, y solo los hosts que declara', () => {
    const catalogo = join(PAQUETE, ARCHIVO_DE_MODELOS);
    expect(existsSync(catalogo)).toBe(true);

    // Sin la lista blanca tiene que haber URLs: si no, el archivo dejó de ser lo que es.
    expect(violaciones([catalogo]).length).toBeGreaterThan(0);
    // Con ella, ninguna.
    expect(violaciones([catalogo], HOSTS_DE_MODELO)).toEqual([]);
  });

  it('el build tampoco, si ya se compiló', () => {
    const dist = join(PAQUETE, 'dist');
    if (!existsSync(dist)) {
      // No se rompe el suite por no haber compilado; el test de fuente ya corrió.
      console.warn('[no-external-requests] sin dist/: corré `pnpm build` para cubrir también el bundle');
      return;
    }
    const permitidas = [...VENDOR_EN_BUNDLE, ...HOSTS_DE_MODELO];
    expect(violaciones(archivosDe(dist, ['.js', '.css', '.html']), permitidas)).toEqual([]);
  });

  /* WebLLM entra por import() dinámico, así que vive en su propio chunk. Abrir
     Nadie y mirar "Tu camino" no baja un intérprete de LLMs de 6 MB.

     OJO CON CÓMO SE MIDE: no alcanza con pedir que el chunk de entrada no tenga
     URLs de huggingface, porque NUESTRO catálogo declara dos hosts y esos sí
     viven ahí (son strings inertes hasta que alguien abre una sesión). Lo que
     distingue un caso del otro es la CANTIDAD: nosotros declaramos tres modelos;
     el prebuiltAppConfig de WebLLM trae ~100, cada uno con sus pesos y su wasm.
     Si alguien cambia el import() por uno estático, o importa prebuiltAppConfig,
     acá aparecen cientos de URLs y esto se pone rojo. */
  it('el chunk que abre la app no arrastra WebLLM ni su catálogo de ~100 modelos', () => {
    const dist = join(PAQUETE, 'dist');
    if (!existsSync(dist)) return;

    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const entradas = [...html.matchAll(/src="\/?([^"]+\.js)"/g)].map((m) => join(dist, m[1]));
    expect(entradas.length).toBeGreaterThan(0);

    // Ningún origen que no sea uno de los nuestros.
    expect(violaciones(entradas, [...VENDOR_EN_BUNDLE, ...HOSTS_DE_MODELO])).toEqual([]);

    // Y solo los que declaramos: un catálogo ajeno se delata por el volumen.
    const distintas = new Set(
      entradas.flatMap((ruta) => urlsExternas(readFileSync(ruta, 'utf8'), VENDOR_EN_BUNDLE)),
    );
    expect(distintas.size).toBeLessThanOrEqual(2 * ESCALERA.length);
  });

  it('detecta una regresión: un <link> a un CDN tiene que fallar', () => {
    // El bug real que motivó este archivo, como caso de prueba.
    const htmlRoto = '<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet" />';
    expect(urlsExternas(htmlRoto)).toHaveLength(1);

    // Y el control: un namespace de SVG NO es una petición.
    expect(urlsExternas('<svg xmlns="http://www.w3.org/2000/svg" />')).toEqual([]);

    // Y un comentario que nombra un dominio tampoco.
    expect(urlsExternas('/* no agregar links a https://fonts.googleapis.com */')).toEqual([]);
  });
});
