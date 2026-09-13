import { describe, expect, it } from 'vitest';
import { unaALaVez } from './unaALaVez.js';

function promesaControlada() {
  let resolver;
  let rechazar;
  const promesa = new Promise((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

describe('unaALaVez', () => {
  /* Dos toques a "Firmar y enviar" antes de que React re-dibuje leían el mismo
     nonce on-chain: la segunda transacción revertía después de pagar gas. */
  it('mientras la primera llamada sigue en curso, ignora las demás', async () => {
    const control = promesaControlada();
    let llamadas = 0;
    const enviar = unaALaVez(() => {
      llamadas += 1;
      return control.promesa;
    });

    enviar();
    enviar();
    enviar();
    control.resolver();
    await control.promesa;

    expect(llamadas).toBe(1);
  });

  it('cuando termina, vuelve a aceptar una llamada nueva', async () => {
    let llamadas = 0;
    const enviar = unaALaVez(async () => {
      llamadas += 1;
    });

    await enviar();
    await enviar();

    expect(llamadas).toBe(2);
  });

  /* Un envío que falla tiene que dejar reintentar. */
  it('si la llamada falla, también libera', async () => {
    let llamadas = 0;
    const enviar = unaALaVez(async () => {
      llamadas += 1;
      throw new Error('gateway-rechazo-503');
    });

    await enviar().catch(() => {});
    await enviar().catch(() => {});

    expect(llamadas).toBe(2);
  });
});
