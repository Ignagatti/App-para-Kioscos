"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    db: {
        getProducts: () => electron_1.ipcRenderer.invoke('db:getProducts'),
        searchProducts: (query) => electron_1.ipcRenderer.invoke('db:searchProducts', query),
        getCategories: () => electron_1.ipcRenderer.invoke('db:getCategories'),
        getSessionStatus: () => electron_1.ipcRenderer.invoke('db:getSessionStatus'),
        createSale: (saleData) => electron_1.ipcRenderer.invoke('db:createSale', saleData),
    },
    utils: {
        getAppVersion: () => process.env.npm_package_version,
    }
});
