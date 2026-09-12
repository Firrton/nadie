# Plan de backend por objetivos

Este plan divide el backend de Nadie en unidades de trabajo secuenciales, revisables y demostrables. Cada objetivo vive en una rama propia y parte de `main` actualizado.

## Regla de ejecución

1. El orquestador define el objetivo, la rama base, el alcance y los criterios de aceptación.
2. Se crea una rama `goal-NN-descripcion` desde `main` después de integrar el objetivo anterior.
3. Hermes implementa únicamente ese objetivo y entrega el diff junto con las verificaciones ejecutadas.
4. Codex revisa arquitectura, alcance, código y pruebas.
5. Solo después de la aprobación se crea el commit convencional y se integra la rama.
6. La siguiente rama nace del nuevo `main`; no se apilan ramas ni se mezclan objetivos.

Una rama contiene normalmente un único commit funcional. Las pruebas y la documentación necesaria viajan con el comportamiento que verifican.

## Qué llamamos backend

El backend incluye los contratos, el gateway y el relayer. `core` corre principalmente en el navegador, pero sus puertos y formatos se diseñan primero porque definen el límite entre el cliente y esos servicios. La UI y el portal clínico quedan fuera de este plan.

## Secuencia

| Objetivo | Rama | Resultado | Depende de |
|---|---|---|---|
| 1 | `goal-01-workspace-foundation` | Monorepo reproducible y paquetes vacíos verificables | Documentación integrada |
| 2 | `goal-02-core-contracts` | Interfaces y esquemas que congelan el límite del sistema | Goal 1 |
| 3 | `goal-03-professional-registry` | Registro verificable de profesionales | Goal 2 |
| 4 | `goal-04-consent-registry` | Consentimiento, revocación y primera apertura | Goal 3 |
| 5 | `goal-05-hashkey-deployment` | Contratos desplegados y configurados en HashKey | Goal 4 |
| 6 | `goal-06-encrypted-package` | Formato cifrado interoperable entre cliente y profesional | Goal 2 |
| 7 | `goal-07-package-gateway` | Almacenamiento y entrega autorizada de paquetes cifrados | Goals 5 y 6 |
| 8 | `goal-08-transaction-relayer` | Envío de consentimientos y revocaciones firmadas | Goal 5 |
| 9 | `goal-09-backend-e2e` | Flujo completo probado de punta a punta | Goals 7 y 8 |

## Goal 1 — Base del workspace

**Rama:** `goal-01-workspace-foundation`

**Alcance**

- Configurar el workspace con Node 20+, pnpm y TypeScript estricto.
- Crear la estructura mínima de `packages/core`, `packages/contracts`, `packages/gateway` y `packages/relayer`.
- Definir comandos raíz para compilar, probar y comprobar tipos.
- Añadir `.env.example` sin secretos y una única fuente de configuración.

**Aceptación**

- Una instalación limpia resuelve el workspace.
- Los comandos de build, test y typecheck terminan correctamente.
- Ningún paquete contiene todavía lógica de producto.

## Goal 2 — Contratos de software primero

**Rama:** `goal-02-core-contracts`

**Alcance**

- Definir los tipos públicos de `NadieCore`.
- Definir `LLMPort`, `VaultPort` y `ChainPort` sin implementación.
- Definir y validar los esquemas JSON para memoria, check-in y resumen compartido.
- Definir los tipos compartidos de consentimiento, credencial, primera apertura y paquete cifrado.

**Aceptación**

- TypeScript compila en modo estricto y sin `any` dentro de `core`.
- Los esquemas aceptan ejemplos válidos y rechazan entradas incompletas o desconocidas.
- No existe dependencia de React, viem, WebLLM ni almacenamiento concreto.

## Goal 3 — ProfessionalRegistry

**Rama:** `goal-03-professional-registry`

**Alcance**

- Implementar emisión, renovación y suspensión de credenciales.
- Registrar y rotar la llave pública de cifrado del profesional.
- Exponer `isVerified` considerando estado y vencimiento.
- Mantener el adaptador KYC de HashKey detrás de una interfaz y usar un mock en tests.

**Aceptación**

- Los tests Foundry cubren autorización, vencimiento, suspensión y rotación de llave.
- Una cuenta no autorizada no puede emitir ni suspender credenciales.
- Una credencial suspendida o vencida nunca resulta válida.

## Goal 4 — ConsentRegistry

**Rama:** `goal-04-consent-registry`

**Alcance**

- Implementar `grantWithSig`, `revokeWithSig`, `open` e `isValid`.
- Validar firmas EIP-712 con nonce, deadline y dominio ligado a red y contrato.
- Consultar dinámicamente `ProfessionalRegistry`.
- Registrar únicamente la primera apertura exitosa mediante `firstOpenedAt` y `Opened`.

**Aceptación**

- Una firma no puede reutilizarse ni ejecutarse después de vencer.
- Revocar o suspender al profesional invalida el permiso inmediatamente.
- Aperturas posteriores no alteran `firstOpenedAt` ni emiten otro `Opened`.
- Ningún evento contiene conversaciones, resúmenes ni texto libre personal.

## Goal 5 — Despliegue en HashKey

**Rama:** `goal-05-hashkey-deployment`

**Alcance**

- Crear scripts reproducibles de despliegue para HashKey Chain Testnet `133`.
- Desplegar ambos registros y ejecutar una verificación mínima contra la red.
- Exportar ABIs y direcciones hacia la configuración compartida.
- Actualizar el README con direcciones reales y estado comprobable.

**Aceptación**

- El bytecode desplegado corresponde al código revisado.
- Una prueba de humo consulta ambos contratos mediante el RPC configurado.
- No se versionan llaves privadas ni secretos.

## Goal 6 — Paquete cifrado

**Rama:** `goal-06-encrypted-package`

**Alcance**

- Definir una envoltura versionada para ciphertext, nonce, metadatos mínimos y llave envuelta.
- Implementar cifrado, envoltura, apertura y cálculo del hash del paquete cifrado en `core`.
- Mantener el texto claro fuera de contratos, servicios y logs.

**Aceptación**

- El roundtrip cifrar → envolver → abrir → descifrar recupera exactamente el original.
- Alterar ciphertext, nonce o metadatos autenticados hace fallar la apertura.
- El hash publicado corresponde al paquete cifrado canónico, nunca al texto claro.

## Goal 7 — Gateway de paquetes

**Rama:** `goal-07-package-gateway`

**Alcance**

- Guardar y recuperar únicamente paquetes cifrados y llaves envueltas.
- Verificar en cadena permiso, credencial, vencimiento y revocación antes de entregar.
- Exigir prueba de control de la cuenta profesional autorizada.
- Usar errores opacos y logs sin contenido.

**Aceptación**

- Sin permiso válido, el gateway devuelve una respuesta uniforme de no autorización.
- Un solicitante que no controla la cuenta profesional autorizada es rechazado aunque presente un permiso válido.
- Después de revocar o suspender la credencial, la entrega falla inmediatamente.
- El gateway nunca necesita una llave capaz de descifrar el paquete.

## Goal 8 — Relayer

**Rama:** `goal-08-transaction-relayer`

**Alcance**

- Recibir consentimientos y revocaciones firmadas.
- Validar formato, red, contrato, deadline y firma antes de pagar gas.
- Enviar la transacción a HashKey y devolver un identificador verificable.
- No guardar contenido personal ni registrar payloads sensibles.

**Aceptación**

- Firmas inválidas, vencidas, repetidas o dirigidas a otra red se rechazan.
- Una solicitud válida produce una transacción consultable en HashKey.
- El usuario no necesita fondos para conceder ni revocar.

## Goal 9 — Integración de backend

**Rama:** `goal-09-backend-e2e`

**Alcance**

- Automatizar el flujo cifrar → subir → conceder → abrir → entregar → revocar → denegar.
- Probar la invalidación causada por suspensión de la credencial profesional.
- Preparar datos sintéticos y un comando único para ejecutar la demostración.

**Aceptación**

- El flujo completo funciona contra HashKey Testnet con datos sintéticos.
- La primera apertura queda registrada una sola vez.
- Revocación y suspensión bloquean entregas posteriores.
- Los comandos documentados pueden repetirse desde un entorno limpio.

## Fuera de este plan

- UI, portal clínico y experiencia visual.
- Conversación local, memoria, check-in, gráfico y protocolo de crisis.
- Voz, TEE, embeddings, ZK y canal de respuesta profesional.
- Amenazas avanzadas, auditoría externa y endurecimiento de producción.

Estos puntos se planifican después de estabilizar el flujo principal del backend; no deben entrar accidentalmente en las ramas anteriores.
