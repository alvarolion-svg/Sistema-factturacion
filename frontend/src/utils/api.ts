export function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Los formularios de alta/edición (className="cliente-form") se renderizan
// arriba de la página, mientras que el botón "Editar" que los abre suele
// estar en una fila más abajo en una lista larga — sin este scroll, el
// usuario no ve que el formulario ya se abrió. Se llama justo después de
// mostrar el formulario (con setTimeout para esperar a que React lo
// renderice); recibe un selector opcional por si el formulario tiene una
// clase distinta a la genérica.
export function scrollAlFormulario(selector: string = '.cliente-form') {
  setTimeout(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

export function mensajeError(err: any, fallback: string): string {
  const mensaje = err?.response?.data?.error;
  if (mensaje) return mensaje;
  if (err?.request) return 'No se pudo conectar con el servidor. Verificá que el backend esté encendido.';
  return fallback;
}

const formateadorMoneda = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '-';
  return `$${formateadorMoneda.format(Number(valor))}`;
}

export function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return '-';

  // Fechas "solo día" (YYYY-MM-DD) se arman en horario local para que no
  // retrocedan un día al mostrarse (new Date('YYYY-MM-DD') las interpreta como UTC).
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (soloFecha) {
    const [, anio, mes, dia] = soloFecha;
    const d = new Date(Number(anio), Number(mes) - 1, Number(dia));
    return d.toLocaleDateString('es-AR');
  }

  const d = new Date(fecha);
  if (isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString('es-AR');
}
