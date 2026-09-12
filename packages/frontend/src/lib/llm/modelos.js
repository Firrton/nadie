/* La escalera de modelos locales.

   ESTE ES EL ÚNICO ARCHIVO DE LA APP QUE PUEDE CONTENER UNA URL EXTERNA, y hay
   un test que lo afirma. Son los pesos del modelo y su runtime: lo único que
   Nadie baja de afuera, una sola vez, antes de que exista una conversación.

   POR QUÉ SE DECLARAN A MANO Y NO SE USA `prebuiltAppConfig`: el catálogo que
   trae WebLLM son ~100 modelos con sus URLs. Importarlo mete cien destinos
   externos en el bundle, de los cuales elegimos uno. Declarando solo los
   nuestros, la lista de todo lo que la app puede pedirle a un tercero entra en
   una pantalla y se revisa leyendo. Una promesa de privacidad que no se puede
   auditar de un vistazo no es una promesa.

   POR QUÉ ES UNA ESCALERA Y NO UNA CONSTANTE: el roadmap dice celulares y el
   demo corre en laptop. Si el modelo fuera un solo valor hardcodeado, "vamos a
   soportar celulares" sería una promesa en un README. Siendo una escalera, el
   peldaño de celular EXISTE hoy, con su tamaño real, y lo que falta es
   verificarlo en un equipo — que es una afirmación mucho más honesta. */

const HF = 'https://huggingface.co/mlc-ai/';
const LIBS_HOST = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/';

/* La versión del runtime va PINEADA: `v0_2_84/base` es la que corresponde a la
   0.2.85 de la librería. Un prefijo sin versión seguiría a `main` y cambiaría el
   binario bajo los pies sin que nadie lo note en un diff. */
const LIBS = LIBS_HOST + 'main/web-llm-models/v0_2_84/base/';

/* Los hosts que la app puede contactar. Cualquier otro es una regresión, y el
   test de red los usa como lista blanca — no como excepción enterrada.

   Son HOSTS (origen + organización), no URLs completas, porque la propia
   librería arma sus rutas con el mismo prefijo: declarar el host dice la verdad
   sobre con quién habla la app, que es lo que el test tiene que poder afirmar. */
export const HOSTS_DE_MODELO = [HF, LIBS_HOST];

/* LA ESCALERA SON LOS MODELOS QUE ESTAMOS DISPUESTOS A SERVIR, no el catálogo de
   lo que existe. Un peldaño entra acá cuando lo medimos con el banco.

   Ordenada de más capaz a más liviana. `vramMB` sale del `vram_required_MB` que
   declara WebLLM en su config.ts, no de una estimación nuestra. */
export const ESCALERA = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    vramMB: 1629.75,
    lib: 'Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm',
    peldano: 'escritorio',
    nota: 'El elegido. Único con 3/3 en extracción de memoria y 3.5x más rápido que el 1B.',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    vramMB: 879.04,
    lib: 'Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm',
    peldano: 'celular',
    nota: 'Último recurso. Medido: dice incoherencias y llegó a sugerir un remedio casero.',
  },
];

/* Bajado a medias o sin medir: NO se sirve hasta pasar por el banco. Vive acá y
   no en la escalera porque poner un modelo sin probar en producción es
   exactamente lo que el banco existe para evitar. El 3B de Llama era el
   candidato original por tabla; nunca se llegó a correr. */
export const SIN_PROBAR = [
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    vramMB: 2263.69,
    lib: 'Llama-3.2-3B-Instruct-q4f16_1_cs1k-webgpu.wasm',
    peldano: 'escritorio',
    nota: 'Sin medir. No entra junto a los otros dos en la cuota del navegador (3470 MB).',
  },
];

export const MODELO_POR_DEFECTO = ESCALERA[0].id;

/* El AppConfig que espera WebLLM, armado solo con lo nuestro.

   `base` permite servir los pesos desde OTRO origen. No es una comodidad de
   desarrollo: para una app que se presenta como privada, depender del CDN de un
   tercero para el archivo más grande que baja es una dependencia que conviene
   poder sacarse. Un despliegue que aloje los pesos en su propio dominio pasa su
   URL y nada más cambia.

   Cuando hay `base`, los archivos se piden como `<base>/<model_id>/...` y el
   wasm como `<base>/<model_id>/modelo.wasm`, que es el layout que deja
   `banco/bajar-modelo.sh`. WebLLM le agrega `resolve/main/` a cualquier URL
   (cleanModelUrl es incondicional), así que quien sirva esos archivos tiene que
   entender ese tramo — el servidor del banco lo hace. */
export function appConfigDe(escalera = ESCALERA, base = null) {
  return {
    model_list: escalera.map((m) => ({
      model: base ? base + '/' + m.id : HF + m.id,
      model_id: m.id,
      model_lib: base ? base + '/' + m.id + '/modelo.wasm' : LIBS + m.lib,
      vram_required_MB: m.vramMB,
      low_resource_required: true,
      overrides: { context_window_size: 4096 },
    })),
  };
}

/* Piso del spec de WebGPU para maxStorageBufferBindingSize: 128 MiB. Un equipo
   que reporta exactamente esto no está diciendo "tengo poca memoria", está
   diciendo "no implementé más que el mínimo", y ahí NINGÚN modelo de la
   escalera entra por más chico que sea. Es el muro que hoy frena a los
   celulares, y no se corre eligiendo un modelo más liviano. */
export const PISO_WEBGPU_MB = 128;

/* Margen sobre el presupuesto declarado. Un modelo no solo carga sus pesos:
   necesita espacio para el KV cache de la conversación. */
const MARGEN = 1.2;

/* Elige el peldaño más alto que entra, o null si no entra ninguno.

   HONESTIDAD SOBRE EL HEURÍSTICO: WebGPU NO expone la VRAM del equipo. No hay
   API para preguntarlo. `maxBufferSize` es lo más cercano que hay y es un
   PROXY, no una medición. Por eso esto está acá, en una función pura con
   tests, y no escondido adentro del adaptador: el día que se demuestre flojo
   en un equipo real, se corrige en un solo lugar y se ve en el diff.

   Devolver null NO es un error: ARQUITECTURA §4.3 dice que si no hay WebGPU o
   memoria suficiente, se ofrece el nivel 2 (enclave). Quien llama decide. */
export function elegirModelo(capacidad, escalera = ESCALERA) {
  if (!capacidad || !capacidad.soportado) return null;
  if (capacidad.maxStorageBindingMB != null && capacidad.maxStorageBindingMB <= PISO_WEBGPU_MB) return null;

  const presupuesto = capacidad.maxBufferMB;
  if (!presupuesto) return null;

  return escalera.find((m) => m.vramMB * MARGEN <= presupuesto) || null;
}
