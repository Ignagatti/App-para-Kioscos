"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    db: {
        getProducts: () => electron_1.ipcRenderer.invoke('db:getProducts'),
        getProductByBarcode: (barcode) => electron_1.ipcRenderer.invoke('db:getProductByBarcode', barcode),
        searchProducts: (query) => electron_1.ipcRenderer.invoke('db:searchProducts', query),
        saveProduct: (data) => electron_1.ipcRenderer.invoke('db:saveProduct', data),
        deleteProduct: (id) => electron_1.ipcRenderer.invoke('db:deleteProduct', id),
        getCategories: () => electron_1.ipcRenderer.invoke('db:getCategories'),
        addCategory: (nombre) => electron_1.ipcRenderer.invoke('db:addCategory', nombre),
        getSessionStatus: () => electron_1.ipcRenderer.invoke('db:getSessionStatus'),
        openCaja: (monto) => electron_1.ipcRenderer.invoke('db:openCaja', monto),
        closeCaja: (data) => electron_1.ipcRenderer.invoke('db:closeCaja', data),
        getCajaActual: (sessionId) => electron_1.ipcRenderer.invoke('db:getCajaActual', sessionId),
        getSalesForSession: (sessionId) => electron_1.ipcRenderer.invoke('db:getSalesForSession', sessionId),
        getSaleDetails: (ventaId) => electron_1.ipcRenderer.invoke('db:getSaleDetails', ventaId),
        createSale: (data) => electron_1.ipcRenderer.invoke('db:createSale', data),
        getReportDetail: () => electron_1.ipcRenderer.invoke('db:getReportDetail'),
        getReportMonthly: () => electron_1.ipcRenderer.invoke('db:getReportMonthly'),
        getClients: () => electron_1.ipcRenderer.invoke('db:getClients'),
        addClient: (data) => electron_1.ipcRenderer.invoke('db:addClient', data),
        payClientDebt: (data) => electron_1.ipcRenderer.invoke('db:payClientDebt', data),
        getClientSales: (clientId) => electron_1.ipcRenderer.invoke('db:getClientSales', clientId),
        addMovimiento: (data) => electron_1.ipcRenderer.invoke('db:addMovimiento', data),
        getMovimientos: (sessionId) => electron_1.ipcRenderer.invoke('db:getMovimientos', sessionId),
    },
    barcode: {
        lookup: (barcode) => electron_1.ipcRenderer.invoke('api:lookupBarcode', barcode),
    },
});
