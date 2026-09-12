# @nadie/contracts

Contratos on-chain de Nadie para HashKey Chain Testnet. La cadena es el
notario, no la caja fuerte: aquí solo viven direcciones, hashes, etiquetas de
alcance, enteros y timestamps. Nunca conversaciones, notas, memorias ni
resúmenes, ni siquiera cifrados.

## Contratos

| Contrato | Rol |
|---|---|
| `ProfessionalRegistry` | Credenciales de profesionales verificados: emisión, renovación, suspensión, llave pública de cifrado, KYC opcional. |
| `ConsentRegistry` | Permisos de acceso EIP-712 (2-de-2): grant/revoke con firma, primera apertura registrada, respuesta por hash. |

## Desplegados en HashKey Chain Testnet (chain ID 133)

| Contrato | Dirección | Explorer |
|---|---|---|
| `ProfessionalRegistry` | `0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c` | [ver](https://testnet-explorer.hsk.xyz/address/0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c) |
| `ConsentRegistry` | `0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1` | [ver](https://testnet-explorer.hsk.xyz/address/0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1) |

Verificados on-chain tras el broadcast de Goal 5: admin = deployer
(`0x8A387ef9acC800eea39E3E6A2d92694dB6c813Ac`), verifier habilitado, KYC
desactivado (`address(0)`, nivel 0) y ConsentRegistry conectado al
ProfessionalRegistry desplegado. RPC: `https://testnet.hsk.xyz`.

## Preparación de la cuenta y HSK de testnet

1. Crear una clave dedicada de testnet (nunca una clave real):
   ```bash
   cast wallet new
   ```
2. Obtener HSK de testnet del faucet oficial de HashKey (ver
   https://www.hsk.xyz/ o el explorer para el faucet vigente).
3. Copiar `.env.example` a `.env` (raíz del repo) y completar:
   - `DEPLOYER_PRIVATE_KEY`: la clave de testnet.
   - `PROFESSIONAL_VERIFIER_ADDRESS`: dirección que verificará matrículas.
   - `KYC_ADAPTER_ADDRESS` y `KYC_MINIMUM_LEVEL`: solo si hay adaptador
     KYC; si no, dejarlas vacías/0.

## Dry-run (sin broadcast)

```bash
cd packages/contracts
forge script DeployHashKey --rpc-url hashkey_testnet
```

El script valida todo ANTES de broadcast: chain ID 133, clave presente,
verifier no cero y consistencia KYC (nivel distinto de cero sin adapter
revienta). Si algo falla, no se envía nada.

## Broadcast (solo con autorización del orquestador)

**No ejecutar broadcast sin autorización explícita.** El comando queda
documentado para el despliegue real:

```bash
cd packages/contracts
forge script DeployHashKey \
  --rpc-url hashkey_testnet \
  --broadcast \
  --legacy   # usar solo si HashKey lo requiere; probar primero sin --legacy
```

Orden de despliegue (fijo en el script):
1. `ProfessionalRegistry` (el deployer queda como admin inmutable).
2. Habilitar el verifier.
3. Configurar KYC, solo si hay adapter.
4. `ConsentRegistry` conectado al `ProfessionalRegistry` desplegado.

El script imprime solo las direcciones públicas de ambos contratos. Nunca
imprime la clave.

## Smoke checks con cast (después del broadcast)

Con las direcciones que imprimió el script:

```bash
# Chain ID correcto
cast chain-id --rpc-url https://testnet.hsk.xyz   # debe devolver 133

# Deployer es admin de ProfessionalRegistry
cast call $PROFESSIONAL_REGISTRY_ADDRESS "admin()(address)" --rpc-url https://testnet.hsk.xyz

# Verifier habilitado
cast call $PROFESSIONAL_REGISTRY_ADDRESS "verifiers(address)(bool)" $PROFESSIONAL_VERIFIER_ADDRESS --rpc-url https://testnet.hsk.xyz

# ConsentRegistry conectado al registry correcto
cast call $CONSENT_REGISTRY_ADDRESS "professionalRegistry()(address)" --rpc-url https://testnet.hsk.xyz

# Un consent inexistente es inválido
cast call $CONSENT_REGISTRY_ADDRESS "isValid(bytes32)(bool)" 0x$(printf 'ab%.0s' {1..32}) --rpc-url https://testnet.hsk.xyz
```

## Verificación con el explorer

Abrir cada contrato en https://testnet-explorer.hsk.xyz (búsqueda por
dirección) y verificar en "Contract" que el bytecode coincide con el
compilado (`forge build`), o usar la verificación del explorer si está
disponible. Los eventos `VerifierSet` y la configuración inicial deben verse
en la pestaña de eventos.

## Riesgo del admin inmutable

**El deployer queda como admin INMUTABLE de `ProfessionalRegistry`.**

- Si se pierde la clave del deployer: no se puede habilitar/deshabilitar
  verificadores ni configurar KYC. El registro sigue funcionando para
  lectura, pero la operación queda congelada.
- Si se filtra la clave del deployer: un atacante puede habilitar
  verificadores maliciosos que emitan credenciales falsas.
- Mitigación: clave dedicada de testnet, respaldada antes del broadcast,
  jamás reutilizada en otra red ni en mainnet. Para producción, este
  diseño debe revisarse (multisig como admin) antes del despliegue real.

## Regenerar ABIs

```bash
./abi/regenerate.sh
```

Produce y valida `abi/ProfessionalRegistry.json` y
`abi/ConsentRegistry.json` desde el código fuente con `forge inspect`.

## Tests

```bash
forge test -vv
```

Cubre: ProfessionalRegistry (credenciales, llaves, KYC, suspensión),
ConsentRegistry (EIP-712, nonce, replay, primera apertura, revocación) y
DeployHashKey (validaciones, orden, wiring).
