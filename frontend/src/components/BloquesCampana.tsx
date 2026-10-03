export interface BloqueCampana {
  tipo: string;
  total: number;
  lineas: Array<{ locacion: string; punto: string; cantidad: number }>;
}

// Dónde sale la campaña: por tipo de soporte, con locación y punto exacto.
function BloquesCampana({ bloques }: { bloques: BloqueCampana[] }) {
  if (!bloques || bloques.length === 0) return <span style={{ color: '#888' }}>Sin ubicaciones cargadas</span>;
  return (
    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
      {bloques.map((b, i) => (
        <li key={i}>
          <strong>{b.tipo}</strong>
          {b.lineas.length > 1 || b.lineas.some((l) => l.cantidad > 1) ? ` — Total: ${b.total}` : ''}
          <ul style={{ margin: 0, paddingLeft: '1.1rem', listStyle: 'circle' }}>
            {b.lineas.map((l, j) => (
              <li key={j}>
                {l.locacion} — {l.punto}
                {l.cantidad > 1 ? ` (x${l.cantidad})` : ''}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default BloquesCampana;
