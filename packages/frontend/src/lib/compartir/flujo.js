import { turnosAMensajes } from '../llm/messages.js';
import { dateKey } from '../moodLog.js';
import { armarDocumento } from './documento.js';

/* Del final de la conversación al texto que la persona aprueba.

   El modelo REDACTA (título y resumen). Las FECHAS las pone el dispositivo: el
   modelo no sabe qué día es, y un rango inventado en un documento para una
   profesional es un dato falso, no un detalle de estilo. */

const SEMANAS = 4;
const DIAS = SEMANAS * 7;

export async function prepararBorrador({ puerto, turnos, entradas, hoy = new Date() }) {
  const redactado = await puerto.extract(turnosAMensajes(turnos), 'share-summary');

  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - (DIAS - 1));
  const dateRange = { from: dateKey(desde), to: dateKey(hoy) };
  const borrador = { ...redactado, dateRange };

  const enVentana = Object.fromEntries(
    Object.entries(entradas).filter(([fecha]) => fecha >= dateRange.from && fecha <= dateRange.to),
  );

  return { borrador, documento: armarDocumento({ borrador, entradas: enVentana }) };
}
