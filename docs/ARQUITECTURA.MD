# Nadie — Arquitectura del MVP

**EAG Global Buildathon · Cochabamba · 11–13 de septiembre de 2026**
**Track 02: Local AI, Private AI & User-Owned Data**

Versión 0.1 · Documento de diseño, sin código. El código se escribe durante el evento, en un repo nuevo.

> Nadie te escucha, te guarda el secreto y te acompaña a contarlo. Una IA de compañía emocional que corre en tu dispositivo, recuerda lo que le cuentas, dibuja tu camino emocional y solo comparte con un psicólogo verificado lo que tú firmas.

---

## 1. Requisitos

### 1.1 Funcionales

| ID | Prioridad | Qué hace |
|---|---|---|
| F1 | Núcleo | Conversar por texto recordando lo que la persona contó antes; voz opcional |
| F2 | Núcleo | Check-in diario: puntaje del día (1–10), emociones y una nota opcional |
| F3 | Núcleo | "Mi camino": gráfico del ánimo y las emociones en el tiempo, con observaciones simples |
| F4 | Núcleo | Memoria visible y editable: "lo que Nadie recuerda de ti" |
| F5 | Núcleo | Compartir un resumen con un profesional verificado: por tiempo limitado, revocable y auditable |
| F6 | Opcional | Canal de respuesta del profesional sin revelar la identidad del usuario |
| F7 | Núcleo | Protocolo de crisis: acceso inmediato a ayuda humana |

### 1.2 No funcionales

- **Privacidad:** nada legible sale del dispositivo sin una elección explícita del usuario. Ningún contenido va a la cadena, ni siquiera cifrado.
- **Anonimato:** sin correo ni teléfono. Un seudónimo distinto por cada profesional.
- **Honestidad:** la interfaz muestra siempre en qué modo de cómputo estás y qué sale del dispositivo.
- **Offline:** el modo privado funciona sin conexión una vez descargado el modelo.

### 1.3 Restricciones

- 48 horas, un solo builder, con agentes de código.
- Repo nuevo desde cero durante el evento; no se reutiliza código previo.
- Demo en laptop con datos sintéticos; nunca datos reales de personas.
- Formato de jurado probable (si replica Floripa): 3 jueces locales + 3 de EAG, 3 minutos de demo + 2 de preguntas.

### 1.4 Supuestos

- HashKey Chain Testnet (chain ID 133) es la red principal para el MVP y permite participar también en su track. Otros despliegues EVM quedan en el roadmap.
- El WiFi del evento no es confiable: el modelo se descarga y se cachea antes.
- Los profesionales del demo son cuentas de prueba verificadas por Nadie.

---

## 2. Principios de diseño

1. **Local primero.** La conversación, la memoria y el gráfico viven en el dispositivo.
2. **Humano + IA, 2-de-2.** La IA prepara; nada sale sin la firma del usuario. (Idea tomada del setup de IA local que Vitalik publicó en abril de 2026.)
3. **La cadena es el notario, no la caja fuerte.** On-chain solo van permisos, sellos (hash del paquete cifrado), credenciales profesionales y registros de primera apertura.
4. **Anonimato por diseño.** La persona que habla nunca se identifica; el profesional que escucha, siempre.
5. **Acompañamiento, no tratamiento.** Sin diagnósticos, sin lenguaje clínico, sin escalas clínicas.
6. **Honestidad radical.** Cada modo dice exactamente qué pasa con los datos.

### 2.1 Mapeo a los mecanismos del track

El track 02 permite combinar Ethereum con ZK, TEE, FHE, MPC, almacenamiento cifrado, software local-first, zkTLS y otros mecanismos de acceso privado a datos. Es una lista de permisos, no una lista de tareas: cuatro mecanismos bien usados valen más que seis pegados con cinta.

| Mecanismo | Uso en Nadie | Estado |
|---|---|---|
| **Local-first software** | El modelo, la memoria y el gráfico viven en el dispositivo y funcionan sin conexión | Núcleo |
| **Encrypted storage** | Baúl AES-GCM en el cliente, paquetes cifrados de punta a punta, borrado por destrucción de llave | Núcleo |
| **TEE con attestation** | Inferencia de respaldo en enclave verificable, con recibos firmados | Posterior al núcleo |
| **ZK** | Vales anónimos de sesión (sección 8.1) | Opcional |
| **zkTLS / web proofs** | Verificación de matrícula sin que Nadie sea el verificador | Roadmap |
| **MPC** | Descartado: repartir una llave entre varias partes no resuelve ningún problema de este diseño | — |
| **FHE** | Descartado: computar sobre datos cifrados es inviable para inferencia de un LLM hoy | — |

---

## 3. Vista general

```
[Dispositivo del usuario — PWA]
 ├─ UI: check-in · conversación · mi camino · memoria · compartir · auditoría
 ├─ Router de cómputo (un solo cliente compatible con OpenAI)
 │    ├─ Nivel 1: IA local (WebLLM)            ← por defecto
 │    ├─ Nivel 2: inferencia en enclave (TEE)  ← si el equipo no alcanza
 │    └─ Modo voz: ElevenLabs (ZRM)            ← solo si el usuario lo activa
 ├─ Memoria del agente ──► Baúl cifrado (IndexedDB)
 └─ Llaves del usuario + firmas EIP-712
        │ paquetes cifrados             │ firmas (sin gas)
        ▼                               ▼
[Gateway de paquetes cifrados]    [Relayer: paga el gas]
        ▲ entrega solo si isValid()     │
        │                               ▼
[Portal del profesional] ──open()──► [Cadena EVM: ProfessionalRegistry
                                      + ConsentRegistry]
```

| Componente | Responsabilidad | ¿Ve texto claro? |
|---|---|---|
| PWA del usuario | UI, IA local, memoria, gráfico, cifrado, firmas | Sí (es del usuario) |
| Enclave TEE (nivel 2) | Inferencia cuando el dispositivo no alcanza | Solo dentro del enclave |
| ElevenLabs (modo voz) | Voz a texto y texto a voz | Sí, en tránsito, sin retención |
| Gateway | Guardar y servir paquetes cifrados | No |
| Relayer | Enviar transacciones firmadas y pagar gas | No |
| Cadena | Consentimientos, credenciales, auditoría | No (solo hashes y direcciones) |
| Portal del profesional | Abrir y descifrar lo compartido | Sí (solo lo que el usuario firmó) |
| Institución financiadora (opcional) | Publica el grupo y financia vales de sesión | No |

---

## 4. Cómputo: dónde vive la IA y por qué eso sigue siendo Ethereum

### 4.1 Qué aloja cada capa

Ethereum no aloja la IA, y eso no es una concesión: es el enunciado del track. "Local AI" significa que el modelo corre donde está la persona. La cadena hace lo único que ninguna otra pieza puede hacer, que es decidir quién tiene permiso de escuchar.

| Capa | Dónde corre | Quién la aloja | Quién puede leer |
|---|---|---|---|
| Nivel 1 (por defecto) | GPU del dispositivo del usuario | Nadie: no existe servidor | Solo la persona |
| Nivel 2 (respaldo) | Enclave con GPU y attestation | Un proveedor que aloja pero no puede leer | Nadie fuera del enclave |
| Voz (opt-in) | Infraestructura de ElevenLabs | ElevenLabs | ElevenLabs en tránsito, sin retención |
| Autoridad | Ethereum | Todos los nodos | Todos, y por eso ahí solo van hashes y direcciones |

**Por qué la cadena no puede correr el modelo.** Ethereum es una computadora pública que todos los nodos reejecutan para verificarla. Eso la hace confiable para registrar quién autorizó qué e inservible para la inferencia:

- **Escala:** generar una sola palabra con un modelo pequeño (1B parámetros) exige del orden de 2 mil millones de operaciones; en un bloque caben apenas unos millones de multiplicaciones. Una respuesta completa necesitaría miles de bloques.
- **Costo:** cada operación se paga con gas, y guardar los pesos del modelo on-chain costaría una fortuna.
- **Privacidad:** todo lo que se computa on-chain es público. Correr ahí una conversación emocional sería publicarla.

Las redes de cómputo descentralizado resuelven quién aporta el hardware, no la privacidad: salvo que corran en enclaves, el proveedor podría ver los datos.

### 4.2 Lo que sí aloja Ethereum: la autoridad sobre quién puede escucharte

**La cadena no ejecuta la IA. Declara qué IA tiene permiso de escucharte, y quién puede leer lo que le contaste.** Son tres registros, en orden de madurez:

1. **ConsentRegistry** — quién puede abrir qué y por cuánto tiempo. Núcleo del MVP.
2. **ProfessionalRegistry** — qué credenciales son válidas hoy. Núcleo del MVP.
3. **ModelRegistry (opcional)** — los hashes de los modelos aprobados y de las medidas de enclave autorizadas.

El tercero cierra un hueco real. En el nivel 1 los pesos del modelo llegan por una CDN. Si alguien la compromete y sirve un modelo manipulado, una app de acompañamiento emocional se convierte en un vector de manipulación sobre personas vulnerables, y la privacidad local no protege de nada, porque el atacante ya está adentro del dispositivo. El cliente calcula el hash de los pesos al descargarlos, lo compara contra el registro y se niega a cargar un modelo que no esté en la lista. Como el registro es público y Nadie no puede reescribirlo en silencio, el ataque pasa de invisible a detectable.

En el nivel 2 el patrón ya es práctica de la industria y no lo inventamos nosotros: Phala registra el build del enclave y permite revocarlo on-chain para cortar el acceso de forma global.

Es el mismo principio en los tres registros: la cadena no guarda tus sentimientos ni los procesa, guarda la lista de quién y qué tiene permiso de acercarse a ellos.

**Costo del ModelRegistry:** un contrato pequeño y una comparación de hash en el cliente. Hashear los pesos toma segundos y ocurre una sola vez, al descargar. Es opcional dentro de las 48 horas.

### 4.3 Router de tres niveles

WebLLM y los proveedores de inferencia en enclave exponen APIs compatibles con OpenAI, así que el router es un solo cliente que cambia de destino.

| Modo | Dónde corre la IA | Qué sale del dispositivo | Etiqueta en la UI |
|---|---|---|---|
| Nivel 1 — Privado (por defecto) | En el navegador, con WebLLM sobre WebGPU | Nada | "Privado: todo en tu dispositivo" |
| Nivel 2 — Enclave | En un TEE con attestation (Phala Confidential AI o Tinfoil) | El texto, cifrado hasta el enclave | "Privado en enclave verificable" |
| Voz (opt-in) | ElevenLabs para la voz; el LLM en modo ZRM o apuntando al enclave | Audio y texto, en tránsito, sin retención | "Voz: tu audio pasa por ElevenLabs y no se guarda" |

**Nivel 1 — IA local**

- Motor: WebLLM (WebGPU, API compatible con OpenAI, modo JSON para salidas estructuradas).
- Modelo: uno pequeño con buen español (familias Qwen, Llama 3.2 o Gemma, de 1 a 3B parámetros, cuantizado). Probar dos esta noche y quedarse con el que mejor responda en español.
- Pesos: de cientos de MB a un par de GB; se descargan una vez y quedan cacheados en el navegador.
- Chequeo de capacidad al inicio: si no hay WebGPU o memoria suficiente, ofrecer el nivel 2.
- Límite conocido: los modelos de menos de 2B alucinan con facilidad. Por eso sus tareas son acotadas: reflejar, resumir, extraer emociones y temas. Nunca aconsejar sobre salud ni diagnosticar.
- En celulares el soporte es desigual: iOS 26 y Android recientes de gama alta funcionan; equipos modestos, no. Para el demo, laptop.

**Nivel 2 — Enclave (respaldo)**

- Inferencia dentro de un entorno de ejecución confiable con GPU: el operador no ve el prompt y cada respuesta trae evidencia criptográfica verificable (attestation y recibos firmados).
- Mismo cliente del router: solo cambia la URL base.
- Para el MVP basta con mostrarlo funcionando una vez; no es el camino principal del demo.

**Modo voz — ElevenLabs**

- Agente con Zero Retention Mode activado, guardado de audio apagado y retención en cero días.
- LLM del agente: uno compatible con ZRM (lo rápido) o "Custom LLM" apuntando al enclave del nivel 2 (lo ideal).
- Al iniciar, contexto de memoria mínimo: último resumen, ánimo de hoy y tres recuerdos relevantes. Nunca el historial completo.
- URL firmada emitida por el backend para no exponer el ID del agente.
- ZRM cubre el tráfico por API, no el playground: probar siempre desde la app.
- La transcripción vuelve al dispositivo, se cifra ahí y entra a la memoria como cualquier sesión.

---

## 5. Memoria del agente

### 5.1 Tres memorias

| Memoria | Qué guarda | Para qué |
|---|---|---|
| De ánimo | Check-ins diarios: puntaje, emociones, nota | El gráfico y la tendencia |
| Episódica | Cada sesión: transcripción cifrada + resumen corto | Recordar qué pasó y cuándo |
| Semántica | "Lo que Nadie sabe de ti": personas, temas, detonantes, lo que te ayuda, pendientes | Continuidad: que el agente pregunte "¿cómo te fue en el examen?" |

### 5.2 El ciclo de una sesión

1. **Antes:** el dispositivo arma el contexto de memoria (ver 5.3) y se lo pasa al modelo.
2. **Durante:** conversación normal.
3. **Al cerrar:** el modelo local extrae, en JSON con esquema fijo: resumen (3–5 líneas), emociones, temas, recuerdos nuevos o actualizados, pendientes para retomar y una señal de riesgo.
4. **Confirmación:** la persona ve "Esto es lo que Nadie va a recordar" y puede editar o borrar antes de guardar. El 2-de-2 aplica también a la memoria.
5. **Guardado:** todo se cifra con la llave del baúl y se guarda en IndexedDB.

### 5.3 Contexto de memoria (lo que el agente recuerda al empezar)

Presupuesto de unos 600 tokens, porque los modelos pequeños tienen contexto corto:

- Perfil breve: el nombre o apodo que la persona eligió y cómo prefiere que le hablen.
- Últimos 3 resúmenes de sesión.
- Tendencia de ánimo de los últimos 7 días, en una línea.
- Pendientes abiertos ("preguntar cómo le fue en la conversación que le preocupaba").
- Los 3 recuerdos semánticos más relevantes para el tema actual.

### 5.4 Recuperación

- **MVP:** recencia + etiquetas de tema, sin embeddings.
- **Si sobra tiempo:** embeddings locales con un modelo multilingüe pequeño en el navegador y búsqueda por similitud; el índice vive cifrado en IndexedDB.

### 5.5 Control del usuario

- Pantalla "Lo que Nadie recuerda de ti": ver, editar u olvidar cada recuerdo.
- "Borrar todo": destruye la llave del baúl y los datos quedan ilegibles para siempre (crypto-shredding).
- Exportar el baúl cifrado para cambiar de dispositivo; se restaura con la frase de recuperación.

### 5.6 Reglas para que un modelo chico no invente

- Salida siempre en JSON con esquema estricto; si no valida, se descarta.
- Ningún recuerdo semántico se guarda como confirmado sin que la persona lo vea.
- Prohibido extraer diagnósticos, etiquetas clínicas o juicios sobre la persona.

### 5.7 Modelo de datos (todo cifrado en el dispositivo)

**CheckIn:** id · fecha · puntaje (1–10) · emociones [etiqueta, intensidad 1–3] · nota (opcional) · energía y sueño (opcionales) · fuente (manual | propuesto por la IA y confirmado) · sesión vinculada (opcional)

**Sesión:** id · inicio y fin · modo (privado | enclave | voz) · transcripción · resumen · emociones · temas · nivel de riesgo · hash del paquete si se compartió

**Recuerdo:** id · tipo (persona | tema | detonante | estrategia que ayuda | pendiente) · contenido · primera y última mención · veces mencionado · confirmado por el usuario · embedding (opcional)

**Compartido:** id · profesional · alcance (qué incluye) · rango de fechas · vencimiento · hash del paquete · id del permiso on-chain · estado (activo | abierto | revocado | vencido)

---

## 6. Check-in diario

**Flujo de 20 segundos**

1. "¿Cómo estuvo tu día?": deslizador del 1 al 10 con cinco anclas visuales.
2. "¿Qué sentiste?": chips de una lista fija, con intensidad de 1 a 3. Lista: alegría, calma, gratitud, esperanza, tristeza, ansiedad, miedo, enojo, frustración, soledad, cansancio, culpa.
3. "¿Algo que quieras dejar anotado?": una línea opcional.

**Dos entradas al check-in**

- Manual: recordatorio diario a la hora que la persona elija.
- Al cerrar una conversación: el modelo propone puntaje y emociones a partir de lo conversado, y la persona confirma o corrige. Nunca se guarda una inferencia sin confirmación.

**Lo que no hacemos en el MVP:** escalas clínicas como PHQ-9 o GAD-7. Son instrumentos de tamizaje clínico, y uno de los ítems del PHQ-9 pregunta por pensamientos de hacerse daño, lo que exige un protocolo profesional que un MVP no tiene.

---

## 7. "Mi camino" (el gráfico)

Todo se calcula en el dispositivo a partir del baúl descifrado; nada se envía a servicios de analítica.

**Vista 1 — Línea del ánimo:** puntaje diario y promedio móvil de 7 días. Cada punto va coloreado según la emoción dominante, con marcas en los días con sesión.

**Vista 2 — Emociones:** barras apiladas por semana con la frecuencia de cada emoción. Alternativa: calendario de "píxeles" por día.

**Vista 3 — Observaciones en lenguaje simple:**

- Solo con 7 días o más de datos.
- Lenguaje de correlación, nunca de causa ni de diagnóstico. Ejemplos: "La ansiedad apareció 5 de 7 días, casi siempre los lunes"; "Tu promedio subió de 4,2 a 5,6 esta semana".
- Se calculan con reglas simples; el modelo solo las redacta.

**Es lo que se comparte por defecto:** un profesional aprende más de dos semanas de gráfico y un resumen aprobado que de una transcripción, y la persona se expone mucho menos.

**Implementación:** librería de gráficos de React (Recharts). Para el demo, 21 días de datos sintéticos con una historia: una semana difícil y una mejora gradual.

---

## 8. Compartir con un profesional: el 2-de-2

1. La persona toca "Compartir con un profesional". El agente también puede sugerirlo tras varios días de ánimo bajo, pero es solo una sugerencia.
2. Elige profesional verificado, rango de fechas y qué incluir. Por defecto: gráfico + resumen. Las transcripciones, solo si las elige.
3. El modelo local redacta el resumen; la persona lo lee, lo edita y lo aprueba.
4. El dispositivo cifra el paquete con una llave nueva, lo sube al gateway y calcula el hash del paquete cifrado.
5. Envuelve esa llave con la llave pública de cifrado del profesional, leída del ProfessionalRegistry.
6. La persona firma un consentimiento EIP-712 con profesional, hash, alcance y vencimiento. El relayer lo envía a la cadena.
7. El profesional ve el paquete pendiente en su portal y llama a `open`, que queda registrado on-chain. El gateway comprueba el permiso, le entrega el paquete y la llave envuelta, y él descifra en su navegador.
8. La pantalla de auditoría de la persona lee el evento de primera apertura: "Dra. X abrió tu resumen por primera vez el 12 de septiembre a las 15:03".
9. **Revocar:** firma de revocación → relayer → cadena; el gateway deja de servir. Con honestidad: revocar corta el acceso futuro, no borra lo ya leído. Por eso se comparte un resumen por defecto y los permisos vencen pronto.
10. **Responder:** el profesional escribe una respuesta cifrada a la llave pública del seudónimo, y el gateway la guarda asociada al permiso. Anonimato progresivo: la persona decide si revela su identidad y cuándo.

---

### 8.1 Extensión opcional: vales anónimos de sesión

**El problema que resuelve.** La forma natural de financiar las sesiones es que las pague una universidad o una aseguradora. Pero un estudiante no va a pedir una sesión pagada si eso implica que su universidad sepa que buscó ayuda psicológica. El financiamiento y el anonimato se contradicen, y esa contradicción es la que hunde a los programas de bienestar universitario.

**La solución.** La institución publica un grupo con sus miembros (Semaphore). El usuario genera una prueba de que pertenece al grupo sin revelar cuál de ellos es, y recibe un vale para una sesión. Un nulificador por periodo impide reclamarlo dos veces. La institución ve cuántos vales se usaron y jamás quién los usó.

**Flujo:**

1. La institución financia un lote de vales y publica la raíz de su grupo.
2. El usuario prueba pertenencia con una identidad derivada en su dispositivo.
3. El contrato verifica la prueba, registra el nulificador y emite el vale al seudónimo.
4. El vale se consume al conceder el permiso; el profesional cobra contra él.

**Límite conocido, que va dicho en el pitch.** Si el vale se canjea y poco después aparece un permiso hacia la misma profesional, quien mire ambos registros puede correlacionarlos. No revela identidad, pero reduce el anonimato al conjunto de esa institución. Se mitiga con un retraso aleatorio entre canje y permiso, o desacoplando el vale del profesional elegido. En el MVP se documenta, no se resuelve.

**Costo:** unas 3 o 4 horas con Semaphore. Solo se construye si el flujo de compartir está de pie el sábado al mediodía.

---

## 9. Contratos (especificación en prosa)

### 9.1 ProfessionalRegistry

**Por profesional:** dirección, llave pública de cifrado, nombre visible, estado (activo | suspendido), vencimiento de la credencial y quién la emitió.

**Acciones:**

- El profesional registra o rota su llave pública de cifrado.
- Un verificador autorizado emite, renueva o suspende la credencial.
- Consulta pública `isVerified(dirección)`: credencial activa y vigente y, si hay adaptador de KYC configurado, KYC válido en ese momento.

**Verificador enchufable:**

- En el MVP, Nadie (con una multisig) revisa la matrícula y emite la credencial.
- Adaptador opcional: KYC SBT de HSK (función `isHuman` con nivel mínimo).
- Roadmap: que la emita el colegio profesional o que se pruebe con zkTLS.

### 9.2 ConsentRegistry

**Por permiso:** seudónimo del usuario, profesional, hash del paquete cifrado, alcance, vencimiento, estado de revocación y primera apertura.

**Acciones:**

- `grantWithSig`: crea el permiso a partir de la firma EIP-712 del usuario; exige profesional verificado.
- `revokeWithSig`: revoca con la firma del usuario.
- `open`: solo el profesional y con permiso válido. La primera llamada exitosa fija `firstOpenedAt` y emite `Opened`; las siguientes no cambian ese registro ni emiten nuevos eventos de apertura.
- `isValid`: no revocado, no vencido y profesional verificado en ese momento. Si el profesional pierde la credencial, sus accesos mueren solos.

**Eventos:** Granted, Opened, Revoked, Replied (este último solo con el hash de la respuesta).

Cualquiera puede retransmitir una firma válida: el relayer no es un punto de confianza, solo de conveniencia.

### 9.3 Despliegue y pruebas

- Cadena: cualquier EVM. Principal: HSK testnet (chain ID 133), que además deja abierto su track. Opcional: una L2 de Ethereum.
- Tests con mocks del verificador y del KYC con la misma interfaz.
- Con los mentores de HSK, evaluar el despliegue en mainnet: los contratos no guardan datos personales.

### 9.4 Contratos opcionales

- **VoucherRegistry:** raíz del grupo, verificación de la prueba de pertenencia, nulificadores usados y vales vigentes por seudónimo. Se integra con el ConsentRegistry al momento de conceder.
- **ModelRegistry:** hashes de modelos aprobados y medidas de enclave autorizadas, con versión y estado. Solo lectura desde el cliente.

Ninguno de los dos entra en el camino crítico del demo.
---

## 10. Servicios fuera de la cadena

- **Gateway de paquetes cifrados:** guarda paquetes y llaves envueltas, y nunca ve texto claro. Entrega solo si el permiso es válido y el profesional ya llamó a `open`. Borra a pedido y guarda logs mínimos, sin contenido.
- **Relayer:** envía las transacciones firmadas y paga el gas. El usuario nunca necesita tokens, así que nunca fondea su dirección desde un exchange que la vincule a su identidad.
- **Servidor de tokens de voz:** emite las URLs firmadas de ElevenLabs.
- **Sin analítica de contenido** en ningún servicio.

---

## 11. Llaves e identidad

- En el onboarding se genera una semilla en el dispositivo y se muestra la frase de recuperación. Si se pierde, nadie puede recuperar los datos, ni la persona misma. Es el precio del anonimato y se dice claro.
- De la semilla se derivan la llave del baúl, la llave de cifrado (para recibir respuestas) y las cuentas de firma. Las etiquetas de derivación son versionadas y se congelan desde el día 1.
- Una cuenta de firma distinta por cada profesional, para que nadie pueda vincular dos relaciones de la misma persona.
- Sin correo, sin teléfono, sin inicio de sesión con terceros.

---

## 12. Seguridad, crisis y límites

- **Instrucciones del agente:** acompañar, reflejar y preguntar. Nunca diagnosticar, nunca prometer más privacidad de la real, nunca desalentar la ayuda profesional.
- **Detección de riesgo local en todos los modos:** combina la señal del modelo con reglas de palabras clave. Si se activa, aparece la pantalla "Hablar con alguien ahora" con recursos de ayuda humana para Bolivia, verificados antes del lanzamiento (no se escriben números sin verificar), y la opción de compartir con un profesional verificado. Nunca se comparte nada automáticamente.
- **Solo mayores de 18** en el MVP.
- **Demo solo con datos sintéticos.**
- **Aviso permanente:** Nadie acompaña; no reemplaza la atención profesional.

---

## 13. Qué vive dónde

| Dato | Dónde vive | ¿Sale del dispositivo? | ¿On-chain? |
|---|---|---|---|
| Conversaciones | Dispositivo, cifradas | Solo en modo enclave o voz, sin retención | Nunca |
| Memoria semántica | Dispositivo, cifrada | Solo el contexto mínimo en modo voz | Nunca |
| Check-ins y gráfico | Dispositivo, cifrados | Solo si la persona los comparte | Nunca |
| Paquete compartido | Gateway, cifrado | Sí, cifrado de punta a punta | Solo su hash |
| Consentimiento | Cadena | — | Seudónimo, profesional, hash, vencimiento |
| Credencial profesional | Cadena | — | Sí |
| Primera apertura y revocaciones | Cadena | — | Sí, como eventos |

---

## 14. Trade-offs explícitos

| Decisión | Ganamos | Perdemos | Mitigación |
|---|---|---|---|
| IA local por defecto | Privacidad real; encaja con el track 02 | Calidad menor; requiere GPU | Tareas acotadas; nivel 2 como respaldo |
| Voz con ElevenLabs | Experiencia cálida | El audio sale del dispositivo | Opt-in, ZRM, retención cero, etiqueta visible |
| Contenido fuera de la cadena | Se puede borrar; nada expuesto a futuro | Dependemos de un gateway | Cifrado de punta a punta + hash on-chain; gateway reemplazable |
| Relayer que paga el gas | Sin cripto para el usuario; sin rastro de fondeo | Un servicio central | Firmas EIP-712 que cualquiera puede retransmitir |
| Nadie verifica profesionales (MVP) | Rapidez | Confianza en Nadie | Verificador enchufable hacia colegio o zkTLS |
| Compartir resúmenes, no transcripciones | Exposición mínima | Menos detalle para el profesional | Transcripción opcional, elegida por la persona |
| Descartar FHE | No perdemos el fin de semana en algo inviable | Un mecanismo menos de la lista del track | Inferencia de un LLM sobre datos cifrados es órdenes de magnitud demasiado lenta hoy |
| Descartar MPC | Diseño más simple y una llave menos que coordinar | Ídem | Repartir la llave entre varias partes no resuelve ninguna amenaza de este modelo; el riesgo está en el dispositivo y en el gateway |

---

## 15. Plan de 48 horas (un solo builder)

| Bloque | Entregable |
|---|---|
| Viernes noche | Repo nuevo · contratos + tests + despliegue en testnet · llaves y baúl cifrado · check-in con datos sintéticos |
| Sábado mañana | WebLLM + conversación + extracción de memoria en JSON + "Mi camino" + pantalla local de crisis |
| Sábado tarde | Compartir: gateway + relayer + portal del profesional → listo para el demo público en testnet |
| Sábado noche | Modo voz con ElevenLabs (solo si lo anterior funciona) |
| Domingo mañana | Pulido, guion de 3 minutos, ensayo de preguntas |

**Orden de recortes si vas atrasado:** embeddings → ModelRegistry → vales anónimos → modo voz → canal de respuesta. Cada recorte pasa al roadmap, no a la basura.

El nivel 2 (enclave) se implementa únicamente después de estabilizar la IA local y el flujo de compartir. Si el modelo local no rinde en el dispositivo de demo, se decide explícitamente si abrir una rama de contingencia para el enclave; no se cambia de arquitectura a mitad de una rama.

**Lo que nunca se recorta:** IA local, memoria, check-in, gráfico, protocolo de crisis y el flujo de compartir con firma.

---

## 16. Guion del demo (3 minutos)

| Tiempo | Qué se muestra |
|---|---|
| 0:00–0:30 | El problema: la gente le cuenta todo a una IA en la nube, o no se lo cuenta a nadie. "¿Quién lee lo que le cuentas a tu IA? Con Nadie, nadie." |
| 0:30–1:15 | Con el modelo y los assets ya cacheados: check-in + conversación en modo privado con el monitor de red abierto y cero solicitudes salientes. El agente recuerda algo de una sesión anterior. |
| 1:15–1:45 | "Mi camino": 21 días de datos sintéticos y una observación. |
| 1:45–2:30 | Compartir con una psicóloga verificada: firma, ella abre (evento on-chain), la auditoría lo muestra, se revoca, acceso denegado. |
| 2:30–3:00 | Por qué Ethereum: la cadena no ejecuta la IA, declara qué IA tiene permiso de escucharte y quién puede leerte. Nombrar los mecanismos con sus palabras (local-first, encrypted storage, TEE con attestation, y ZK si llegaste a los vales). Cerrar con el SDK abierto y qué harías con 30 días en ShanHaiWoo. |

### Preguntas del jurado y respuestas cortas

- **¿La IA es local de verdad?** Por defecto, sí. Si el equipo no alcanza, pasa a un enclave verificable. La voz es opcional y sin retención.
- **¿Por qué Ethereum y no una base de datos?** Porque la firma de la persona, la credencial del profesional y el registro de primera apertura no dependen de que confíes en nosotros: ni Nadie puede falsificarlos ni borrarlos.
- **¿Quién verifica a los psicólogos?** En el MVP, Nadie revisa la matrícula. El diseño permite que mañana lo haga el colegio profesional o una prueba zkTLS.
- **¿Qué pasa en una crisis?** Detección local y ayuda humana inmediata en pantalla. Nunca compartimos nada sin consentimiento.
- **¿Qué pasa si revoco después de que leyó?** Se corta el acceso futuro; lo leído no se puede des-leer. Por eso se comparten resúmenes y los permisos vencen pronto.
- **¿Qué harías con 30 días en ShanHaiWoo?** Un piloto con un centro de bienestar universitario, 20 usuarios, 3 psicólogos verificados y la v1 del SDK.

---

## 17. Open source

- **Paquete 1:** contratos (ProfessionalRegistry + ConsentRegistry) con tests.
- **Paquete 2:** SDK de consentimiento 2-de-2 para datos sensibles de IA: cifrar, envolver llaves, firmar, verificar y auditar. Sirve para cualquier app de salud, educación o recursos humanos.
- **Paquete 3:** portal de ejemplo para profesionales.
- Licencia MIT, con README de arquitectura y guía de integración. Esto también encaja con el track 04.

---

## 18. Qué revisaríamos al crecer

- App nativa para usar los modelos del propio sistema (Apple Foundation Models, Gemini Nano) y rendir mejor en celulares modestos.
- Verificación de matrícula con zkTLS. Bolivia no tiene consulta pública de matrículas de salud en línea: el Ministerio mantiene la base pero el trámite es presencial. La ruta viable es que el profesional pruebe su matrícula desde su propia cuenta en el portal del Ministerio, que es justo el caso de uso de zkTLS (datos detrás de un login). Reclaim genera providers con IA, lo que hace realista construirlo fuera del apuro del hackathon.
- Verificación de mayoría de edad con zkTLS sobre Ciudadanía Digital, sin revelar identidad.
- ModelRegistry en producción, con las medidas de enclave autorizadas y su revocación on-chain.
- Agregados con privacidad diferencial para universidades: pagan por la foto general y nunca ven a una persona.
- Pago de sesiones con stablecoins, atado al permiso de acceso.
- Sincronización cifrada entre dispositivos.
- Auditoría de seguridad externa antes de tener usuarios reales.

---

## Referencias

- Tracks del EAG Global Buildathon (edición Florianópolis): https://luma.com/5fbmh4p9
- EAG, misión, valores e iniciativa global: https://www.ethappsguild.org/ y https://www.ethappsguild.org/global
- Setup de IA local de Vitalik (cobertura): https://crypto-economy.com/vitalik-buterin-pushes-for-user-controlled-ai-in-new-self-sovereign-llm-thesis/
- WebLLM: https://github.com/mlc-ai/web-llm
- Inferencia confidencial: https://docs.phala.network/phala-cloud/confidential-ai/gpu-tee/llm-in-tee y https://tinfoil.sh/
- ElevenLabs Zero Retention Mode: https://elevenlabs.io/docs/eleven-agents/customization/privacy/zrm
- KYC de HSK Chain: https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/KYC
