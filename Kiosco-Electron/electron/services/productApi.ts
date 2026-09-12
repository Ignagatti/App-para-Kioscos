import https from 'https';

export interface ProductApiResult {
    found: boolean;
    source?: 'OpenFoodFacts' | 'UPCitemdb' | 'Manual';
    barcode?: string;
    name?: string;
    brand?: string;
    category?: string;
    imageUrl?: string;
    description?: string;
}

// Interfaz para proveedores de datos de productos
export interface IProductApiService {
    readonly name: 'OpenFoodFacts' | 'UPCitemdb';
    searchByBarcode(barcode: string): Promise<ProductApiResult | null>;
}

// Función auxiliar para peticiones HTTPS con User-Agent y timeout
function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options: https.RequestOptions = {
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

        const req = https.request(options, (res) => {
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
                } catch (e) {
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
export class OpenFoodFactsService implements IProductApiService {
    readonly name = 'OpenFoodFacts' as const;

    async searchByBarcode(barcode: string): Promise<ProductApiResult | null> {
        try {
            const url = `https://world.openfoodfacts.org/api/v3/product/${barcode}.json`;
            const json = await fetchJson(url);

            if ((json.status === 'success' || json.status === 1) && json.product) {
                const p = json.product;
                const name = (
                    p.product_name_es || 
                    p.product_name || 
                    p.product_name_en || 
                    p.generic_name_es || 
                    p.generic_name || 
                    ''
                ).trim();

                if (!name) return null;

                const brand = (p.brands || p.brand_owner || '').split(',')[0].trim();
                
                // Categoría limpia
                let category = '';
                if (p.categories_hierarchy && p.categories_hierarchy.length > 0) {
                    const lastCat = p.categories_hierarchy[p.categories_hierarchy.length - 1];
                    category = lastCat.replace(/^(\w+:)/, '').replace(/-/g, ' ');
                } else if (p.categories) {
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
        } catch (error) {
            console.warn(`[OpenFoodFacts] Error buscando ${barcode}:`, (error as Error).message);
            return null;
        }
    }
}

/**
 * 2. Proveedor UPCitemdb (Fallback)
 * Endpoint: https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}
 * Plan gratuito: 100 consultas por día sin registro
 */
export class UPCItemDbService implements IProductApiService {
    readonly name = 'UPCitemdb' as const;

    async searchByBarcode(barcode: string): Promise<ProductApiResult | null> {
        try {
            const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
            const json = await fetchJson(url);

            if (json.code === 'OK' && json.items && json.items.length > 0) {
                const item = json.items[0];
                const name = (item.title || '').trim();
                if (!name) return null;

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
        } catch (error) {
            console.warn(`[UPCitemdb] Error buscando ${barcode}:`, (error as Error).message);
            return null;
        }
    }
}

/**
 * Orquestador de búsqueda en cascada
 * 1. Open Food Facts (Alimentos y bebidas)
 * 2. UPCitemdb (Fallback general)
 */
export class ProductApiAggregator {
    private services: IProductApiService[];

    constructor() {
        this.services = [
            new OpenFoodFactsService(),
            new UPCItemDbService(),
        ];
    }

    async lookup(barcode: string): Promise<ProductApiResult> {
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
            } catch (err) {
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

export const productApiAggregator = new ProductApiAggregator();
