import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { dbService, initDb, db } from './db';
import https from 'https';
import http from 'http';

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        title: "Kiosco Pro",
        icon: path.join(__dirname, '../public/favicon.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.setMenuBarVisibility(false);

    const isDev = !app.isPackaged;
    if (isDev) {
        win.loadURL('http://localhost:5173');
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// ── API Externa: Open Food Facts ──
function fetchProductFromAPI(barcode: string): Promise<{ found: boolean; name?: string }> {
    return new Promise((resolve) => {
        const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status === 1 && json.product) {
                        const name = json.product.product_name || json.product.product_name_es || json.product.product_name_en || '';
                        resolve({ found: true, name });
                    } else {
                        resolve({ found: false });
                    }
                } catch {
                    resolve({ found: false });
                }
            });
        }).on('error', () => {
            resolve({ found: false });
        });
    });
}

app.whenReady().then(() => {
    console.log("Iniciando Aplicación...");
    
    initDb();
    
    // Loguear tablas existentes para depuración
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log("Tablas encontradas:", tables.map((t: any) => t.name).join(', '));
    } catch (e) {
        console.error("Error al listar tablas:", e);
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ══════════════════════════════════════
//  IPC HANDLERS
// ══════════════════════════════════════

// ── Productos ──
ipcMain.handle('db:getProducts', () => dbService.getProducts());
ipcMain.handle('db:getProductByBarcode', (_, barcode) => dbService.getProductByBarcode(barcode));
ipcMain.handle('db:searchProducts', (_, query) => dbService.searchProducts(query));
ipcMain.handle('db:saveProduct', (_, data) => dbService.saveProduct(data));
ipcMain.handle('db:deleteProduct', (_, id) => dbService.deleteProduct(id));

// ── API Externa ──
ipcMain.handle('api:lookupBarcode', async (_, barcode) => {
    return await fetchProductFromAPI(barcode);
});

// ── Categorías ──
ipcMain.handle('db:getCategories', () => dbService.getCategories());
ipcMain.handle('db:addCategory', (_, nombre) => dbService.addCategory(nombre));

// ── Caja ──
ipcMain.handle('db:getSessionStatus', () => dbService.getSessionStatus());
ipcMain.handle('db:openCaja', (_, monto) => dbService.openCaja(monto));
ipcMain.handle('db:closeCaja', (_, data) => dbService.closeCaja(data.sessionId, data.montoEfectivo, data.montoOtros));
ipcMain.handle('db:getCajaActual', (_, sessionId) => dbService.getCajaActual(sessionId));
ipcMain.handle('db:getTotalesSugeridos', (_, sessionId) => dbService.getTotalesSugeridos(sessionId));
ipcMain.handle('db:getSalesForSession', (_, sessionId) => dbService.getSalesForSession(sessionId));
ipcMain.handle('db:getSaleDetails', (_, ventaId) => dbService.getSaleDetails(ventaId));

// ── Ventas ──
ipcMain.handle('db:createSale', (_, data) => {
    return dbService.createSale(data.total, data.items.length, data.paymentMethod, data.sessionId, data.clientId, data.items);
});

// ── Reportes ──
ipcMain.handle('db:getReportDetail', () => dbService.getReportDetail());
ipcMain.handle('db:getReportMonthly', () => dbService.getReportMonthly());
ipcMain.handle('db:clearHistory', () => dbService.clearHistory());

// ── Clientes ──
ipcMain.handle('db:getClients', () => dbService.getClients());
ipcMain.handle('db:addClient', (_, data) => dbService.addClient(data.nombre, data.telefono));
ipcMain.handle('db:payClientDebt', (_, data) => dbService.payClientDebt(data.clientId, data.amount));
ipcMain.handle('db:getClientSales', (_, clientId) => dbService.getClientSales(clientId));

// ── Movimientos ──
ipcMain.handle('db:addMovimiento', (_, data) => dbService.addMovimiento(data.tipo, data.categoria, data.monto, data.descripcion, data.sesionId, data.metodoPago));
ipcMain.handle('db:getMovimientos', (_, sessionId) => dbService.getMovimientos(sessionId));
