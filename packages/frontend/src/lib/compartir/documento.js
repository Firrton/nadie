/* El documento que lee la psicóloga.

   Es TEXTO PLANO a propósito: el portal muestra lo descifrado tal cual, con los
   saltos de línea respetados. No hace falta que nadie lo interprete para que se
   lea bien, y lo que la persona aprueba en pantalla es exactamente lo que viaja.

   Lleva solo lo que la persona aprobó: el resumen que redactó el modelo y su
   diario de ánimo. La conversación entera NO viaja. */

export function armarDocumento({ borrador, entradas }) {
  const partes = [
    borrador.title,
    borrador.dateRange.from + ' a ' + borrador.dateRange.to,
    '',
    borrador.body,
  ];

  const fechas = Object.keys(entradas).sort();
  if (fechas.length > 0) {
    partes.push('', 'Diario de ánimo (1 a 10)');
    fechas.forEach((fecha) => {
      const { score, note } = entradas[fecha];
      partes.push(fecha + '  ' + score + '/10' + (note ? '  ' + note : ''));
    });
  }

  return partes.join('\n');
}
