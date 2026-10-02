import { useEffect, useRef, useState } from 'react';

interface SelectorMultipleProps {
  id?: string;
  opciones: string[];
  valor: string[];
  onChange: (valor: string[]) => void;
  style?: React.CSSProperties;
}

// Se ve igual que un <select> (de hecho cerrado ES un <select>, así hereda el
// estilo de cada pantalla) pero al abrirlo permite tildar varias opciones.
// valor vacío = todas ("Todos").
function SelectorMultiple({ id, opciones, valor, onChange, style }: SelectorMultipleProps) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrarAlClickAfuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrarAlClickAfuera);
    return () => document.removeEventListener('mousedown', cerrarAlClickAfuera);
  }, [abierto]);

  const resumen = valor.length === 0 ? 'Todos' : valor.length === 1 ? valor[0] : `${valor.length} seleccionados`;

  const alternar = (opcion: string) =>
    onChange(valor.includes(opcion) ? valor.filter((v) => v !== opcion) : [...valor, opcion]);

  const filaStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.4rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'normal',
    whiteSpace: 'nowrap',
    margin: 0,
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <select
        id={id}
        value="resumen"
        onChange={() => {}}
        onMouseDown={(e) => {
          e.preventDefault();
          setAbierto((a) => !a);
        }}
        onKeyDown={(e) => {
          if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            setAbierto(true);
          } else if (e.key === 'Escape') {
            setAbierto(false);
          }
        }}
        style={style}
      >
        <option value="resumen">{resumen}</option>
      </select>
      {abierto && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            minWidth: '100%',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '6px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
            padding: '0.3rem 0',
          }}
        >
          <label style={filaStyle}>
            <input type="checkbox" checked={valor.length === 0} onChange={() => onChange([])} />
            Todos
          </label>
          {opciones.map((o) => (
            <label key={o} style={filaStyle}>
              <input type="checkbox" checked={valor.includes(o)} onChange={() => alternar(o)} />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default SelectorMultiple;
