# Nadie — contexto para Claude Code

App móvil de voz para desahogo emocional. Español, mobile-first (390px), modo
oscuro como único modo. Lee `README.md` completo antes de tocar nada.

## Reglas que no se negocian

1. **Copy**: español neutro con tuteo, frases cortas, sentence case. Cero
   palabras clínicas ("terapia", "diagnóstico", "sanar", "tu viaje de
   bienestar"). Nunca prometer curar, diagnosticar ni reemplazar a un
   profesional. Sin emojis.
2. **Privacidad**: nada sale del dispositivo. No guardar transcripciones. No
   entrenar modelos con los datos del usuario. No compartir con terceros. El
   texto de Ajustes lo dice explícito — el código tiene que cumplirlo.
3. **El usuario califica su ánimo**, la app no lo decide por él.
4. **Color**: la interfaz es blanco y negro. Lo único con color es el ánimo —
   azul cuando sube (`--mood-up`), rojo cuando baja (`--mood-down`). No
   introducir otros colores.
5. **Tokens**: usar solo las variables de `src/styles/tokens/`. No inventar
   hex sueltos ni nombres de token nuevos.
6. **Movimiento**: lento y suave, sin rebotes. Respetar
   `prefers-reduced-motion`.
7. **Accesibilidad**: hit targets ≥ 44px, `aria-label` en botones de solo icono,
   contraste ≥ 4.5:1 sobre el fondo oscuro.
8. **El orbe** se construye con círculos concéntricos en opacidad creciente.
   Nunca blur, glow ni gradientes.

## Estética a evitar

Azules suaves, blancos y pasteles de "wellness". Gradientes pastel de app de
meditación. Iconografía clínica. Esquinas redondeadas en un solo lado. Sombras
exageradas.

## Pendientes técnicos

Ver "Lo que hay que construir de verdad" en el README: voz real, modelo,
persistencia local cifrada solo del ánimo, patrones en dispositivo, líneas de
crisis por país.
