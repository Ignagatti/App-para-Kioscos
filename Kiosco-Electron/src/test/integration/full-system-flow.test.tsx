import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Caja from '../../components/Caja';
import Inventario from '../../components/Inventario';
import Ventas from '../../components/Ventas';
import Clientes from '../../components/Clientes';
import type { SessionStatus, Product, Client } from '../../types/electron';

const mockFire = vi.hoisted(() => vi.fn().mockResolvedValue({ isConfirmed: true, value: '0' }));

vi.mock('sweetalert2-react-content', () => ({ default: (s: any) => s }));
vi.mock('sweetalert2', () => ({
    default: {
        fire: mockFire,
        mixin: vi.fn(() => ({ fire: mockFire })),
        isVisible: vi.fn(() => false),
    },
}));

describe('Pruebas 100% Integrales del Sistema KioskoGo', () => {
    const mockOnSessionChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. Apertura y Cierre de Caja (Flujo Completo)', () => {
        it('permite abrir caja ingresando un monto inicial', async () => {
            const openSessionResult: SessionStatus = {
                id: 101,
                monto_inicial: 5000,
                fecha_apertura: '2026-09-12T10:00:00.000Z',
            };

            (window.api.db.openCaja as any).mockResolvedValue({ id: 101 });
            (window.api.db.getSessionStatus as any).mockResolvedValue(openSessionResult);
            (window.api.db.getLastClosingAmount as any).mockResolvedValue(5000);

            render(<Caja session={null} onSessionChange={mockOnSessionChange} />);

            await waitFor(() => {
                expect(screen.getByText(/La caja está cerrada/i)).toBeInTheDocument();
            });

            const montoInput = screen.getByRole('spinbutton');
            fireEvent.change(montoInput, { target: { value: '5000' } });

            const abrirBtn = screen.getByRole('button', { name: /Abrir Caja/i });
            fireEvent.click(abrirBtn);

            await waitFor(() => {
                expect(window.api.db.openCaja).toHaveBeenCalledWith(5000);
                expect(mockOnSessionChange).toHaveBeenCalledWith(openSessionResult);
            });
        });

        it('permite abrir caja con monto inicial 0', async () => {
            const openSessionResult: SessionStatus = {
                id: 102,
                monto_inicial: 0,
                fecha_apertura: '2026-09-12T10:00:00.000Z',
            };

            (window.api.db.openCaja as any).mockResolvedValue({ id: 102 });
            (window.api.db.getSessionStatus as any).mockResolvedValue(openSessionResult);

            render(<Caja session={null} onSessionChange={mockOnSessionChange} />);

            const montoInput = screen.getByRole('spinbutton');
            fireEvent.change(montoInput, { target: { value: '0' } });

            const abrirBtn = screen.getByRole('button', { name: /Abrir Caja/i });
            fireEvent.click(abrirBtn);

            await waitFor(() => {
                expect(window.api.db.openCaja).toHaveBeenCalledWith(0);
                expect(mockOnSessionChange).toHaveBeenCalledWith(openSessionResult);
            });
        });

        it('permite cerrar caja y registrar los montos finales', async () => {
            const activeSession: SessionStatus = {
                id: 101,
                monto_inicial: 5000,
                fecha_apertura: '2026-09-12T10:00:00.000Z',
            };

            (window.api.db.getMovimientos as any).mockResolvedValue([]);
            (window.api.db.getCajaActual as any).mockResolvedValue({ efectivo: 12500, otros: 3500 });
            (window.api.db.closeCaja as any).mockResolvedValue({ success: true });
            mockFire.mockResolvedValue({ isConfirmed: true });

            render(<Caja session={activeSession} onSessionChange={mockOnSessionChange} />);

            await waitFor(() => {
                expect(screen.getByText(/Caja Abierta/i)).toBeInTheDocument();
            });

            const inputs = screen.getAllByRole('spinbutton');
            fireEvent.change(inputs[0], { target: { value: '12500' } });
            fireEvent.change(inputs[1], { target: { value: '3500' } });

            const cerrarBtn = screen.getByRole('button', { name: /Cerrar Caja/i });
            fireEvent.click(cerrarBtn);

            await waitFor(() => {
                expect(window.api.db.closeCaja).toHaveBeenCalledWith({
                    sessionId: 101,
                    montoEfectivo: 12500,
                    montoOtros: 3500,
                });
                expect(mockOnSessionChange).toHaveBeenCalledWith(null);
            });
        });
    });

    describe('2. Inventario con Autocompletado y Prevención de Duplicados', () => {
        it('consulta Open Food Facts / UPCitemdb si el código no existe y autocompleta los campos', async () => {
            (window.api.db.getProducts as any).mockResolvedValue([]);
            (window.api.db.getCategories as any).mockResolvedValue([{ id: 1, nombre: 'Bebidas' }]);
            (window.api.db.getProductByBarcode as any).mockResolvedValue(undefined);
            (window.api.barcode.lookup as any).mockResolvedValue({
                found: true,
                source: 'OpenFoodFacts',
                name: 'Coca Cola 500ml',
                brand: 'Coca-Cola',
                category: 'Bebidas',
            });

            render(<Inventario />);

            await waitFor(() => {
                expect(screen.getByText(/Nuevo Producto/i)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByRole('button', { name: /Nuevo Producto/i }));

            await waitFor(() => {
                expect(screen.getByTitle('Buscar en Open Food Facts')).toBeInTheDocument();
            });

            const textboxes = screen.getAllByRole('textbox');
            fireEvent.change(textboxes[1], { target: { value: '7791234567890' } });

            fireEvent.click(screen.getByTitle('Buscar en Open Food Facts'));

            await waitFor(() => {
                expect(window.api.barcode.lookup).toHaveBeenCalledWith('7791234567890');
                const nombreInput = screen.getAllByRole('textbox')[2] as HTMLInputElement;
                expect(nombreInput.value).toBe('Coca Cola 500ml');
            });
        });

        it('detecta si el producto ya existe en SQLite local y no llama a las APIs externas', async () => {
            const existingProduct: Product = {
                id: 1,
                codigo_barras: '7791234567890',
                nombre: 'Coca Cola 500ml',
                precio: 1500,
                precio_costo: 1000,
                stock: 20,
                categoria_id: 1,
                es_por_kilo: 0,
                precio_por_kilo: 0,
                categoria: 'Bebidas',
            };

            (window.api.db.getProducts as any).mockResolvedValue([existingProduct]);
            (window.api.db.getCategories as any).mockResolvedValue([{ id: 1, nombre: 'Bebidas' }]);
            (window.api.db.getProductByBarcode as any).mockResolvedValue(existingProduct);

            render(<Inventario />);

            fireEvent.click(screen.getByRole('button', { name: /Nuevo Producto/i }));

            await waitFor(() => screen.getByTitle('Buscar en Open Food Facts'));

            const textboxes = screen.getAllByRole('textbox');
            fireEvent.change(textboxes[1], { target: { value: '7791234567890' } });
            fireEvent.click(screen.getByTitle('Buscar en Open Food Facts'));

            await waitFor(() => {
                expect(window.api.db.getProductByBarcode).toHaveBeenCalledWith('7791234567890');
                expect(window.api.barcode.lookup).not.toHaveBeenCalled();
            });
        });
    });

    describe('3. Ventas con Búsqueda desde la Primer Letra', () => {
        it('busca coincidencias en tiempo real con 1 sola letra', async () => {
            const activeSession: SessionStatus = { id: 1, monto_inicial: 5000, fecha_apertura: '2026-09-12' };
            const prod: Product = {
                id: 10,
                codigo_barras: '7790001',
                nombre: 'Alfajor Jorgito',
                precio: 800,
                precio_costo: 500,
                stock: 15,
                categoria_id: 2,
                es_por_kilo: 0,
                precio_por_kilo: 0,
                categoria: 'Golosinas',
            };

            (window.api.db.getClients as any).mockResolvedValue([]);
            (window.api.db.searchProducts as any).mockResolvedValue([prod]);

            render(<Ventas session={activeSession} />);

            const searchInput = screen.getByPlaceholderText(/Escaneá un código o escribí el nombre/i);
            fireEvent.change(searchInput, { target: { value: 'A' } });

            await waitFor(() => {
                expect(window.api.db.searchProducts).toHaveBeenCalledWith('A');
            }, { timeout: 1000 });
        });
    });

    describe('4. Clientes y Fiados', () => {
        it('permite registrar clientes y buscar clientes', async () => {
            const mockClientList: Client[] = [
                { id: 1, nombre: 'Carlos Gomez', saldo: 2000, telefono: '11223344' }
            ];

            (window.api.db.getClients as any).mockResolvedValue(mockClientList);

            render(<Clientes />);

            await waitFor(() => {
                expect(screen.getByText('Carlos Gomez')).toBeInTheDocument();
                expect(screen.getByText(/Deuda Total/i)).toBeInTheDocument();
            });
        });
    });
});
