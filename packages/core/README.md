# @nadie/core

Núcleo de Nadie: contratos públicos de software, esquemas runtime y el
formato v1 del paquete cifrado. Sin implementaciones de puertos (LLM, baúl,
cadena): esas llegan enramas posteriores.

## Formato v1 de paquete cifrado (congelado)

El paquete cifrado es lo único que sale del dispositivo hacia el gateway.
El gateway nunca ve texto claro: solo el envelope serializado.

### Algoritmos

| Pieza | Algoritmo |
|---|---|
| Clave pública del profesional | X25519 raw de 32 bytes (hex `0x` + 64 minúsculas), tal como se registra en `ProfessionalRegistry.publicKey` |
| Contenido | AES-256-GCM (Web Crypto nativo), nonce aleatorio de 12 bytes, tag de 16 bytes al final del ciphertext |
| Content key | 32 bytes aleatorios nuevos por paquete (CSPRNG nativo) |
| Envoltura de la content key | HPKE Base RFC 9180: DHKEM(X25519, HKDF-SHA256) + HKDF-SHA256 + AES-256-GCM |
| HPKE info | UTF-8: `nadie/encrypted-package/v1/key-wrap` |

Sin criptografía propia: solo Web Crypto nativo, `@hpke/core`, `@noble/hashes`
y `@scure/base`.

### Estructura del envelope

```json
{
  "version": 1,
  "algorithm": "HPKE-X25519-HKDF-SHA256-AES256GCM+A256GCM",
  "recipientPublicKey": "0x…64 hex minúsculas",
  "encapsulatedKey": "…base64url sin padding, 32 bytes",
  "nonce": "…base64url sin padding, 12 bytes",
  "ciphertext": "…base64url sin padding, ciphertext + tag",
  "wrappedKey": "…base64url sin padding, 48 bytes",
  "metadata": { "professional": "0x…40 hex minúsculas", "scope": "graph-summary" }
}
```

### AAD canónico

El mismo AAD autentica el AES-GCM del contenido y el HPKE de la content key:

```
{"version":1,"algorithm":"…","recipientPublicKey":"…","encapsulatedKey":"…","metadata":{"professional":"…","scope":"…"}}
```

Cualquier cambio de metadata, claves o encapsulatedKey hace fallar el
desencriptado (GCM/HPKE lo rechazan por AAD).

### Serialización y hash

- Serialización canónica: JSON UTF-8 **sin espacios**, orden fijo de campos
  (version, algorithm, recipientPublicKey, encapsulatedKey, nonce, ciphertext,
  wrappedKey, metadata; metadata en orden professional, scope). Siempre se
  reconstruye el objeto desde cero; nunca se confía en el orden de un JSON
  recibido.
- `packageHash` = `0x` + Keccak-256 de la **serialización canónica completa**.
  Incluye ciphertext, wrappedKey, claves, nonce y metadata. **Nunca se hashea
  plaintext.** Compatible con `ConsentRegistry.packageHash` (bytes32).
- Se rechazan: campos desconocidos, padding base64, codificaciones
  alternativas, hex/direcciones no canónicas y longitudes inválidas.

## Límites y riesgos que el usuario debe conocer

- **Metadata y longitud visibles:** el `scope`, la dirección del profesional y
  el tamaño del ciphertext son visibles para el gateway. No hay ocultamiento
  de tamaño ni padding.
- **HPKE Base no autentica al emisor:** cualquiera puede construir un envelope
  para la clave pública del profesional. La autenticación de origen la da la
  firma on-chain del usuario sobre el `packageHash` (EIP-712 en
  `ConsentRegistry`), no el cifrado.
- **Revocar no borra:** revocar un permiso corta el acceso futuro, pero no
  borra un paquete que el profesional ya descargó ni puede "des-leer" lo leído.
- **Compromiso de la clave profesional:** si la clave privada X25519 del
  profesional se filtra, puede abrir cualquier paquete capturado que esté
  cifrado para esa clave. La rotación de clave (`rotateKey`) protege el futuro,
  no el pasado.
- **@hpke/core 1.9.0** implementa vectores de prueba del RFC 9180, pero **no
  declara auditoría formal** de seguridad. Se registra como riesgo residual
  del MVP; antes de usuarios reales se auditará o se sustituirá.

## Errores

`EncryptedPackageError` con códigos estables:
`INVALID_STRUCTURE`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_ALGORITHM`,
`DECRYPTION_FAILED`. Wrong key, tamper y cualquier fallo criptográfico
colapsan a `DECRYPTION_FAILED`. Los mensajes son fijos: nunca incluyen
plaintext, claves, envelope ni detalles internos.

El zeroize de la content key y buffers secretos temporales es best-effort:
JavaScript y Web Crypto no garantizan borrado físico de memoria; los
`CryptoKey` nativos escapan a nuestro control.

## Tests

```
pnpm --filter @nadie/core test
```

69 pruebas: esquemas runtime, contratos de tipos y 38 del paquete cifrado
(roundtrip UTF-8/Unicode/bytes, interoperabilidad entre pares, wrong key,
tamper por campo, versiones/algoritmos no soportados, codificaciones no
canónicas, serialización idempotente, hash canónico y privacidad).