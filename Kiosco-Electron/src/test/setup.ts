import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

const makeApiMock = () => ({
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
    },
    barcode: {
        lookup: vi.fn().mockResolvedValue({ found: false }),
    },
});

// Install once; beforeEach resets mocks so implementations stay but call counts clear.
(window as any).api = makeApiMock();

beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default resolved values after clearAllMocks wipes them.
    const api = (window as any).api;
    api.db.getProducts.mockResolvedValue([]);
    api.db.getProductByBarcode.mockResolvedValue(undefined);
    api.db.searchProducts.mockResolvedValue([]);
    api.db.saveProduct.mockResolvedValue({ id: 1, updated: false });
    api.db.deleteProduct.mockResolvedValue(undefined);
    api.db.getCategories.mockResolvedValue([]);
    api.db.addCategory.mockResolvedValue(1);
    api.db.getLastClosingAmount.mockResolvedValue(null);
    api.db.getSessionStatus.mockResolvedValue(undefined);
    api.db.openCaja.mockResolvedValue({ id: 1 });
    api.db.closeCaja.mockResolvedValue(undefined);
    api.db.getCajaActual.mockResolvedValue({ efectivo: 0, otros: 0 });
    api.db.getTotalesSugeridos.mockResolvedValue({ efectivo: 0, otros: 0 });
    api.db.getSalesForSession.mockResolvedValue([]);
    api.db.getSaleDetails.mockResolvedValue([]);
    api.db.createSale.mockResolvedValue({ ventaId: 1 });
    api.db.getReportDetail.mockResolvedValue([]);
    api.db.getReportMonthly.mockResolvedValue([]);
    api.db.clearHistory.mockResolvedValue(undefined);
    api.db.getClients.mockResolvedValue([]);
    api.db.addClient.mockResolvedValue({ id: 1 });
    api.db.payClientDebt.mockResolvedValue(undefined);
    api.db.addClientDebt.mockResolvedValue(undefined);
    api.db.getClientSales.mockResolvedValue([]);
    api.db.deleteClient.mockResolvedValue(undefined);
    api.db.addMovimiento.mockResolvedValue(undefined);
    api.db.getMovimientos.mockResolvedValue([]);
    api.barcode.lookup.mockResolvedValue({ found: false });
});
