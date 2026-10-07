import { vi } from 'vitest';
import type { ElectronAPI } from '../../types/electron';

export const createApiMock = (): ElectronAPI => ({
    db: {
        getProducts: vi.fn().mockResolvedValue([]),
        getProductByBarcode: vi.fn().mockResolvedValue(undefined),
        searchProducts: vi.fn().mockResolvedValue([]),
        saveProduct: vi.fn().mockResolvedValue({ id: 1, updated: false }),
        deleteProduct: vi.fn().mockResolvedValue(undefined),

        getCategories: vi.fn().mockResolvedValue([]),
        addCategory: vi.fn().mockResolvedValue(1),

        getLastClosingAmount: vi.fn().mockResolvedValue(null),
        getSessionStatus: vi.fn().mockResolvedValue(undefined),
        openCaja: vi.fn().mockResolvedValue({ id: 1 }),
        closeCaja: vi.fn().mockResolvedValue(undefined),
        getCajaActual: vi.fn().mockResolvedValue({ efectivo: 0, otros: 0 }),
        getTotalesSugeridos: vi.fn().mockResolvedValue({ efectivo: 0, otros: 0 }),
        getSalesForSession: vi.fn().mockResolvedValue([]),
        getSaleDetails: vi.fn().mockResolvedValue([]),
        createSale: vi.fn().mockResolvedValue({ ventaId: 1 }),

        getReportDetail: vi.fn().mockResolvedValue([]),
        getReportMonthly: vi.fn().mockResolvedValue([]),
        clearHistory: vi.fn().mockResolvedValue(undefined),

        getClients: vi.fn().mockResolvedValue([]),
        addClient: vi.fn().mockResolvedValue({ id: 1 }),
        payClientDebt: vi.fn().mockResolvedValue(undefined),
        addClientDebt: vi.fn().mockResolvedValue(undefined),
        getClientSales: vi.fn().mockResolvedValue([]),
        deleteClient: vi.fn().mockResolvedValue(undefined),

        addMovimiento: vi.fn().mockResolvedValue(undefined),
        getMovimientos: vi.fn().mockResolvedValue([]),

        getSuppliers: vi.fn().mockResolvedValue([]),
        saveSupplier: vi.fn().mockResolvedValue({ id: 1, updated: false }),
        deleteSupplier: vi.fn().mockResolvedValue(undefined),
        getSuppliersByProduct: vi.fn().mockResolvedValue([]),
        getProductsBySupplier: vi.fn().mockResolvedValue([]),
        updateProductSuppliers: vi.fn().mockResolvedValue(undefined),

        getStatsResumen: vi.fn().mockResolvedValue({ total_ventas: 0, ingresos: 0, ganancia: 0, ticket_promedio: 0 }),
        getTopProductos: vi.fn().mockResolvedValue([]),
        getMenosVendidos: vi.fn().mockResolvedValue([]),
        getStatsMetodoPago: vi.fn().mockResolvedValue([]),
        getStatsCategorias: vi.fn().mockResolvedValue([]),
        getStatsHoraPico: vi.fn().mockResolvedValue([]),
        getProductosBajoStock: vi.fn().mockResolvedValue([]),
    },
    barcode: {
        lookup: vi.fn().mockResolvedValue({ found: false }),
    },
});
