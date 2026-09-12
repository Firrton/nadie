# @nadie/gateway

Gateway de paquetes cifrados. Guarda y entrega únicamente ciphertext; la
entrega exige un permiso válido on-chain y que el profesional ya haya llamado
`open()`. El gateway **nunca descifra, nunca tiene llaves blockchain, nunca
firma transacciones y nunca llama `open()`**. Falla cerrado ante errores RPC.

## Flujo

```
upload → grant → open → challenge → access
```

1. **upload** — el dispositivo cifra el paquete (formato v1 de `@nadie/core`),
   calcula `packageHash` (Keccak-256 de la serialización canónica) y hace
   `PUT /v1/packages/:packageHash` con los bytes canónicos. El gateway
   re-deriva el hash y lo exige igual al path.
2. **grant** — el usuario firma EIP-712 y el ConsentRegistry registra el
   permiso con el packageHash. El gateway no participa.
3. **open** — el profesional llama `open()` en ConsentRegistry; queda
   `firstOpenedAt > 0` on-chain. El gateway no participa.
4. **challenge** — el portal del profesional pide un challenge
   (`POST /v1/access/challenges`) y firma el mensaje EIP-191 con su clave.
5. **access** — `POST /v1/packages/:consentId/access` con challengeId y
   firma. El gateway verifica firma, lee el consentimiento en UN bloque
   exacto, exige validez + primera apertura + profesional coincidente y
   entrega los bytes canónicos.

## API

| Método y ruta | Descripción |
|---|---|
| `PUT /v1/packages/:packageHash` | Sube el paquete cifrado (octet-stream, ≤ 1 MiB). 201 con `storedUntil` y `deletionToken`; duplicado 409. |
| `POST /v1/access/challenges` | Body `{"consentId","professional"}`. Devuelve `challengeId`, `message` (EIP-191) y `expiresAt`. No consulta chain ni storage. |
| `POST /v1/packages/:consentId/access` | Body `{"challengeId","signature"}`. Verifica firma y permiso on-chain; devuelve bytes canónicos. |
| `DELETE /v1/packages/:packageHash` | `Authorization: Bearer <deletionToken>`. Comparación constant-time. |
| `GET /healthz` | `{"status":"ok"}`. |

Errores uniformes: `INVALID_REQUEST` 400, `PAYLOAD_TOO_LARGE` 413,
`NOT_AUTHORIZED` 404 (idéntico para todo rechazo de acceso, sin revelar la
causa), `UNAVAILABLE` 503 ante fallo RPC. Nunca hay stacks, errores upstream,
firmas, tokens, envelopes ni motivos on-chain en las respuestas.

## Variables

```
HASHKEY_RPC_URL=https://testnet.hsk.xyz
HASHKEY_CHAIN_ID=133
CONSENT_REGISTRY_ADDRESS=0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1
GATEWAY_URL=http://localhost:8787
GATEWAY_PORT=8787
GATEWAY_STORAGE_DIR=.data/gateway
GATEWAY_ALLOWED_ORIGIN=http://localhost:5173
GATEWAY_MAX_PACKAGE_BYTES=1048576
GATEWAY_RETENTION_SECONDS=604800
GATEWAY_CHALLENGE_TTL_SECONDS=60
```

Validación estricta al arrancar (fail-fast): el proceso termina si falta
alguna variable o el RPC no reporta chain ID 133.

## Ejecución local

```
pnpm --filter @nadie/gateway dev
```

## Verificación del hash

El `packageHash` del path se valida como bytes32 canónico (`0x` + 64 hex
minúsculas). El gateway deserializa el envelope, lo re-serializa
canónicamente y recalcula Keccak-256; debe coincidir exactamente. Solo se
guardan los bytes canónicos. En cada entrega se revalida estructura y hash
del blob guardado para detectar corrupción.

## Retención y eliminación

- Retención por defecto: 7 días (`storedUntil`). `sweepExpired` al arrancar y
  limpieza lazy en cada upload.
- `deletionToken` aleatorio de 32 bytes (base64url), entregado una sola vez
  en el 201. Se guarda solo su SHA-256. `DELETE` compara en constant-time;
  token inválido y paquete inexistente devuelven el mismo 404.

## Privacidad y límites

- El gateway jamás descifra: no tiene llaves blockchain ni de cifrado.
- **Revocación**: bloquea entregas futuras de inmediato, pero no borra copias
  ya descargadas por el profesional.
- **Snapshot**: las lecturas `consents()` e `isValid()` usan exactamente el
  mismo `blockNumber` observado. La decisión refleja ese bloque; una
  reorganización posterior de la cadena podría, en teoría, revertirlo. En
  HashKey Testnet la finalidad es rápida, pero el gateway no espera
  finalidad adicional — es un límite documentado del MVP.
- **Riesgo del deletionToken**: quien lo posea puede borrar el paquete. Si se
  pierde, el paquete vive hasta la expiración de retención. No hay segunda
  copia del token: el gateway solo guarda su digest.
- **Storage-DoS**: los uploads son anónimos; cualquiera puede llenar el
  almacenamiento dentro del límite de 1 MiB por paquete y 7 días de
  retención. Para el MVP local es aceptable; producción necesita cuotas o
  autenticación de subida.
- **Filesystem**: `FilePackageStore` es apto solo para MVP local de instancia
  única. No sirve para multi-instancia (sin coordinación entre nodos) ni
  serverless (filesystem efímero). Nombres derivados exclusivamente del
  packageHash validado; escritura temporal + rename atómico; directorio
  0o700 y archivos 0o600.