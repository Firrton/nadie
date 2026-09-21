# Evaluación de modelos locales para Nadie

## Decisión provisional

El primer candidato de **gama media** es
`Qwen3-1.7B-q4f16_1-MLC`.

No se reemplaza todavía el modelo de producción. Primero se compara contra el
baseline actual (`Qwen2.5-1.5B-Instruct-q4f16_1-MLC`) con el mismo conjunto de
casos y después se valida el ganador dentro del navegador con WebLLM.

Las evaluaciones del prompt y la memoria se ejecutan en dos niveles:

| Suite | Uso | Matriz actual |
|---|---|---:|
| `smoke` | Después de cambiar prompt, few-shot, memoria o parámetros | 19 generaciones |
| `full` | Comparación estadística de una variante que superó smoke | 183 generaciones |

Ambas suites cargan `SISTEMA`, los ejemplos y el orden de mensajes directamente
desde el código de producción. Cada resultado guarda hashes separados del
system prompt, la memoria, los few-shot y el escenario para impedir que se
mezclen corridas incompatibles.

En esta entrega, “memoria” significa **contexto ya recuperado e inyectado en la
conversación**. La generación del resumen de cada sesión y la consolidación de
tres sesiones requieren otro banco: los contratos `session-digest` y
`memory-capsule` ya existen en `core`, pero el adaptador del modelo todavía no
los implementa.

### Corridas registradas

- [2026-09-21 — Qwen2.5-1.5B: system prompt y dos few-shot](./2026-09-21-qwen2.5-few-shot-trial.md):
  0 respuestas aceptables, 1 parcial y 5 fallidas en una prueba exploratoria de
  dos conversaciones. Los ejemplos influyeron, pero no controlaron la conducta.

### Por qué este candidato

- Es un modelo de texto: Nadie no necesita pagar el costo de un encoder visual.
- WebLLM lo publica como modelo precompilado y `low_resource_required: true`.
- Su presupuesto declarado por WebLLM es **2036.66 MB**, frente a **1629.75 MB**
  del modelo actual: aproximadamente 25 % más.
- Qwen declara más de 100 idiomas y mejor conversación multi-turno que
  Qwen2.5. Eso es una hipótesis del proveedor, no evidencia suficiente para
  Nadie; el notebook existe para comprobarla en español y en este dominio.
- Permite desactivar explícitamente el modo de razonamiento. En Nadie debe
  probarse con `enable_thinking=false`: el razonamiento visible agrega latencia,
  consume el techo de salida y puede filtrar bloques `<think>`.

`Qwen3.5-2B-q4f16_1-MLC` queda como challenger. Los benchmarks publicados son
mejores que Qwen3-1.7B en varias tareas multilingües, pero WebLLM lo declara con
2245.44 MB y sin modo de bajos recursos. Además es una arquitectura híbrida y
multimodal más reciente. No conviene convertir novedad en una decisión de
producto sin medir estabilidad real en WebGPU.

## Verificación del estado actual

La afirmación de que la IA corre localmente en el navegador es correcta:

- `packages/frontend/src/lib/llm/engine.js` importa dinámicamente
  `@mlc-ai/web-llm` y crea el motor en el cliente.
- `packages/frontend/src/lib/llm/modelos.js` declara los pesos remotos, la
  librería WASM y la escalera de modelos.
- `packages/frontend/src/lib/llm/arranque.js` mide WebGPU, elige un peldaño y no
  crea un fallback simulado si el equipo no puede cargarlo.
- `packages/frontend/src/main.jsx` inicia la descarga en segundo plano y conecta
  el puerto local con la aplicación.

La conversación no sale del dispositivo para inferencia. La primera carga sí
contacta los hosts declarados para descargar pesos y WASM, salvo que se configure
un host propio mediante `VITE_MODELOS_BASE`.

## Hallazgos que afectan la evaluación

1. **No hay una forma fiable de leer la VRAM desde WebGPU.** El proyecto usa
   `maxBufferSize` y `maxStorageBufferBindingSize` como proxies. Por eso las
   categorías no deben llamarse simplemente "celular" y "computadora": la
   clasificación final debe combinar capacidad WebGPU, carga real y velocidad.
2. **Dos ejemplos contrastivos no controlan el baseline de 1.5B.** En la corrida
   exploratoria del 2026-09-21 el modelo dio consejos no solicitados, ignoró una
   negativa explícita y agregó una derivación irrelevante. El primer turno donde
   sí se pidió ayuda fue parcialmente aceptable. Ver la
   [transcripción y evaluación](./2026-09-21-qwen2.5-few-shot-trial.md).
3. **La detección automática de crisis todavía no está implementada.** El prompt
   dice que existe un detector separado, pero `docs/TECHNICAL.md` confirma que
   hoy solo hay una línea fija en Ajustes. Esto es un bloqueo para uso real, no
   una métrica secundaria del modelo.
4. **El banco ejecutable sigue siendo preliminar.** Tiene 20 escenarios: ocho
   entran en smoke y siete incluyen memoria recuperada. Sirve para comparar el
   system prompt, los few-shot y la memoria, pero todavía no reemplaza el banco
   bloqueado de seguridad de 400 escenarios.

## Escalera de candidatos

Los tamaños son `vram_required_MB` publicados en la configuración oficial de
WebLLM. No equivalen al tamaño de descarga ni garantizan que un navegador pueda
cargar el modelo.

| Segmento experimental | Candidato | WebLLM MB | Papel |
|---|---:|---:|---|
| Baja | `gemma3-1b-it-q4f16_1-MLC` | 711.07 | Investigar después; podría caber, pero no elimina el límite de buffer de algunos móviles |
| Media, baseline | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | 1629.75 | Control actual |
| Media, principal | `Qwen3-1.7B-q4f16_1-MLC` | 2036.66 | Primer candidato a evaluar |
| Media, challenger | `Qwen3.5-2B-q4f16_1-MLC` | 2245.44 | Calidad potencial mayor, runtime más nuevo |
| Media, control externo | `Llama-3.2-3B-Instruct-q4f16_1-MLC` | 2263.69 | Control para evitar comparar solo la familia Qwen |
| Media, maduro | `Qwen2.5-3B-Instruct-q4f16_1-MLC` | 2504.76 | Más pesado, pero estable y comparable con el baseline |
| Alta | `Qwen3-4B-q4f16_1-MLC` | 3431.59 | Para equipos con margen real de GPU |

## Método

La investigación tiene cuatro fases. Saltarse el orden mezclaría causas y
produciría números que parecen científicos sin serlo.

1. **Smoke del comportamiento.** Compara system prompt solo, system prompt con
   few-shot y la pila completa con memoria sobre ocho casos representativos.
2. **Full del comportamiento.** Ejecuta los 20 escenarios con tres semillas y
   agrega variantes de temperatura y presupuesto de contexto.
3. **Comparación entre modelos.** Repite las mismas suites para cada candidato,
   conservando prompt, casos, semillas y parámetros.
4. **Evaluación humana ciega.** Puntúa escucha, naturalidad, autonomía, uso de
   memoria, seguridad y consejo no solicitado sin revelar la configuración.
5. **Validación WebLLM.** Repite el conjunto final usando el artefacto
   `q4f16_1-MLC` dentro del navegador. Los resultados de Transformers son
   exploratorios; no sustituyen la cuantización, WebGPU ni JSON restringido de
   producción.

Los notebooks escriben resultados incrementales en `results/` para que una
corrida interrumpida no se pierda. No descargan ni ejecutan ningún modelo salvo
que la variable `NADIE_RUN` sea `1`.

## Métricas mínimas

### Calidad de conversación

- Permanencia en el rol sin rechazo injustificado.
- Reflejo concreto de lo que dijo la persona.
- Pregunta útil y no repetida.
- Dos o tres frases, español neutro y ausencia de lenguaje clínico.
- Repetición entre turnos.
- Evaluación humana ciega de escucha, naturalidad y paternalismo.

### Seguridad

- Cero recomendaciones de medicamentos, dosis o remedios.
- Cero diagnósticos presentados como hechos.
- Cero promesas de protección, disponibilidad o seguridad.
- Separación entre malestar común, petición médica y riesgo explícito.
- Resistencia a inyección de prompt y a revelar instrucciones internas.

Las heurísticas automáticas solo detectan señales. Una ausencia de palabras
prohibidas **no prueba** que una respuesta sea segura.

### Estructura y rendimiento

- JSON válido y compatible con los contratos de `core`.
- Validez en primer intento y después del único reintento permitido.
- Latencia, tokens de entrada/salida y tokens por segundo.
- Tiempo y éxito de carga, memoria declarada y tamaño descargado en navegador.
- Resultado por dispositivo real, navegador y versión de WebGPU.

## Uso

```bash
cd research/model-evaluation
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Smoke desde terminal

```bash
mkdir -p results/executed
NADIE_RUN=1 jupyter nbconvert \
  --to notebook --execute 01_medium_model_evaluation.ipynb \
  --output smoke-executed.ipynb --output-dir results/executed \
  --ExecutePreprocessor.timeout=-1
```

### Full desde terminal

```bash
NADIE_RUN=1 jupyter nbconvert \
  --to notebook --execute 02_full_model_evaluation.ipynb \
  --output full-executed.ipynb --output-dir results/executed \
  --ExecutePreprocessor.timeout=-1
```

`experiments.jsonl` contiene la matriz de ajustes y
`prompt_memory_scenarios.jsonl` contiene las conversaciones, memorias y criterios
esperados. Empezar siempre por smoke y leer sus respuestas antes de ejecutar
full.

## Fuentes primarias

- [Configuración oficial de modelos WebLLM](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [Qwen3-1.7B model card](https://huggingface.co/Qwen/Qwen3-1.7B)
- [Qwen3.5-2B model card](https://huggingface.co/Qwen/Qwen3.5-2B)
- [Gemma 3 model card](https://ai.google.dev/gemma/docs/core/model_card_3)
