// El form guarda los montos como string "crudo" (sin separadores, con punto
// decimal) — estas dos funciones solo convierten esa cadena a formato
// "1.700.000,50" para mostrar y de vuelta al tipear. Compartido por
// cualquier formulario con montos/porcentajes (Órdenes, Liquidaciones).
export function formatearMiles(valorCrudo: string): string {
  if (!valorCrudo) return '';
  const limpio = valorCrudo.replace(/[^\d.]/g, '');
  const [enteros, decimales] = limpio.split('.');
  const enterosFormateados = (enteros || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales !== undefined ? `${enterosFormateados},${decimales}` : enterosFormateados;
}

export function limpiarMiles(texto: string): string {
  const limpio = texto.replace(/[^\d,]/g, '');
  const [enteros, decimales] = limpio.split(',');
  return decimales !== undefined ? `${enteros}.${decimales}` : enteros;
}

export function InputMiles({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={formatearMiles(value)}
      onChange={(e) => onChange(limpiarMiles(e.target.value))}
      onBlur={onBlur}
      disabled={disabled}
      style={style}
    />
  );
}

export function InputPorcentaje({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ paddingRight: '1.6rem', width: '100%', boxSizing: 'border-box' }}
      />
      <span
        style={{
          position: 'absolute',
          right: '0.6rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#666',
          pointerEvents: 'none',
        }}
      >
        %
      </span>
    </div>
  );
}
