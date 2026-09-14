const API_BASE = 'http://localhost:5000/api';

class API {
  static async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error en API:', error);
      throw error;
    }
  }

  // Productos
  static async obtenerProductos() {
    return this.request('GET', '/productos');
  }

  static async crearProducto(datos) {
    return this.request('POST', '/productos', datos);
  }

  // Clientes
  static async obtenerClientes() {
    return this.request('GET', '/clientes');
  }

  static async crearCliente(datos) {
    return this.request('POST', '/clientes', datos);
  }

  // Facturas
  static async obtenerFacturas() {
    return this.request('GET', '/facturas');
  }

  static async obtenerFactura(id) {
    return this.request('GET', `/facturas/${id}`);
  }

  static async crearFactura(datos) {
    return this.request('POST', '/facturas', datos);
  }

  // Cobros
  static async registrarCobro(datos) {
    return this.request('POST', '/cobros', datos);
  }

  // Notas de Crédito
  static async crearNotaCredito(datos) {
    return this.request('POST', '/notas-credito', datos);
  }

  // Tesorería
  static async obtenerEstadoTesoreria() {
    return this.request('GET', '/tesoreria/estado');
  }

  static async crearCuenta(datos) {
    return this.request('POST', '/cuentas', datos);
  }

  // Auditoría
  static async obtenerAuditoria(tabla, id) {
    return this.request('GET', `/auditoria/${tabla}/${id}`);
  }
}
