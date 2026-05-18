import type { ElectronAPI, Product, Category, SessionStatus, Client } from './electron';

// Mock data for development
const mockProducts: Product[] = [
    { id: 1, codigo_barras: '123456789', nombre: 'Agua Mineral 500ml', precio: 50, precio_costo: 30, stock: 100, categoria_id: 1, es_por_kilo: 0, precio_por_kilo: 0, categoria: 'Bebidas' },
    { id: 2, codigo_barras: '987654321', nombre: 'Pan Blanco', precio: 150, precio_costo: 80, stock: 50, categoria_id: 2, es_por_kilo: 0, precio_por_kilo: 0, categoria: 'Panadería' },
    { id: 3, codigo_barras: '111111111', nombre: 'Queso Fresco', precio: 400, precio_costo: 250, stock: 20, categoria_id: 3, es_por_kilo: 1, precio_por_kilo: 200, categoria: 'Lácteos' },
];

const mockCategories: Category[] = [
    { id: 1, nombre: 'Bebidas' },
    { id: 2, nombre: 'Panadería' },
    { id: 3, nombre: 'Lácteos' },
];

const mockClients: Client[] = [
    { id: 1, nombre: 'Juan Pérez', saldo: 1500, telefono: '1234567890' },
    { id: 2, nombre: 'María García', saldo: 800, telefono: '0987654321' },
];

const mockSession: SessionStatus | undefined = undefined;

export const mockElectronAPI: ElectronAPI = {
    db: {
        getProducts: async () => mockProducts,
        getProductByBarcode: async (barcode: string) => mockProducts.find(p => p.codigo_barras === barcode),
        searchProducts: async (query: string) => mockProducts.filter(p => p.nombre.toLowerCase().includes(query.toLowerCase())),
        saveProduct: async () => ({ id: 1, updated: true }),
        deleteProduct: async () => {},
        
        getCategories: async () => mockCategories,
        addCategory: async () => 1,
        
        getLastClosingAmount: async () => 5000,
        getSessionStatus: async () => mockSession,
        openCaja: async () => ({ id: 1 }),
        closeCaja: async () => {},
        getCajaActual: async () => ({ efectivo: 2000, otros: 500 }),
        getTotalesSugeridos: async () => ({ efectivo: 1900, otros: 480 }),
        getSalesForSession: async () => [],
        getSaleDetails: async () => [],
        createSale: async () => ({ ventaId: 1 }),
        
        getReportDetail: async () => [],
        getReportMonthly: async () => [],
        clearHistory: async () => {},
        
        getClients: async () => mockClients,
        addClient: async () => ({ id: 3 }),
        payClientDebt: async () => {},
        addClientDebt: async () => {},
        getClientSales: async () => [],
        deleteClient: async () => {},
        
        addMovimiento: async () => {},
        getMovimientos: async () => [],
        getStatsResumen: async () => ({ total_ventas: 0, ingresos: 0, ganancia: 0, ticket_promedio: 0 }),
        getTopProductos: async () => [],
        getMenosVendidos: async () => [],
        getStatsMetodoPago: async () => [],
        getStatsCategorias: async () => [],
        getStatsHoraPico: async () => [],
        getProductosBajoStock: async () => [],
    },
    barcode: {
        lookup: async () => ({
            found: false,
            name: '',
        }),
    },
};

// Setup window.api if it doesn't exist (development mode)
export function setupElectronAPI() {
    if (typeof window !== 'undefined' && !window.api) {
        console.warn('⚠️ Electron API not available - using mock data for development');
        (window as any).api = mockElectronAPI;
    }
}
