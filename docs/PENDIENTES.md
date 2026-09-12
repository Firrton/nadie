# Estado y trabajo restante — Nadie (post Goal 9)

Última actualización: tras completar goal-09-backend-e2e (backend verificado de punta a punta en Anvil + smoke read-only en HashKey Testnet).

## Qué está hecho y verificado

| Pieza | Estado |
|---|---|
| Contratos ProfessionalRegistry + ConsentRegistry | Desplegados en HashKey Testnet (chain 133), tests 109/109 |
| Paquete cifrado v1 (HPKE + AES-GCM + Keccak) | Terminado, 69 tests core |
| Gateway de paquetes cifrados | Terminado, 34 tests, corre local :8787 |
| Relayer de consentimientos | Terminado, 27 tests, corre local :8788 |
| Flujo compartir completo (cifrar→subir→grant→open→descarga→revoke→bloqueo) | Probado E2E en Anvil (packages/e2e) |
| Smoke read-only HashKey | `pnpm smoke:backend:hashkey` |

Direcciones desplegadas (verificadas):
- ProfessionalRegistry: `0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c`
- ConsentRegistry: `0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1`

## Reparto de trabajo propuesto

Tres frentes paralelos con dependencias mínimas entre sí.

### A) Frontend + modelo (Claude, en curso)

La app de voz (packages/frontend) existe con su UI (orbe, check-in, ánimo) pero
no consume el backend. Faltan:

1. **Implementaciones de los puertos de core** (los goals solo dejaron
   interfaces; este es el bloque que habilita todo lo demás):
   - `VaultPort` → IndexedDB + Web Crypto (baúl AES-GCM, borrado por
     destrucción de llave).
   - `LLMPort` → WebLLM sobre WebGPU (chat + extract con los esquemas Zod de
     core; descartar y reintentar una vez si no valida).
   - `ChainPort` → viem: isVerified, consents, signTypedData EIP-712 con el
     dominio exacto `NadieConsentRegistry` v1 chain 133.
2. **Wirear las pantallas Compartir y Auditoría** al flujo real: draft del
   resumen → encryptPackage → upload al gateway → firmar Grant → abrir en el
   explorer → auditoría lee `firstOpenedAt` → revoke.
3. **Check-in + Mi camino** con persistencia local cifrada.
4. **Seed de 21 días** de check-ins sintéticos (exigen las REGLAS para el demo).
5. **Protocolo de crisis local** (detección por keywords + pantalla de ayuda,
   sin compartir nada automáticamente).

### B) Backend restante (Codex)

1. **Portal del psicólogo (packages/clinician)** — hoy es stub. UI mínima:
   - lista de paquetes pendientes;
   - llamar `open(consentId)` (queda on-chain);
   - pedir challenge al gateway, firmar EIP-191, descargar, descifrar con su
     clave X25519 (rotateKey ya soporta la rotación);
   - responder vía `reply(consentId, responseHash)`.
   El flujo ya está probado en el E2E: es trasladarlo a UI.
2. **Verificación on-chain del profesional**: registrar el psychologist del
   demo en ProfessionalRegistry del testnet (credencial vigente + su public
   key X25519). Es UNA transacción admin — requiere la clave del deployer
   (testnet) y coordinación con A para conocer la public key elegida.
3. **Tests de privacidad que promete el README** (`pnpm test:privacy`, aún no
   existen): no-network, vault-opaque, envelope-roundtrip, hash-is-ciphertext,
   revoke-blocks, credential-cascade, no-pii-onchain. Algunos ya están
   cubiertos implícitamente por los E2E; falta formalizarlos como suite.
4. **Docker/procfile o script único** para levantar gateway+relayer juntos
   en el demo (hoy son dos `pnpm --filter ... dev` separados).

### C) Integración + demo (después de A y B)

1. **Guion de 3 minutos** (ARQUITECTURA §16): check-in + conversación offline
   con monitor de red en cero → "Mi camino" → compartir → firma → la psicóloga
   abre → auditoría → revoke → denegado.
2. **Ensayo con WiFi apagado** (REGLAS §7) y video de respaldo.
3. Completar los TODO del README raíz: URL del video, URL de la app.
4. Riesgo pendiente del plan de backend: front-running de disponibilidad del
   `consentId` (unicidad global). Decidir si se deriva el ID en vez de
   elegirlo; no es bloqueante para el demo.

## Coordinación entre A y B

- **Contrato entre ambos**: las interfaces de `@nadie/core` (Goal 2, congeladas)
  y el flujo E2E de `packages/e2e/src/backend.e2e.test.ts` son la especificación
  executable. Cualquier duda de "¿cómo se consume esto?" está respondida ahí.
- **Punto de sincronización único**: la public key X25519 del psychologist del
  demo. B la registra on-chain; A la usa para cifrar. Definirla juntos.
- **No tocar**: contracts/, gateway/, relayer/ ya revisados e integrados;
  cambios ahí requieren rama aparte.

## Seguridad — recordatorios operativos

- La clave del deployer de testnet pasó por un canal de chat: solo testnet,
  jamás reutilizar en mainnet.
- El admin de ProfessionalRegistry es INMUTABLE y es el deployer: si se pierde,
  la operación queda congelada (documentado en packages/contracts/README.md).
- El gateway tiene storage-DoS posible (uploads anónimos): aceptable en MVP,
  cuotas antes de usuarios reales.
- @hpke/core no declara auditoría formal: riesgo residual registrado en
  packages/core/README.md.