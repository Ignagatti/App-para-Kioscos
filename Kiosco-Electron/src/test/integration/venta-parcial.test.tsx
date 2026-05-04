/**
 * Integration tests for the partial-payment (fiado parcial) flow.
 *
 * Scope:
 *  1. Pure logic tests — calcularPagoParcial covers all numeric edge cases.
 *  2. API-call chain — render Ventas, simulate adding one product and selecting
 *     a client, trigger EFECTIVO, and verify that createSale + addClientDebt +
 *     addMovimiento are all called with the right arguments.
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Ventas from '../../components/Ventas';
import { calcularPagoParcial } from '../../utils/venta.utils';
import type { SessionStatus, Client, Product } from '../../types/electron';

// ─── fixtures ────────────────────────────────────────────────────────────────

const session: SessionStatus = { id: 1, monto_inicial: 5000, fecha_apertura: '2024-01-01' };

const client: Client = { id: 7, nombre: 'Ana García', telefono: '', saldo: 200 };

const product: Product = {
    id: 1,
    codigo_barras: '7790001',
    nombre: 'Alfajor',
    precio: 1000,
    precio_costo: 600,
    stock: 50,
    categoria_id: 1,
    es_por_kilo: 0,
    precio_por_kilo: 0,
    categoria: 'Golosinas',
};

// ─── SweetAlert2 mock ─────────────────────────────────────────────────────────
// vi.hoisted() garantiza que mockFire se inicialice antes del hoisting de vi.mock.

const mockFire = vi.hoisted(() => vi.fn());

vi.mock('sweetalert2-react-content', () => ({ default: (s: any) => s }));
vi.mock('sweetalert2', () => ({
    default: {
        fire: mockFire,
        mixin: vi.fn(() => ({ fire: vi.fn() })),
        isVisible: vi.fn(() => false),
    },
}));

// ─── pure logic tests ─────────────────────────────────────────────────────────

describe('calcularPagoParcial — pure logic', () => {
    it('abono = 0 → todo a fiado', () => {
        expect(calcularPagoParcial(1000, 0).tipo).toBe('FIADO_TOTAL');
    });
    it('abono = total → pago completo sin deuda', () => {
        expect(calcularPagoParcial(1000, 1000).tipo).toBe('PAGO_COMPLETO');
    });
    it('abono < total → deuda correcta', () => {
        const r = calcularPagoParcial(1500, 600);
        expect(r.tipo).toBe('PARCIAL');
        if (r.tipo === 'PARCIAL') expect(r.deuda).toBe(900);
    });
    it('floating-point: 10.30 - 10.10 = 0.20 exacto', () => {
        const r = calcularPagoParcial(10.30, 10.10);
        if (r.tipo === 'PARCIAL') expect(r.deuda).toBe(0.20);
    });
});

// ─── API-call integration test ────────────────────────────────────────────────

describe('Ventas — partial-payment API flow', () => {
    beforeEach(() => {
        (window.api.db.getClients as any).mockResolvedValue([client]);
        (window.api.db.searchProducts as any).mockResolvedValue([product]);
        (window.api.db.createSale as any).mockResolvedValue({ ventaId: 42 });
        // mockFire is cleared by the global beforeEach in setup.ts
        // Default: success response with abono of 600 for a $1000 total → $400 debt
        mockFire.mockResolvedValue({ value: '600', isConfirmed: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls createSale + addClientDebt + addMovimiento on partial EFECTIVO payment', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });

        render(<Ventas session={session} />);

        // Wait for clients to load
        await waitFor(() => expect(window.api.db.getClients).toHaveBeenCalled());

        // Select client from dropdown
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: String(client.id) } });

        // Type in the product search box to trigger debounced search
        const searchInput = screen.getByPlaceholderText(/Escaneá un código/i);
        fireEvent.change(searchInput, { target: { value: 'Alf' } });

        // Advance past the 300 ms debounce
        await act(async () => {
            vi.advanceTimersByTime(350);
        });

        // Wait for search results and click the product
        await waitFor(() => screen.getByText('Alfajor'));
        fireEvent.click(screen.getByText('Alfajor'));

        // After clicking the result the dropdown clears; Alfajor appears only in the cart.
        await waitFor(() => expect(screen.queryAllByText('Alfajor')).toHaveLength(1));

        // Click the Efectivo button (first one in the sidebar)
        const efectivoBtns = screen.getAllByText('Efectivo');
        fireEvent.click(efectivoBtns[0]);

        // Ventas calls MySwal.fire asking for abono amount; mock returns '600'
        // → total $1000, abono $600, deuda $400
        await waitFor(() => {
            expect(window.api.db.createSale).toHaveBeenCalledWith(
                expect.objectContaining({ total: 1000, paymentMethod: 'EFECTIVO', clientId: null }),
            );
            expect(window.api.db.addClientDebt).toHaveBeenCalledWith({
                clientId: client.id,
                amount: 400,
            });
            expect(window.api.db.addMovimiento).toHaveBeenCalledWith(
                expect.objectContaining({
                    tipo: 'SALIDA',
                    categoria: 'Fiado Parcial',
                    monto: 400,
                    sesionId: session.id,
                }),
            );
        });
    });

    it('calls createSale with FIADO and selectedClient when abono is 0', async () => {
        // Abono = 0 → everything goes to fiado
        mockFire.mockResolvedValue({ value: '0', isConfirmed: true });
        vi.useFakeTimers({ shouldAdvanceTime: true });

        render(<Ventas session={session} />);
        await waitFor(() => expect(window.api.db.getClients).toHaveBeenCalled());

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: String(client.id) } });

        const searchInput = screen.getByPlaceholderText(/Escaneá un código/i);
        fireEvent.change(searchInput, { target: { value: 'Alf' } });
        await act(async () => { vi.advanceTimersByTime(350); });
        await waitFor(() => screen.getByText('Alfajor'));
        fireEvent.click(screen.getByText('Alfajor'));

        const efectivoBtns = screen.getAllByText('Efectivo');
        fireEvent.click(efectivoBtns[0]);

        await waitFor(() => {
            expect(window.api.db.createSale).toHaveBeenCalledWith(
                expect.objectContaining({ paymentMethod: 'FIADO', clientId: client.id }),
            );
        });
        expect(window.api.db.addClientDebt).not.toHaveBeenCalled();
        expect(window.api.db.addMovimiento).not.toHaveBeenCalled();
    });

    it('calls createSale with original method and no debt when abono covers full total', async () => {
        // Abono = 1000 → deuda 0 → no client debt recorded
        mockFire.mockResolvedValue({ value: '1000', isConfirmed: true });
        vi.useFakeTimers({ shouldAdvanceTime: true });

        render(<Ventas session={session} />);
        await waitFor(() => expect(window.api.db.getClients).toHaveBeenCalled());

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: String(client.id) } });

        const searchInput = screen.getByPlaceholderText(/Escaneá un código/i);
        fireEvent.change(searchInput, { target: { value: 'Alf' } });
        await act(async () => { vi.advanceTimersByTime(350); });
        await waitFor(() => screen.getByText('Alfajor'));
        fireEvent.click(screen.getByText('Alfajor'));

        const efectivoBtns = screen.getAllByText('Efectivo');
        fireEvent.click(efectivoBtns[0]);

        await waitFor(() => {
            expect(window.api.db.createSale).toHaveBeenCalledWith(
                expect.objectContaining({ paymentMethod: 'EFECTIVO', clientId: null }),
            );
        });
        expect(window.api.db.addClientDebt).not.toHaveBeenCalled();
        expect(window.api.db.addMovimiento).not.toHaveBeenCalled();
    });
});
