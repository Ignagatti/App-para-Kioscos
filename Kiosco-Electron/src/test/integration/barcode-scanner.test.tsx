/**
 * Integration tests for the barcode scanner flow in Ventas:
 *   - Enter key scan → adds product to cart
 *   - Debounce search (onChange) → shows dropdown
 *   - Clicking result → adds to cart
 *   - Cart operations: quantity +/-, remove item
 *   - Double Enter → opens payment modal
 *   - Session-gating (buttons disabled / warning shown)
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import Ventas from '../../components/Ventas';
import type { SessionStatus, Product } from '../../types/electron';

const mockFire = vi.hoisted(() => vi.fn());

vi.mock('sweetalert2-react-content', () => ({ default: (s: any) => s }));
vi.mock('sweetalert2', () => ({
    default: {
        fire: mockFire,
        mixin: vi.fn(() => ({ fire: vi.fn() })),
        isVisible: vi.fn(() => false),
    },
}));

const session: SessionStatus = { id: 1, monto_inicial: 5000, fecha_apertura: '2024-01-01' };

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 1,
    codigo_barras: '7790001',
    nombre: 'Alfajor Rocklet',
    precio: 1000,
    precio_costo: 600,
    stock: 50,
    categoria_id: 1,
    es_por_kilo: 0,
    precio_por_kilo: 0,
    categoria: 'Golosinas',
    ...overrides,
});

afterEach(() => {
    vi.useRealTimers();
    mockFire.mockReset();
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const getSearchInput = () =>
    screen.getByPlaceholderText(/Escaneá un código/i) as HTMLInputElement;

/** Scan a barcode via Enter key and wait for the product to appear in the cart. */
const scanBarcode = async (barcode: string) => {
    const input = getSearchInput();
    fireEvent.change(input, { target: { value: barcode } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
        expect(window.api.db.searchProducts).toHaveBeenCalledWith(barcode)
    );
};

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

describe('Ventas – empty cart', () => {
    it('shows empty cart message on first render', async () => {
        render(<Ventas session={session} />);
        await waitFor(() =>
            expect(screen.getByText(/El carrito está vacío/i)).toBeInTheDocument()
        );
    });

    it('shows "Debés abrir caja" warning when session is null', () => {
        render(<Ventas session={null} />);
        expect(screen.getByText(/Debés abrir caja/i)).toBeInTheDocument();
    });

    it('disables payment buttons when session is null', () => {
        render(<Ventas session={null} />);
        const efectivoBtn = screen.getAllByText('Efectivo')[0].closest('button')!;
        expect(efectivoBtn).toBeDisabled();
    });
});

// ─── BARCODE SCANNER – Enter key ─────────────────────────────────────────────

describe('Ventas – barcode scan via Enter key', () => {
    it('calls searchProducts when Enter is pressed with text', async () => {
        render(<Ventas session={session} />);
        await scanBarcode('7790001');
        expect(window.api.db.searchProducts).toHaveBeenCalledWith('7790001');
    });

    it('adds product to cart when exactly 1 result returns', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');

        await waitFor(() =>
            expect(screen.getByText('Alfajor Rocklet')).toBeInTheDocument()
        );
    });

    it('clears search input after adding product', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => expect(getSearchInput().value).toBe(''));
    });

    it('shows dropdown when multiple results are returned', async () => {
        const products = [
            makeProduct({ id: 1, nombre: 'Producto A' }),
            makeProduct({ id: 2, nombre: 'Producto B', codigo_barras: '7790002' }),
        ];
        (window.api.db.searchProducts as any).mockResolvedValue(products);
        render(<Ventas session={session} />);

        await scanBarcode('Pro');

        await waitFor(() => {
            expect(screen.getByText('Producto A')).toBeInTheDocument();
            expect(screen.getByText('Producto B')).toBeInTheDocument();
        });
    });

    it('does NOT add product to cart when 0 results', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([]);
        render(<Ventas session={session} />);

        await scanBarcode('INEXISTENTE');

        // Empty cart state should remain
        await waitFor(() =>
            expect(screen.getByText(/El carrito está vacío/i)).toBeInTheDocument()
        );
    });
});

// ─── DEBOUNCE SEARCH (onChange) ───────────────────────────────────────────────

describe('Ventas – debounce search on input change', () => {
    it('does NOT call searchProducts immediately when typing', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        (window.api.db.searchProducts as any).mockResolvedValue([]);

        render(<Ventas session={session} />);
        fireEvent.change(getSearchInput(), { target: { value: 'Alf' } });

        // searchProducts should NOT be called yet
        expect(window.api.db.searchProducts).not.toHaveBeenCalled();
    });

    it('calls searchProducts via debounce after 300 ms with 3+ chars', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        (window.api.db.searchProducts as any).mockResolvedValue([]);

        render(<Ventas session={session} />);
        await waitFor(() => expect(window.api.db.getClients).toHaveBeenCalled());

        fireEvent.change(getSearchInput(), { target: { value: 'Alf' } });
        await act(async () => { vi.advanceTimersByTime(350); });

        expect(window.api.db.searchProducts).toHaveBeenCalledWith('Alf');
    });

    it('calls searchProducts for 1-char input starting from the first letter', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        (window.api.db.searchProducts as any).mockResolvedValue([]);

        render(<Ventas session={session} />);
        await waitFor(() => expect(window.api.db.getClients).toHaveBeenCalled());

        fireEvent.change(getSearchInput(), { target: { value: 'A' } });
        await act(async () => { vi.advanceTimersByTime(350); });

        expect(window.api.db.searchProducts).toHaveBeenCalledWith('A');
    });

    it('clicking a dropdown result adds product to cart', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);

        render(<Ventas session={session} />);
        await waitFor(() => expect(window.api.db.getClients).toHaveBeenCalled());

        fireEvent.change(getSearchInput(), { target: { value: 'Alf' } });
        await act(async () => { vi.advanceTimersByTime(350); });

        await waitFor(() => screen.getByText('Alfajor Rocklet'));
        fireEvent.click(screen.getByText('Alfajor Rocklet'));

        await waitFor(() =>
            expect(screen.getAllByText('Alfajor Rocklet')).toHaveLength(1)
        );
    });

    it('pressing Escape clears dropdown results', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);

        render(<Ventas session={session} />);
        await waitFor(() => expect(window.api.db.getClients).toHaveBeenCalled());

        fireEvent.change(getSearchInput(), { target: { value: 'Alf' } });
        await act(async () => { vi.advanceTimersByTime(350); });
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        fireEvent.keyDown(getSearchInput(), { key: 'Escape' });

        expect(screen.queryByText('Alfajor Rocklet')).not.toBeInTheDocument();
    });
});

// ─── CART OPERATIONS ─────────────────────────────────────────────────────────

describe('Ventas – cart operations', () => {
    it('adds product to cart and shows it in the table', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        expect(screen.getByText('7790001')).toBeInTheDocument();
        // subtotal — just check the barcode was added; price format is locale-dependent
        expect(screen.getByText('7790001')).toBeInTheDocument();
    });

    it('increases quantity when same product is scanned twice', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        await scanBarcode('7790001');

        await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    });

    it('clicking + button increments quantity', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        fireEvent.click(screen.getByRole('button', { name: '+' }));

        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('clicking - button decrements quantity (stays ≥ 1)', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        // Go to qty 2 first
        fireEvent.click(screen.getByRole('button', { name: '+' }));
        expect(screen.getByText('2')).toBeInTheDocument();

        // Back to 1
        fireEvent.click(screen.getByRole('button', { name: '-' }));
        expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('clicking - at qty 1 keeps quantity at 1', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        fireEvent.click(screen.getByRole('button', { name: '-' }));

        expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('trash button removes the item from cart', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        // With 1 item in cart the buttons in DOM order are: -, +, trash, Efectivo, Otros, Anotar en Fiado
        const buttons = screen.getAllByRole('button');
        const trashBtn = buttons.find(
            btn => !btn.textContent?.trim() && btn.querySelector('svg')
        )!;
        fireEvent.click(trashBtn);

        await waitFor(() =>
            expect(screen.getByText(/El carrito está vacío/i)).toBeInTheDocument()
        );
    });

    it('total reflects sum of all items', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        render(<Ventas session={session} />);

        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));

        // Add again → qty 2 → total $2.000
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        await scanBarcode('7790001');

        await waitFor(() => {
            // Both the cart subtotal and TOTAL A PAGAR show $2000 ($2,000 or $2.000)
            expect(screen.getAllByText(/\$2[,.]?000/).length).toBeGreaterThan(0);
        });
    });
});

// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────

describe('Ventas – payment modal (double Enter)', () => {
    it('double Enter on empty input with cart items opens payment modal', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        mockFire.mockResolvedValue({});

        render(<Ventas session={session} />);
        const input = getSearchInput();

        // Add item to cart
        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));
        await waitFor(() => expect(input.value).toBe(''));

        // Double Enter on empty input → open payment modal
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(screen.getByText(/Confirmar Cobro/i)).toBeInTheDocument()
        );
    });

    it('payment modal shows the cart total', async () => {
        (window.api.db.searchProducts as any).mockResolvedValue([makeProduct()]);
        mockFire.mockResolvedValue({});

        render(<Ventas session={session} />);
        await scanBarcode('7790001');
        await waitFor(() => screen.getByText('Alfajor Rocklet'));
        await waitFor(() => expect(getSearchInput().value).toBe(''));

        fireEvent.keyDown(getSearchInput(), { key: 'Enter' });
        fireEvent.keyDown(getSearchInput(), { key: 'Enter' });

        await waitFor(() => screen.getByText(/Confirmar Cobro/i));
        // The modal shows total in big text ($1000, $1,000 or $1.000)
        expect(screen.getAllByText(/\$1[,.]?000/).length).toBeGreaterThan(0);
    });
});
