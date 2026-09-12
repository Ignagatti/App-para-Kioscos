"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productApiAggregator = exports.ProductApiAggregator = exports.UPCItemDbService = exports.OpenFoodFactsService = void 0;
const https_1 = __importDefault(require("https"));
// Función auxiliar para peticiones HTTPS con User-Agent y timeout
function fetchJson(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'KioscoApp - Electron Desktop App - Version 1.0 (contact@kioscoapp.local)',
                'Accept': 'application/json',
                ...headers,
            },
            timeout: 6000,
        };
        const req = https_1.default.request(options, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchJson(res.headers.location, headers));
            }
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                return reject(new Error(`HTTP error ${res.statusCode}`));
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                }
                catch (e) {
                    reject(new Error('Invalid JSON received'));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.on('error', (err) => {
            reject(err);
        });
        req.end();
    });
}
/**
 * 1. Proveedor Open Food Facts v3
 * Endpoint: https://world.openfoodfacts.org/api/v3/product/{barcode}.json
 */
class OpenFoodFactsService {
    name = 'OpenFoodFacts';
    async searchByBarcode(barcode) {
        try {
            const url = `https://world.openfoodfacts.org/api/v3/product/${barcode}.json`;
            const json = await fetchJson(url);
            if ((json.status === 'success' || json.status === 1) && json.product) {
                const p = json.product;
                const name = (p.product_name_es ||
                    p.product_name ||
                    p.product_name_en ||
                    p.generic_name_es ||
                    p.generic_name ||
                    '').trim();
                if (!name)
                    return null;
                const brand = (p.brands || p.brand_owner || '').split(',')[0].trim();
                // Categoría limpia
                let category = '';
                if (p.categories_hierarchy && p.categories_hierarchy.length > 0) {
                    const lastCat = p.categories_hierarchy[p.categories_hierarchy.length - 1];
                    category = lastCat.replace(/^(\w+:)/, '').replace(/-/g, ' ');
                }
                else if (p.categories) {
                    category = p.categories.split(',')[0].trim();
                }
                const imageUrl = p.image_url || p.image_front_url || p.image_front_small_url || '';
                const description = p.generic_name_es || p.generic_name || '';
                return {
                    found: true,
                    source: this.name,
                    barcode,
                    name,
                    brand,
                    category,
                    imageUrl,
                    description,
                };
            }
            return null;
        }
        catch (error) {
            console.warn(`[OpenFoodFacts] Error buscando ${barcode}:`, error.message);
            return null;
        }
    }
}
exports.OpenFoodFactsService = OpenFoodFactsService;
/**
 * 2. Proveedor UPCitemdb (Fallback)
 * Endpoint: https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}
 * Plan gratuito: 100 consultas por día sin registro
 */
class UPCItemDbService {
    name = 'UPCitemdb';
    async searchByBarcode(barcode) {
        try {
            const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
            const json = await fetchJson(url);
            if (json.code === 'OK' && json.items && json.items.length > 0) {
                const item = json.items[0];
                const name = (item.title || '').trim();
                if (!name)
                    return null;
                const brand = (item.brand || '').trim();
                const category = (item.category || '').split('>').pop()?.trim() || '';
                const imageUrl = (item.images && item.images.length > 0) ? item.images[0] : '';
                const description = item.description || '';
                return {
                    found: true,
                    source: this.name,
                    barcode,
                    name,
                    brand,
                    category,
                    imageUrl,
                    description,
                };
            }
            return null;
        }
        catch (error) {
            console.warn(`[UPCitemdb] Error buscando ${barcode}:`, error.message);
            return null;
        }
    }
}
exports.UPCItemDbService = UPCItemDbService;
/**
 * Orquestador de búsqueda en cascada
 * 1. Open Food Facts (Alimentos y bebidas)
 * 2. UPCitemdb (Fallback general)
 */
class ProductApiAggregator {
    services;
    constructor() {
        this.services = [
            new OpenFoodFactsService(),
            new UPCItemDbService(),
        ];
    }
    async lookup(barcode) {
        const cleanBarcode = barcode.trim();
        if (!cleanBarcode) {
            return { found: false };
        }
        for (const service of this.services) {
            try {
                const result = await service.searchByBarcode(cleanBarcode);
                if (result && result.found) {
                    return result;
                }
            }
            catch (err) {
                console.error(`Error en servicio ${service.name}:`, err);
            }
        }
        return {
            found: false,
            barcode: cleanBarcode,
            source: 'Manual',
        };
    }
}
exports.ProductApiAggregator = ProductApiAggregator;
exports.productApiAggregator = new ProductApiAggregator();
