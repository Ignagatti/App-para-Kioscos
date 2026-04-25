import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    db: {
        getProducts: () => ipcRenderer.invoke('db:getProducts'),
        getProductByBarcode: (barcode: string) => ipcRenderer.invoke('db:getProductByBarcode', barcode),
        searchProducts: (query: string) => ipcRenderer.invoke('db:searchProducts', query),
        saveProduct: (data: any) => ipcRenderer.invoke('db:saveProduct', data),
        deleteProduct: (id: number) => ipcRenderer.invoke('db:deleteProduct', id),
        getCategories: () => ipcRenderer.invoke('db:getCategories'),
        addCategory: (nombre: string) => ipcRenderer.invoke('db:addCategory', nombre),
        getSessionStatus: () => ipcRenderer.invoke('db:getSessionStatus'),
        openCaja: (monto: number) => ipcRenderer.invoke('db:openCaja', monto),
        closeCaja: (data: any) => ipcRenderer.invoke('db:closeCaja', data),
        getCajaActual: (sessionId: number) => ipcRenderer.invoke('db:getCajaActual', sessionId),
        getSalesForSession: (sessionId: number) => ipcRenderer.invoke('db:getSalesForSession', sessionId),
        getSaleDetails: (ventaId: number) => ipcRenderer.invoke('db:getSaleDetails', ventaId),
        createSale: (data: any) => ipcRenderer.invoke('db:createSale', data),
        getReportDetail: () => ipcRenderer.invoke('db:getReportDetail'),
        getReportMonthly: () => ipcRenderer.invoke('db:getReportMonthly'),
        getClients: () => ipcRenderer.invoke('db:getClients'),
        addClient: (data: any) => ipcRenderer.invoke('db:addClient', data),
        payClientDebt: (data: any) => ipcRenderer.invoke('db:payClientDebt', data),
        getClientSales: (clientId: number) => ipcRenderer.invoke('db:getClientSales', clientId),
        addMovimiento: (data: any) => ipcRenderer.invoke('db:addMovimiento', data),
        getMovimientos: (sessionId: number) => ipcRenderer.invoke('db:getMovimientos', sessionId),
    },
    barcode: {
        lookup: (barcode: string) => ipcRenderer.invoke('api:lookupBarcode', barcode),
    },
});
