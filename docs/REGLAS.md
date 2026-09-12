# Nadie — Reglas de desarrollo

**EAG Global Buildathon · Cochabamba · 11–13 de septiembre de 2026 · Track 02**

Este archivo vive en `docs/REGLAS.md`. El agente de código lo lee antes de cada tarea, junto con `docs/ARQUITECTURA.MD`.

---

## 0. Antes de la primera línea de código

1. **Todo el código se escribe desde cero en este repositorio.** No se copian componentes, estilos, assets, configuraciones ni lógica desde otros proyectos.
2. El repositorio usa licencia **MIT**.
3. `README.md`, `docs/ARQUITECTURA.MD` y este archivo son las fuentes de verdad antes de implementar. Para tareas de backend también aplica `docs/PLAN_BACKEND.md`.
4. Cada cambio se desarrolla en una rama aislada asignada por el orquestador y se revisa antes de integrarse.

**Regla dura:** no se hereda código de Susurro ni de ningún otro repositorio.

---

## 1. Dónde va el esfuerzo

El valor del proyecto está en el cliente, no en los servidores. Presupuesto orientativo de las ~26 horas de trabajo efectivo:

| Pieza | Horas | Dónde corre |
|---|---|---|
| Contratos + tests + despliegue | 4 | Cadena |
| Llaves, baúl cifrado, firmas | 3 | Navegador |
| Puerto de LLM + extracción de memoria | 4 | Navegador |
| Check-in, gráfico y observaciones | 2 | Navegador |
| Gateway + relayer | 3 | Servidor |
| Portal del profesional | 2 | Navegador |
| Construir chat + 5 pantallas de producto | 6 | Navegador |
| Ensayo y guion del demo | 2 | — |

**Si el gateway pasa de ~200 líneas, el diseño se torció.** Es un almacén de blobs con una consulta a la cadena; no tiene lógica de negocio, no valida contenido, no sabe qué es una emoción.

---

## 2. Estructura del repo

```
packages/
  contracts/    Solidity + tests + script de despliegue
  core/         Núcleo: llaves, baúl, LLM, memoria, insights, consentimiento
  ui/           React desde cero: chat + pantallas de producto
  gateway/      Servicio de paquetes cifrados
  relayer/      Reenvío de firmas y pago de gas
  clinician/    Portal del profesional
docs/
  ARQUITECTURA.MD
  REGLAS.md (este archivo)
  PLAN_BACKEND.md
```

**Dependencias permitidas (flecha = puede importar):**

- `ui → core`
- `clinician → core`
- `core → contracts` (solo ABIs y direcciones)
- Nada más. En particular: `ui` NO importa viem, WebLLM, ni nada de criptografía.

Si el agente necesita romper esta regla, es señal de que falta un método en `core`. Se agrega el método.

---

## 3. Contrato primero

Antes de implementar nada, se escriben y se congelan:

1. **La interfaz `NadieCore`** en TypeScript, con estas áreas: `keys`, `session`, `memory`, `checkins`, `insights`, `sharing`, `audit`. Solo tipos, sin implementación.
2. **Los esquemas JSON** de lo que el modelo debe devolver (extracción de memoria, propuesta de check-in, resumen para compartir).
3. **Las interfaces de puerto:** `LLMPort` (chat y extract), `VaultPort` (guardar y leer cifrado), `ChainPort` (leer y firmar).

Con eso congelado, cada pieza se construye como una unidad de trabajo secuencial en la rama asignada por el orquestador. **No se cambia una interfaz después del sábado al mediodía**; si falta algo, se agrega un método nuevo sin tocar los existentes.

---

## 4. Construir la UI desde cero

1. Crear una cáscara mínima con navegación, tokens visuales y componentes base propios de Nadie.
2. Conectar el chat exclusivamente mediante `NadieCore`; la UI no accede directamente a almacenamiento, WebLLM, criptografía ni cadena.
3. Priorizar claridad y consistencia. No construir un sistema visual amplio durante el MVP.
4. Construir cinco pantallas de producto: **check-in, Mi camino, Memoria, Compartir, Auditoría**.
5. Revisar que ningún texto prometa más privacidad o seguridad de la que el modo activo ofrece.

**Orden de las pantallas nuevas si falta tiempo:** Compartir y Auditoría primero (son el demo), luego Mi camino, luego Check-in, luego Memoria.

---

## 5. Reglas de código

- **TypeScript estricto en todo el repo.** Sin `any` en `core`.
- **Un solo archivo de configuración** con direcciones de contratos, red y URLs de servicios. Nada hardcodeado en otro lado.
- **Todo lo opcional detrás de un flag:** voz, enclave, embeddings, respuesta del profesional. Primero se estabilizan la IA local y el flujo de compartir; el demo principal debe correr con todos los flags opcionales apagados.
- **Las etiquetas de derivación de llaves se congelan en el commit donde se escriben.** Cambiarlas después deja ilegible todo dato anterior.
- **Salida del modelo:** se valida contra el esquema; si no valida, se descarta y se reintenta una vez. Nunca entra al baúl algo sin validar.
- **Sin telemetría, sin analítica, sin logs de contenido.** En ningún paquete.
- **Mensajes de error que no filtren datos.** El gateway responde "no autorizado", no "el permiso venció el día X para el usuario Y".

---

## 6. Invariantes de privacidad (con tests)

Estos tests se escriben temprano, no al final. Son la prueba de que el track 02 se cumple de verdad, y dan material para el Q&A.

1. **Modo privado sin red:** después de precargar el modelo y los assets, el monitor de red debe registrar cero solicitudes salientes durante una sesión privada completa. Los dobles de `fetch` y `XMLHttpRequest` pueden complementar la prueba, pero no reemplazan la observación de red.
2. **Nada legible fuera:** dado un baúl con datos, lo que se persiste en IndexedDB no contiene ninguna de las cadenas originales.
3. **Ida y vuelta de cifrado:** cifrar → envolver llave → descifrar con la llave del profesional devuelve exactamente el original.
4. **El hash es del paquete cifrado**, nunca del texto claro.
5. **Revocación efectiva:** tras revocar, `isValid` devuelve falso y el gateway responde no autorizado.
6. **Credencial caída:** si el profesional pierde la credencial, todos sus permisos vigentes dejan de ser válidos.
7. **Sin datos personales on-chain:** un test que recorre los argumentos de todos los eventos y verifica que solo hay direcciones, hashes, enteros y etiquetas de alcance.

---

## 7. Reglas de demo

- **Datos sintéticos desde la hora 1.** Un botón oculto siembra 21 días de check-ins con una historia: una semana difícil y una mejora gradual. El demo nunca depende de escribir datos en vivo ni de que el modelo responda bien.
- **Etiquetar hitos estables** como `demo-safe/<hito>`. Si algo se rompe a las 2 a.m. del domingo, se vuelve al último hito estable sin adivinar.
- **Nada de refactors después del sábado al mediodía.** Solo correcciones y pulido.
- **Ensayar con el WiFi apagado.** El modo privado debe sobrevivirlo y ese es justamente el momento más fuerte del demo.
- **Modelo descargado y cacheado antes de viajar.** Pesa cientos de MB o más; el WiFi del evento no es confiable.
- **Contratos desplegados el viernes**, no el domingo. Las direcciones se congelan y se anotan en el README.
- **Grabar un video de respaldo** del flujo completo el sábado en la noche, por si algo falla en vivo.

---

## 8. Orden de trabajo y puntos de control

Cada punto de control es una pregunta de sí o no. Si la respuesta es no, se recorta antes de avanzar.

| Momento | Punto de control |
|---|---|
| Viernes, cierre | ¿Los contratos están desplegados en testnet y los tests pasan? |
| Viernes, cierre | ¿El baúl cifra, guarda y recupera? |
| Sábado, mediodía | ¿El modelo local conversa en español aceptable y devuelve JSON válido? Si no, el orquestador decide si abre una rama de contingencia para el enclave. |
| Sábado, mediodía | ¿El gráfico se dibuja con los datos sembrados? |
| Sábado, tarde | ¿El flujo completo de compartir funciona de punta a punta? (este es el corazón del demo) |
| Sábado, noche | ¿Hay video de respaldo grabado? |
| Domingo, mañana | ¿El guion de 3 minutos se ensayó tres veces con cronómetro? |

**Orden de recortes:** embeddings → ModelRegistry → vales anónimos → modo voz → respuesta del profesional → enclave. Cada recorte pasa al roadmap, no a la basura. El protocolo local de crisis es parte del núcleo y no se recorta.

**Nunca se recorta:** IA local, memoria, check-in, gráfico, protocolo local de crisis y flujo de compartir con firma.

---

## 9. Cómo trabajar con el agente de código

- Una tarea, un paquete, un objetivo. Nada de "construye la app".
- El agente lee `docs/ARQUITECTURA.MD` y este archivo antes de cada tarea. Para backend también lee `docs/PLAN_BACKEND.md`.
- **Una rama por unidad de trabajo.** El orquestador indica la rama base, el nombre y el alcance antes de cada implementación.
- El agente nunca crea, cambia, mezcla, rebasa ni elimina ramas salvo orden explícita del orquestador.
- Una rama contiene un solo resultado revisable. Código, pruebas y documentación necesaria viajan juntos.
- **Código que funciona no se reescribe.** Si el agente propone refactorizar algo que ya pasa sus tests, se rechaza.
- Tests antes que implementación en `core` y en `contracts`. En la UI, no.
- Revisar a mano todo lo que toque criptografía o firmas. Un error silencioso ahí no se ve hasta el demo.
- El agente entrega primero un diff que compila y sus verificaciones. Solo después de la revisión del orquestador se autoriza el commit.
- Cada rama normalmente termina en un commit convencional por unidad de trabajo, sin atribución de IA. Si no compila, no se integra ni se avanza a la siguiente rama.

---

## 10. Definición de terminado

| Pieza | Está terminada cuando |
|---|---|
| Contratos | Tests pasan, desplegados, direcciones en el config |
| Llaves y baúl | Ida y vuelta de cifrado probada, frase de recuperación restaura |
| LLM local | Conversa, devuelve JSON válido y el test sin red pasa |
| Memoria | Extrae, la persona confirma, persiste cifrada y vuelve como contexto |
| Check-in y gráfico | Datos sembrados se dibujan y hay al menos una observación |
| Crisis | Detecta localmente señales configuradas y muestra ayuda humana sin compartir datos automáticamente |
| Compartir | Firmar → abrir → auditar → revocar funciona de punta a punta en testnet |
| Gateway | Entrega solo con permiso válido, nunca ve texto claro, bajo 200 líneas |
| UI | Las 5 pantallas nuevas funcionan contra `core` sin importar criptografía |
| Demo | Ensayado con cronómetro, con WiFi apagado y con video de respaldo |
