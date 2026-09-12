import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import Inventario from '../../components/Inventario';
import type { Product } from '../../types/electron';

const mockFire = vi.hoisted(() => vi.fn().mockResolvedValue({ isConfirmed: false }));

vi.mock('sweetalert2-react-content', () => ({ default: (s: any) => s }));
vi.mock('sweetalert2', () => ({
    default: {
        fire: mockFire,
        mixin: vi.fn(() => ({ fire: vi.fn() })),
        isVisible: vi.fn(() => false),
    },
}));

const prodA: Product = {
    id: 1, codigo_barras: '7790001', nombre: 'Coca Cola 500ml',
    precio: 1500, precio_costo: 1000, stock: 20,
    categoria_id: 1, es_por_kilo: 0, precio_por_kilo: 0, categoria: 'Bebidas',
};
const prodB: Product = {
    id: 2, codigo_barras: '7790002', nombre: 'Alfajor Oreo',
    precio: 800, precio_costo: 500, stock: 3,
    categoria_id: 2, es_por_kilo: 0, precio_por_kilo: 0, categoria: 'Golosinas',
};

const waitForLoad = () =>
    waitFor(() => expect(screen.queryByText(/Cargando inventario/i)).not.toBeInTheDocument());

// Helper: find the modal form (opened after clicking "Nuevo Producto")
const openNewModal = async () => {
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Producto/i }));
    await waitFor(() => screen.getByTitle('Buscar en Open Food Facts'));
};

describe('Inventario – loading & listing', () => {
    it('shows loading state on mount', () => {
        render(<Inventario />);
        expect(screen.getByText(/Cargando inventario/i)).toBeInTheDocument();
    });

    it('shows empty state after loading with no products', async () => {
        render(<Inventario />);
        await waitFor(() =>
            expect(screen.getByText(/No se encontraron productos/i)).toBeInTheDocument()
        );
    });

    it('renders product rows from API', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA, prodB]);
        render(<Inventario />);
        await waitFor(() => {
            expect(screen.getByText('Coca Cola 500ml')).toBeInTheDocument();
            expect(screen.getByText('Alfajor Oreo')).toBeInTheDocument();
        });
    });

    it('shows product barcode in the table', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA]);
        render(<Inventario />);
        await waitFor(() => expect(screen.getByText('7790001')).toBeInTheDocument());
    });

    it('shows "Total Productos" stat card', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA, prodB]);
        render(<Inventario />);
        await waitForLoad();
        expect(screen.getByText('Total Productos')).toBeInTheDocument();
    });

    it('shows "Valor Inventario (Precio Venta)" stat card', async () => {
        render(<Inventario />);
        await waitForLoad();
        expect(screen.getByText('Valor Inventario (Precio Venta)')).toBeInTheDocument();
    });
});

describe('Inventario – search filter', () => {
    it('filters products by name', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA, prodB]);
        render(<Inventario />);
        await waitFor(() => screen.getByText('Coca Cola 500ml'));

        fireEvent.change(
            screen.getByPlaceholderText(/Buscar por nombre o código/i),
            { target: { value: 'Alfajor' } }
        );

        expect(screen.queryByText('Coca Cola 500ml')).not.toBeInTheDocument();
        expect(screen.getByText('Alfajor Oreo')).toBeInTheDocument();
    });

    it('filters products by barcode', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA, prodB]);
        render(<Inventario />);
        await waitFor(() => screen.getByText('Coca Cola 500ml'));

        fireEvent.change(
            screen.getByPlaceholderText(/Buscar por nombre o código/i),
            { target: { value: '7790001' } }
        );

        expect(screen.getByText('Coca Cola 500ml')).toBeInTheDocument();
        expect(screen.queryByText('Alfajor Oreo')).not.toBeInTheDocument();
    });
});

describe('Inventario – product modal', () => {
    it('opens the new-product modal on "Nuevo Producto" click', async () => {
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();
        expect(screen.getByText('Nuevo Producto', { selector: 'h3' })).toBeInTheDocument();
    });

    it('closes modal on Cancelar click', async () => {
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();
        fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
        await waitFor(() =>
            expect(screen.queryByText('Nuevo Producto', { selector: 'h3' })).not.toBeInTheDocument()
        );
    });

    it('shows "Editar Producto" heading when editing an existing product', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA]);
        render(<Inventario />);
        await waitFor(() => screen.getByText('Coca Cola 500ml'));

        // Edit button is the 2nd button (index 1) — after "Nuevo Producto" (index 0)
        const buttons = screen.getAllByRole('button');
        fireEvent.click(buttons[1]);

        await waitFor(() =>
            expect(screen.getByText('Editar Producto', { selector: 'h3' })).toBeInTheDocument()
        );
    });

    it('pre-fills form with product data when editing', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA]);
        render(<Inventario />);
        await waitFor(() => screen.getByText('Coca Cola 500ml'));

        fireEvent.click(screen.getAllByRole('button')[1]);
        await waitFor(() => screen.getByText('Editar Producto', { selector: 'h3' }));

        // The textboxes after opening: [searchBar, codigoBarras, nombre]
        const textboxes = screen.getAllByRole('textbox');
        expect((textboxes[1] as HTMLInputElement).value).toBe('7790001');
        expect((textboxes[2] as HTMLInputElement).value).toBe('Coca Cola 500ml');
    });
});

describe('Inventario – barcode lookup (Open Food Facts)', () => {
    it('lookup button is disabled when barcode field is empty', async () => {
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();
        expect(screen.getByTitle('Buscar en Open Food Facts')).toBeDisabled();
    });

    it('enables lookup button once a barcode is typed', async () => {
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();

        const textboxes = screen.getAllByRole('textbox');
        fireEvent.change(textboxes[1], { target: { value: '7790001' } });

        expect(screen.getByTitle('Buscar en Open Food Facts')).not.toBeDisabled();
    });

    it('calls barcode.lookup with the typed barcode', async () => {
        (window.api.barcode.lookup as any).mockResolvedValue({ found: false });
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();

        const textboxes = screen.getAllByRole('textbox');
        fireEvent.change(textboxes[1], { target: { value: '7790001' } });
        fireEvent.click(screen.getByTitle('Buscar en Open Food Facts'));

        await waitFor(() =>
            expect(window.api.barcode.lookup).toHaveBeenCalledWith('7790001')
        );
    });

    it('auto-fills the product name when lookup succeeds', async () => {
        (window.api.barcode.lookup as any).mockResolvedValue({ found: true, name: 'Coca Cola Clásica' });
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();

        const textboxes = screen.getAllByRole('textbox');
        fireEvent.change(textboxes[1], { target: { value: '7790001' } });
        fireEvent.click(screen.getByTitle('Buscar en Open Food Facts'));

        await waitFor(() => {
            const nombreInput = screen.getAllByRole('textbox')[2] as HTMLInputElement;
            expect(nombreInput.value).toBe('Coca Cola Clásica');
        });
    });

    it('shows "No encontrado" warning when lookup returns found: false', async () => {
        (window.api.barcode.lookup as any).mockResolvedValue({ found: false });
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();

        const textboxes = screen.getAllByRole('textbox');
        fireEvent.change(textboxes[1], { target: { value: '0000000000000' } });
        fireEvent.click(screen.getByTitle('Buscar en Open Food Facts'));

        await waitFor(() =>
            expect(mockFire).toHaveBeenCalledWith(
                expect.objectContaining({ icon: 'warning', title: 'No encontrado' })
            )
        );
    });
});

describe('Inventario – save & delete', () => {
    it('shows error and does NOT call saveProduct when barcode is empty', async () => {
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();

        const form = screen.getByTitle('Buscar en Open Food Facts').closest('div')!.closest('form')!;
        fireEvent.submit(form);

        await waitFor(() =>
            expect(mockFire).toHaveBeenCalledWith(
                expect.objectContaining({ icon: 'error', title: 'Error' })
            )
        );
        expect(window.api.db.saveProduct).not.toHaveBeenCalled();
    });

    it('calls saveProduct with correct data when form is valid', async () => {
        (window.api.db.saveProduct as any).mockResolvedValue({ id: 99, updated: false });
        render(<Inventario />);
        await waitForLoad();
        await openNewModal();

        const textboxes = screen.getAllByRole('textbox');
        fireEvent.change(textboxes[1], { target: { value: '9990001' } });
        fireEvent.change(textboxes[2], { target: { value: 'Producto Test' } });

        const spinbuttons = screen.getAllByRole('spinbutton');
        fireEvent.change(spinbuttons[0], { target: { value: '500' } });

        const form = screen.getByTitle('Buscar en Open Food Facts').closest('div')!.closest('form')!;
        fireEvent.submit(form);

        await waitFor(() =>
            expect(window.api.db.saveProduct).toHaveBeenCalledWith(
                expect.objectContaining({ codigo_barras: '9990001', nombre: 'Producto Test', precio: 500 })
            )
        );
    });

    it('calls deleteProduct when deletion is confirmed', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA]);
        mockFire.mockResolvedValue({ isConfirmed: true });
        render(<Inventario />);
        await waitFor(() => screen.getByText('Coca Cola 500ml'));

        // Delete button is 3rd button (0: Nuevo Producto, 1: Edit, 2: Delete)
        const buttons = screen.getAllByRole('button');
        fireEvent.click(buttons[2]);

        await waitFor(() =>
            expect(window.api.db.deleteProduct).toHaveBeenCalledWith(prodA.id)
        );
    });

    it('does NOT call deleteProduct when deletion is cancelled', async () => {
        (window.api.db.getProducts as any).mockResolvedValue([prodA]);
        mockFire.mockResolvedValue({ isConfirmed: false });
        render(<Inventario />);
        await waitFor(() => screen.getByText('Coca Cola 500ml'));

        const buttons = screen.getAllByRole('button');
        fireEvent.click(buttons[2]);

        await waitFor(() =>
            expect(mockFire).toHaveBeenCalled()
        );
        expect(window.api.db.deleteProduct).not.toHaveBeenCalled();
    });
});
