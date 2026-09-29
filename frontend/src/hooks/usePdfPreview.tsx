import type jsPDF from 'jspdf';

// Abre el PDF recién generado con jsPDF en una pestaña nueva, en vez de
// forzar la descarga directo (doc.save) — deja al usuario revisar el
// documento antes de guardarlo, con los propios controles de
// descargar/imprimir del visor nativo del navegador.
//
// Antes esto se mostraba embebido en un <iframe> dentro de un modal de la
// misma página, pero imprimir desde ahí adentro no respetaba el nombre del
// archivo (el diálogo de impresión toma el título del documento de más
// arriba, no el del iframe) — una pestaña real, top-level, no tiene ese
// problema.
export function usePdfPreview() {
  const mostrarPdf = (doc: jsPDF, nombreArchivo: string, ventanaPrevia?: Window | null) => {
    // El visor de PDF de Chrome no usa el nombre del blob para su título ni
    // para lo que sugiere al descargar/imprimir desde ahí adentro — usa el
    // metadato interno "Title" del PDF. Sin esto, el preview se ve/descarga
    // con un uuid imposible de identificar, sin importar cómo se llame el
    // blob.
    doc.setProperties({ title: nombreArchivo.replace(/\.pdf$/i, '') });
    const blob = doc.output('blob');
    const file = new File([blob], nombreArchivo, { type: 'application/pdf' });
    const url = URL.createObjectURL(file);
    if (ventanaPrevia) ventanaPrevia.location.href = url;
    else window.open(url, '_blank');
  };

  return { mostrarPdf };
}

// Abre una pestaña en blanco ANTES de cualquier operación async (ej. cargar
// una imagen) — si la pestaña se abre recién después de un await, el
// navegador la trata como pop-up no solicitado y la bloquea silenciosamente.
// Se usa solo en los exports que necesitan await antes de armar el PDF;
// devuelve null si el navegador la bloqueó igual (nada que hacerle ahí).
export function abrirPestañaPrevia(): Window | null {
  return window.open('', '_blank');
}

// Un solo control (desplegable) para "Vista previa" / "Descargar", en vez de
// dos botones separados — reutilizado en todos los exports PDF de la app.
export function PdfExportMenu({
  onPreview,
  onDescargar,
  disabled,
  etiqueta = 'PDF',
}: {
  onPreview: () => void;
  onDescargar: () => void;
  disabled?: boolean;
  etiqueta?: string;
}) {
  return (
    <select
      className="btn-secondary"
      value=""
      disabled={disabled}
      onChange={(e) => {
        const valor = e.target.value;
        e.target.value = '';
        if (valor === 'preview') onPreview();
        else if (valor === 'descargar') onDescargar();
      }}
    >
      <option value="">{etiqueta}...</option>
      <option value="preview">Vista previa</option>
      <option value="descargar">Descargar</option>
    </select>
  );
}
