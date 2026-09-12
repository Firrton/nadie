import { describe, expect, it } from 'vitest';
import { crearBoveda } from './boveda.js';

/* Almacén de mentira: la misma forma que el de IndexedDB (get/put/delete de
   bytes por clave string), pero en memoria. Deja ver EXACTAMENTE qué bytes
   terminarían en disco, que es lo que estos tests auditan. */
function almacenEnMemoria() {
  const datos = new Map();
  return {
    datos,
    async get(clave) {
      return datos.get(clave);
    },
    async put(clave, bytes) {
      datos.set(clave, bytes);
    },
    async delete(clave) {
      datos.delete(clave);
    },
  };
}

async function llavesDePrueba() {
  const cifrado = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const identificador = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return { cifrado, identificador };
}

const bytes = (texto) => new TextEncoder().encode(texto);

function contiene(pajar, aguja) {
  for (let i = 0; i + aguja.length <= pajar.length; i += 1) {
    let igual = true;
    for (let j = 0; j < aguja.length && igual; j += 1) igual = pajar[i + j] === aguja[j];
    if (igual) return true;
  }
  return false;
}

describe('crearBoveda', () => {
  it('lo que se guarda se lee igual', async () => {
    const boveda = crearBoveda({ almacen: almacenEnMemoria(), llaves: await llavesDePrueba() });

    await boveda.save('checkin/2026-09-12', bytes('hoy fue un día pesado'));

    expect(await boveda.read('checkin/2026-09-12')).toEqual(bytes('hoy fue un día pesado'));
  });

  /* REGLAS §7.2: lo que se persiste no contiene ninguna de las cadenas
     originales. Y el id TAMBIÉN es una cadena original: "checkin/2026-09-12"
     en claro ya dice qué días hubo check-in. */
  it('en el almacén no queda ni el contenido ni el id en claro', async () => {
    const almacen = almacenEnMemoria();
    const boveda = crearBoveda({ almacen, llaves: await llavesDePrueba() });

    await boveda.save('checkin/2026-09-12', bytes('hoy fue un día pesado'));

    expect(almacen.datos.size).toBe(1);
    for (const [clave, valor] of almacen.datos) {
      expect(clave).not.toContain('checkin');
      expect(clave).not.toContain('2026-09-12');
      expect(contiene(valor, bytes('pesado'))).toBe(false);
    }
  });

  /* El contrato de core: `read` resuelve `undefined` cuando no hay nada. No es un error. */
  it('leer un id que nunca se guardó da undefined', async () => {
    const boveda = crearBoveda({ almacen: almacenEnMemoria(), llaves: await llavesDePrueba() });

    expect(await boveda.read('checkin/2026-01-01')).toBeUndefined();
  });

  it('remove borra el registro del almacén', async () => {
    const almacen = almacenEnMemoria();
    const boveda = crearBoveda({ almacen, llaves: await llavesDePrueba() });
    await boveda.save('checkin/2026-09-12', bytes('hoy fue un día pesado'));

    await boveda.remove('checkin/2026-09-12');

    expect(await boveda.read('checkin/2026-09-12')).toBeUndefined();
    expect(almacen.datos.size).toBe(0);
  });

  /* Quien puede escribir en IndexedDB pero no tiene la llave no puede hacer
     pasar el registro de un día por el de otro. */
  it('un sobre copiado bajo el id de otro registro no se lee', async () => {
    const almacen = almacenEnMemoria();
    const boveda = crearBoveda({ almacen, llaves: await llavesDePrueba() });
    await boveda.save('checkin/2026-09-11', bytes('un buen día'));
    await boveda.save('checkin/2026-09-12', bytes('hoy fue un día pesado'));

    const [[, sobreDel11], [claveDel12]] = almacen.datos;
    almacen.datos.set(claveDel12, sobreDel11);

    await expect(boveda.read('checkin/2026-09-12')).rejects.toThrow();
  });

  /* Borrado por destrucción de llave: los bytes pueden seguir en disco, pero
     con cualquier otra llave no se recuperan. */
  it('con otras llaves, lo guardado no se puede leer', async () => {
    const almacen = almacenEnMemoria();
    await crearBoveda({ almacen, llaves: await llavesDePrueba() }).save('checkin/2026-09-12', bytes('hoy fue un día pesado'));

    /* Con otra llave de identificador, ni siquiera se encuentra el registro. */
    const otra = crearBoveda({ almacen, llaves: await llavesDePrueba() });
    expect(await otra.read('checkin/2026-09-12')).toBeUndefined();

    /* Y aunque alguien le entregue el sobre exacto, sin la llave de cifrado no abre. */
    const [sobre] = almacen.datos.values();
    const conElSobreEnLaMano = crearBoveda({
      almacen: { get: async () => sobre, put: async () => {}, delete: async () => {} },
      llaves: await llavesDePrueba(),
    });
    await expect(conElSobreEnLaMano.read('checkin/2026-09-12')).rejects.toThrow();
  });

  /* Un sobre de un formato que esta versión no conoce no se interpreta con los
     offsets de hoy: se rechaza. Si no, alterar ese byte pasaría desapercibido. */
  it('un sobre con una versión desconocida no se lee', async () => {
    const almacen = almacenEnMemoria();
    const boveda = crearBoveda({ almacen, llaves: await llavesDePrueba() });
    await boveda.save('checkin/2026-09-12', bytes('hoy fue un día pesado'));

    const [sobre] = almacen.datos.values();
    sobre[0] = 99;

    await expect(boveda.read('checkin/2026-09-12')).rejects.toThrow();
  });

  /* Reusar un IV con la misma llave rompe AES-GCM entero: deja recuperar el XOR
     de dos textos y falsificar sobres. Guardar dos veces lo mismo tiene que dar
     sobres distintos. */
  it('guardar dos veces lo mismo usa un IV distinto cada vez', async () => {
    const almacen = almacenEnMemoria();
    const boveda = crearBoveda({ almacen, llaves: await llavesDePrueba() });

    await boveda.save('checkin/2026-09-12', bytes('hoy fue un día pesado'));
    const [primero] = almacen.datos.values();
    await boveda.save('checkin/2026-09-12', bytes('hoy fue un día pesado'));
    const [segundo] = almacen.datos.values();

    expect(segundo.subarray(1, 13)).not.toEqual(primero.subarray(1, 13));
  });
});
