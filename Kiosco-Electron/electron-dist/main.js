"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const productApi_1 = require("./services/productApi");
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        title: "KioskoGo",
        icon: path_1.default.join(__dirname, '../assets/logokiosco.ico'),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.setMenuBarVisibility(false);
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        win.loadURL('http://localhost:5173');
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
}
electron_1.app.whenReady().then(() => {
    console.log("Iniciando Aplicación...");
    (0, db_1.initDb)();
    // Loguear tablas existentes para depuración
    try {
        const tables = db_1.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log("Tablas encontradas:", tables.map((t) => t.name).join(', '));
    }
    catch (e) {
        console.error("Error al listar tablas:", e);
    }
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// ══════════════════════════════════════
//  IPC HANDLERS
// ══════════════════════════════════════
// ── Productos ──
electron_1.ipcMain.handle('db:getProducts', () => db_1.dbService.getProducts());
electron_1.ipcMain.handle('db:getProductByBarcode', (_, barcode) => db_1.dbService.getProductByBarcode(barcode));
electron_1.ipcMain.handle('db:searchProducts', (_, query) => db_1.dbService.searchProducts(query));
electron_1.ipcMain.handle('db:saveProduct', (_, data) => db_1.dbService.saveProduct(data));
electron_1.ipcMain.handle('db:deleteProduct', (_, id) => db_1.dbService.deleteProduct(id));
// ── API Externa ──
electron_1.ipcMain.handle('api:lookupBarcode', async (_, barcode) => {
    return await productApi_1.productApiAggregator.lookup(barcode);
});
// ── Categorías ──
electron_1.ipcMain.handle('db:getCategories', () => db_1.dbService.getCategories());
electron_1.ipcMain.handle('db:addCategory', (_, nombre) => db_1.dbService.addCategory(nombre));
// ── Caja ──
electron_1.ipcMain.handle('db:getSessionStatus', () => db_1.dbService.getSessionStatus());
electron_1.ipcMain.handle('db:openCaja', (_, monto) => db_1.dbService.openCaja(monto));
electron_1.ipcMain.handle('db:closeCaja', (_, data) => db_1.dbService.closeCaja(data.sessionId, data.montoEfectivo, data.montoOtros));
electron_1.ipcMain.handle('db:getCajaActual', (_, sessionId) => db_1.dbService.getCajaActual(sessionId));
electron_1.ipcMain.handle('db:getTotalesSugeridos', (_, sessionId) => db_1.dbService.getTotalesSugeridos(sessionId));
electron_1.ipcMain.handle('db:getSalesForSession', (_, sessionId) => db_1.dbService.getSalesForSession(sessionId));
electron_1.ipcMain.handle('db:getSaleDetails', (_, ventaId) => db_1.dbService.getSaleDetails(ventaId));
// ── Ventas ──
electron_1.ipcMain.handle('db:createSale', (_, data) => {
    return db_1.dbService.createSale(data.total, data.items.length, data.paymentMethod, data.sessionId, data.clientId, data.items);
});
// ── Reportes ──
electron_1.ipcMain.handle('db:getReportDetail', () => db_1.dbService.getReportDetail());
electron_1.ipcMain.handle('db:getReportMonthly', () => db_1.dbService.getReportMonthly());
electron_1.ipcMain.handle('db:clearHistory', () => db_1.dbService.clearHistory());
// ── Clientes ──
electron_1.ipcMain.handle('db:getLastClosingAmount', () => db_1.dbService.getLastClosingAmount());
electron_1.ipcMain.handle('db:getClients', () => db_1.dbService.getClients());
electron_1.ipcMain.handle('db:addClient', (_, data) => db_1.dbService.addClient(data.nombre, data.telefono, data.saldo || 0));
electron_1.ipcMain.handle('db:payClientDebt', (_, data) => db_1.dbService.payClientDebt(data.clientId, data.amount, data.metodoPago));
electron_1.ipcMain.handle('db:addClientDebt', (_, data) => db_1.dbService.addClientDebt(data.clientId, data.amount));
electron_1.ipcMain.handle('db:getClientSales', (_, clientId) => db_1.dbService.getClientSales(clientId));
electron_1.ipcMain.handle('db:deleteClient', (_, id) => db_1.dbService.deleteClient(id));
// ── Movimientos ──
electron_1.ipcMain.handle('db:addMovimiento', (_, data) => db_1.dbService.addMovimiento(data.tipo, data.categoria, data.monto, data.descripcion, data.sesionId, data.metodoPago));
electron_1.ipcMain.handle('db:getMovimientos', (_, sessionId) => db_1.dbService.getMovimientos(sessionId));
