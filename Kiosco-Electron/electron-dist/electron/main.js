"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const electron_is_dev_1 = __importDefault(require("electron-is-dev"));
const db_js_1 = require("./db.js"); // Usamos .js porque al compilar será JS
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: "Kiosco Pro - Electron Edition",
        webPreferences: {
            preload: path_1.default.join(electron_1.app.getAppPath(), 'electron/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (electron_is_dev_1.default) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    }
    else {
        win.loadFile(path_1.default.join(electron_1.app.getAppPath(), 'dist/index.html'));
    }
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Handlers
electron_1.ipcMain.handle('db:getProducts', async () => {
    return db_js_1.dbService.getProducts();
});
electron_1.ipcMain.handle('db:searchProducts', async (_, query) => {
    return db_js_1.dbService.searchProducts(query);
});
electron_1.ipcMain.handle('db:getCategories', async () => {
    return db_js_1.dbService.getCategories();
});
electron_1.ipcMain.handle('db:getSessionStatus', async () => {
    return db_js_1.dbService.getSessionStatus();
});
electron_1.ipcMain.handle('db:createSale', async (_, saleData) => {
    const { total, items, paymentMethod, sessionId, clientId } = saleData;
    // Aquí podrías usar una transacción de better-sqlite3 si quieres ser más robusto
    const ventaId = db_js_1.dbService.createSale(total, items.length, paymentMethod, sessionId, clientId);
    for (const item of items) {
        db_js_1.dbService.addSaleDetail(ventaId, item.Nombre, item.Precio, item.PrecioCosto || 0, item.Cantidad || 1, item.Subtotal);
        if (item.Id > 0) {
            db_js_1.dbService.updateStock(item.Id, item.Cantidad || 1);
        }
    }
    return { success: true, ventaId };
});
