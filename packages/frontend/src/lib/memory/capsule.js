const RESUMENES_POR_CAPSULA = 3;

/* Mantiene como máximo dos resúmenes pendientes. El tercero se consolida con
   la cápsula anterior y la reemplaza, así el contexto no crece con el tiempo. */
export async function incorporarResumen(
  { capsula = null, pendientes = [] },
  resumen,
  consolidar,
) {
  if (pendientes.length >= RESUMENES_POR_CAPSULA) {
    throw new Error('la memoria tiene demasiados resúmenes pendientes');
  }

  const siguientes = [...pendientes, resumen];
  if (siguientes.length < RESUMENES_POR_CAPSULA) {
    return { capsula, pendientes: siguientes };
  }
  if (typeof consolidar !== 'function') {
    throw new Error('falta la función para consolidar la memoria');
  }

  const nueva = await consolidar({ anterior: capsula, sesiones: siguientes });
  return { capsula: nueva, pendientes: [] };
}
