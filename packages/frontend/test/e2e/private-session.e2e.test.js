import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/* La prueba de runtime de la frase central del README:

     "a complete private session makes zero outbound network requests"

   El otro test (test/no-external-requests.test.js) revisa fuente y bundle, y
   corre siempre. Este abre un navegador de verdad, hace una sesión completa
   sobre el BUILD DE PRODUCCIÓN y mira cada petición que sale.

   Por qué page.on('request') y no performance.getEntriesByType: el evento del
   navegador ve todo lo que se intenta, incluso lo que falla, se aborta o no
   deja entrada de resource timing — beacons, preflights, websockets. La API de
   performance solo ve lo que llegó a completarse.

   NO corre con `pnpm test`. El suite por defecto no puede depender de que
   alguien haya bajado 94MB de Chromium: en la máquina del demo eso sería un
   rojo por infraestructura, no por el código. Se invoca aparte:

     pnpm test:e2e

   y si falta el navegador, falla fuerte diciendo qué comando correr. */

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const PAQUETE = join(AQUI, '..', '..');
const PUERTO = 4178;
const BASE = 'http://127.0.0.1:' + PUERTO;

let servidor;

async function esperarAlServidor(intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch (e) {
      // todavía no levantó
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('el preview no respondió en ' + BASE);
}

beforeAll(async () => {
  if (!existsSync(join(PAQUETE, 'dist'))) {
    throw new Error('falta dist/. Corré `pnpm build` antes, o usá `pnpm test:e2e` que ya lo hace.');
  }
  /* --host 127.0.0.1 es a propósito: por defecto vite escucha en localhost, que
     en esta máquina resuelve a [::1], y el chequeo por IPv4 nunca conectaba. */
  servidor = spawn(
    join(PAQUETE, 'node_modules/.bin/vite'),
    ['preview', '--port', String(PUERTO), '--strictPort', '--host', '127.0.0.1'],
    { cwd: PAQUETE, stdio: 'ignore' },
  );
  await esperarAlServidor();
}, 60000);

afterAll(() => {
  if (servidor) servidor.kill();
});

describe('una sesión privada completa no hace ninguna petición hacia afuera', () => {
  it('recorre las seis pantallas sin hablar con nadie', async () => {
    let navegador;
    try {
      navegador = await chromium.launch();
    } catch (e) {
      throw new Error(
        'no se pudo abrir Chromium. Corré: pnpm --filter @nadie/frontend exec playwright install chromium\n' + e.message,
      );
    }

    const contexto = await navegador.newContext({ viewport: { width: 375, height: 812 } });
    const pagina = await contexto.newPage();

    const peticiones = [];
    const websockets = [];
    pagina.on('request', (req) => peticiones.push(req.url()));
    pagina.on('websocket', (ws) => websockets.push(ws.url()));

    try {
      await pagina.goto(BASE, { waitUntil: 'networkidle' });

      // onboarding
      await pagina.getByRole('button', { name: 'Pasa' }).click();
      await pagina.getByRole('button', { name: 'Sí, tengo 18 o más' }).click();
      await pagina.getByRole('button', { name: 'Entrar' }).click();

      // home -> mantener presionado para abrir sesión (más de 250ms, si no se ignora)
      const orbe = pagina.getByRole('button', { name: 'Mantén presionado para hablar' });
      await orbe.hover();
      await pagina.mouse.down();
      await pagina.waitForTimeout(600);
      await pagina.mouse.up();

      // conversación: el camino de texto, que es el que corre sin micrófono
      const campo = pagina.getByLabel('Escribe lo que quieras decir');
      await campo.waitFor({ state: 'visible' });
      await campo.fill('Probando una sesión entera sin red.');
      await pagina.getByRole('button', { name: 'Enviar' }).click();
      await expect.poll(() => pagina.getByText('Probando una sesión entera sin red.').count()).toBeGreaterThan(0);

      await pagina.getByRole('button', { name: 'Terminar' }).click();

      // cierre: calificar y dejar una nota
      await pagina.getByRole('button', { name: 'Arriba', exact: true }).click();
      await pagina.getByRole('button', { name: '¿Quieres agregar algo?' }).click();
      await pagina.getByLabel('Si quieres, cuenta por qué').fill('Quedó escrito, y no salió de acá.');
      await pagina.waitForTimeout(900); // que pase el debounce del autoguardado

      // camino y ajustes
      await pagina.getByRole('button', { name: 'Ver tu camino' }).click();
      await pagina.getByRole('button', { name: 'Ajustes' }).click();
      await expect.poll(() => pagina.getByText('Privacidad').count()).toBeGreaterThan(0);

      // el registro quedó en el dispositivo, no en un servidor
      const guardado = await pagina.evaluate(() => localStorage.getItem('nadie.mood'));
      expect(guardado).toContain('"note"');

      const externas = peticiones.filter((url) => !url.startsWith(BASE));
      expect({ externas, websockets }).toEqual({ externas: [], websockets: [] });

      // y que el test haya mirado algo: una sesión real pide decenas de cosas locales
      expect(peticiones.length).toBeGreaterThan(5);
    } finally {
      await navegador.close();
    }
  }, 120000);
});
