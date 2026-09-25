# Exploration: crisis-detector

## Current State

- **Hecho del repositorio:** no hay detección automática. El turno escrito pasa de `useNadie.pushUserTurn` a `speakReply`, que llama directamente a `LLMPort.chat` y muestra la respuesta generada (`packages/frontend/src/state/useNadie.js`). La ayuda visible es `CRISIS_LINE` en Ajustes; no aparece durante la conversación (`packages/frontend/src/data/content.js`, `packages/frontend/src/screens/Settings.jsx`, `docs/TECHNICAL.md` §5).
- El prompt pide al modelo priorizar ayuda humana ante peligro inmediato, pero no hay una comprobación independiente antes ni después de generar (`packages/frontend/src/lib/llm/prompt.js`, `packages/frontend/src/lib/llm/webllm.js`). El `riskLevel` bajo/medio/alto existe en el esquema de **extracción de memoria al cierre**, pero el flujo de conversación no ejecuta esa extracción ni usa esa señal (`packages/core/src/schemas.ts`, `packages/frontend/src/state/useNadie.js`). Esos valores no son una taxonomía clínica validada.
- En el smoke registrado, `crisis_immediate` produjo dos respuestas sin la ayuda inmediata esperada, una de ellas sugirió distracción. Fue una evaluación exploratoria con Transformers, **no** una prueba de WebLLM en producción (`research/model-evaluation/results/smoke/Qwen_Qwen2.5-1.5B-Instruct.jsonl`, `research/model-evaluation/README.md`). El evaluador solo busca expresiones en la respuesta; no mide sensibilidad/especificidad del detector y tiene un único caso de crisis inmediata en `prompt_memory_scenarios.jsonl` (`research/model-evaluation/evaluation_harness.py`).
- `incorporarResumen` consolida cada tercer resumen en una cápsula, pero es un módulo aislado y no está conectado al flujo de sesión. La conversación llama a `chat(..., [])`, por lo que hoy no inyecta memoria recuperada (`packages/frontend/src/lib/memory/capsule.js`, `packages/frontend/src/state/useNadie.js`). No debe condicionarse una alerta inmediata a la compactación ni a una extracción posterior.

## Affected Areas

- `packages/frontend/src/lib/` — lugar de una política local, pura y testeable que examine cada turno antes de generar; sin dependencia clínica o de red nueva.
- `packages/frontend/src/state/useNadie.js` — punto de entrada del texto y de la respuesta; debe preservar cancelación de respuestas en vuelo y no perder la ayuda cuando el modelo falle.
- `packages/frontend/src/screens/Conversation.jsx` y `packages/frontend/src/data/content.js` — apoyo humano visible y copy; cumplir español neutro, tuteo, sin diagnósticos, colores nuevos ni promesas (`packages/frontend/CLAUDE.md`). Mantener el acceso a ayuda sin enviar ni compartir datos automáticamente (`docs/REGLAS.md` §10).
- `research/model-evaluation/` y tests del frontend — casos positivos y negativos, variaciones lingüísticas y revisión humana. El banco existente mide principalmente *la salida del modelo*, no la detección previa.
- `packages/core/src/schemas.ts` — contiene `riskLevel` de extracción; evitar modificarlo para el primer corte si no es necesario. La memoria de tres sesiones es una línea de trabajo separada.

## Approaches

| Enfoque | Ventajas | Límites | Esfuerzo |
|---|---|---|---|
| Reglas locales conservadoras **por turno** para señales explícitas + ayuda aprobada independiente del LLM | Determinista, funciona antes de la respuesta y aunque falle el modelo, auditable, poca superficie | No cubre expresiones indirectas; negación, citas, terceros y lenguaje regional exigen pruebas y revisión | Bajo–medio |
| Clasificador local/modelo como único árbitro | Podría detectar lenguaje indirecto | Latencia y fallos del 1–1.5B; la prueba actual no demuestra fiabilidad; opacidad, validación mayor | Alto |
| Reglas + señal secundaria del modelo | Puede ampliar cobertura después de medir | Dos caminos y conflictos de decisión; la señal actual solo existe al cierre y no está integrada | Medio–alto |

## Recommendation

**Propuesta de diseño, no hecho actual:** empezar con un alcance mínimo: reconocer *solo* señales explícitas revisadas en cada nuevo turno, presentar de inmediato una vía de ayuda humana aprobada y mantener la conversación disponible sin delegar al modelo la decisión de ocultar la ayuda. No clasificar depresión/ansiedad ni asignar niveles clínicos R0–R4. Una señal del modelo podría agregarse después, como complemento medido, nunca como único control. Mantener la detección y la presentación locales, sin guardar la frase detectada, telemetría ni intercambio automático.

Antes de especificar reglas/copy, acordar con una persona clínica cualificada qué señales justifican qué mensaje y cuándo no debe saltar la alerta. El [ASQ de NIMH](https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials) describe un *cribado en entorno sanitario* seguido de evaluación por profesional capacitado; no valida que una app de chat haga triaje autónomo. Las [herramientas C-SSRS de Columbia](https://cssrs.columbia.edu/the-columbia-scale-c-ssrs/cssrs-for-communities-and-healthcare/) son protocolos concretos con variantes por ámbito, no respaldo para una escala propia R0–R4. No trasladar sus etiquetas a Nadie sin validación.

## Risks

- **Falsos negativos:** lenguaje indirecto, eufemismos, ortografía variable, contexto en varios turnos y cambios de idioma. La ausencia de coincidencia no significa seguridad.
- **Falsos positivos:** negaciones, relatos históricos, citas, ficción, terceros y preguntas hipotéticas; pueden interrumpir el desahogo o erosionar confianza. Evaluar ambos tipos con casos etiquetados y revisión humana, no solo coincidencia de palabras.
- **Respuesta de modelo insegura después de detectar:** la ayuda fija debe permanecer visible y no depender de que Qwen la formule correctamente; definir si la respuesta generada se muestra, se reemplaza o se condiciona requiere revisión de seguridad y pruebas.
- **Recursos geográficos:** `CRISIS_LINE` contiene México y España; las fuentes del proyecto piden verificar recursos por país antes del lanzamiento. No inferir ubicación, no inventar números ni mostrar un recurso específico como universal.
- **Disponibilidad:** en equipos sin WebGPU o durante carga, la conversación está bloqueada por el modelo. La ayuda humana debería seguir siendo accesible sin éste; confirmar en propuesta el alcance de entrada desde Home/Ajustes.
- **Privacidad y evidencia:** transcripciones no persistidas ni enviadas; el banco de evaluación guarda escenarios/resultados sintéticos, nunca contenido real. La sensibilidad, umbrales y copy todavía no están validados.

## Ready for Proposal

**Sí, para una propuesta acotada de seguridad local; no para fijar reglas clínicas ni prometer un detector validado.** La propuesta debe separar: (1) comportamiento verificable del producto y límites, (2) reglas/copy/recursos pendientes de revisión cualificada, y (3) matriz de evaluación de falsos negativos y positivos con pruebas de regresión de la ruta previa a Qwen. No tocar memoria ni convertir `riskLevel` de extracción en decisión clínica durante este cambio.
