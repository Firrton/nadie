import { describe, expect, it } from 'vitest';
import { keccak256, recoverTypedDataAddress, stringToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { GRANT_TYPES, armarGrant } from './consentimiento.js';

const cuenta = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

const pedido = {
  chainId: 133,
  verifyingContract: '0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1',
  consentId: '0x' + '11'.repeat(32),
  user: cuenta.address,
  professional: '0x00000000000000000000000000000000000000aa',
  packageHash: '0x' + '22'.repeat(32),
  scope: 'graph-summary',
  expiresAt: 1789000000,
  nonce: 3n,
  deadline: 1788000000n,
};

describe('armarGrant', () => {
  /* Si el dominio o los tipos no son EXACTAMENTE los del contrato, la firma
     recupera otra dirección y el relayer responde 422. Recuperar la firma es la
     única forma de probarlo sin cadena. */
  it('la firma del mensaje recupera la cuenta que firmó', async () => {
    const { typedData } = armarGrant(pedido);
    const firma = await cuenta.signTypedData(typedData);

    expect(await recoverTypedDataAddress({ ...typedData, signature: firma })).toBe(cuenta.address);
  });

  it('usa el dominio y los tipos del ConsentRegistry', () => {
    const { typedData } = armarGrant(pedido);

    expect(typedData.domain).toEqual({
      name: 'NadieConsentRegistry',
      version: '1',
      chainId: 133,
      verifyingContract: pedido.verifyingContract,
    });
    expect(typedData.types).toBe(GRANT_TYPES);
    expect(typedData.primaryType).toBe('Grant');
    expect(typedData.message.scope).toBe(keccak256(stringToBytes('graph-summary')));
  });

  /* La trampa: se firma con Number/BigInt, pero el relayer exige STRINGS
     decimales en el JSON. BigInt ni siquiera pasa por JSON.stringify. */
  it('el cuerpo para el relayer lleva los números como strings decimales', () => {
    const { cuerpoParaRelayer } = armarGrant(pedido);
    const cuerpo = cuerpoParaRelayer('0x' + 'ab'.repeat(65));

    expect(cuerpo.message.expiresAt).toBe('1789000000');
    expect(cuerpo.message.nonce).toBe('3');
    expect(cuerpo.message.deadline).toBe('1788000000');
    expect(cuerpo.signature).toBe('0x' + 'ab'.repeat(65));
    expect(() => JSON.stringify(cuerpo)).not.toThrow();
  });
});
