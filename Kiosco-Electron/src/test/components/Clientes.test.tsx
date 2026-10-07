import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import Clientes from '../../components/Clientes';

// vi.mock es hoisted al tope del archivo; usamos vi.hoisted() para que mockFire
// exista en el momento en que el factory se ejecuta.
const mockFire = vi.hoisted(() => vi.fn().mockResolvedValue({ isConfirmed: false }));

vi.mock('sweetalert2-react-content', () => ({ default: (s: any) => s }));
vi.mock('sweetalert2', () => ({
    default: {
        fire: mockFire,
        mixin: vi.fn(() => ({ fire: vi.fn() })),
        isVisible: vi.fn(() => false),
    },
}));

const mockSession = { id: 5, monto_inicial: 1000, fecha_apertura: '2026-05-16T10:00:00' };

describe('Clientes component', () => {
    it('renders summary stats', async () => {
        render(<Clientes session={null} />);
        await waitFor(() => {
            expect(screen.getByText('Total Clientes')).toBeInTheDocument();
            expect(screen.getByText('Deuda Total (A cobrar)')).toBeInTheDocument();
        });
    });

    it('shows empty-state message when no clients exist', async () => {
        render(<Clientes session={null} />);
        await waitFor(() => {
            expect(screen.getByText(/No se encontraron clientes/i)).toBeInTheDocument();
        });
    });

    it('renders a client row after loading', async () => {
        (window.api.db.getClients as any).mockResolvedValue([
            { id: 1, nombre: 'María López', telefono: '1122', saldo: 1500 },
        ]);
        render(<Clientes session={null} />);
        await waitFor(() => {
            expect(screen.getByText('María López')).toBeInTheDocument();
        });
    });

    it('opens the new-client modal when the button is clicked', async () => {
        render(<Clientes session={null} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo Cliente/i }));
        expect(screen.getByRole('heading', { name: 'Nuevo Cliente' })).toBeInTheDocument();
    });

    it('calls addClient when form is submitted with a nombre', async () => {
        (window.api.db.addClient as any).mockResolvedValue({ id: 2 });
        // Make the success Swal fire resolve immediately
        mockFire.mockResolvedValue({ isConfirmed: true });

        render(<Clientes session={null} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo Cliente/i }));

        // Scope inside the form to avoid picking up the search bar (also a textbox)
        const form = screen.getByRole('button', { name: 'Guardar' }).closest('form')!;
        const nombreInput = within(form).getAllByRole('textbox')[0];
        fireEvent.change(nombreInput, { target: { value: 'Carlos Test' } });

        fireEvent.submit(form);

        await waitFor(() => {
            expect(window.api.db.addClient).toHaveBeenCalledWith(
                expect.objectContaining({ nombre: 'Carlos Test', saldo: 0 })
            );
        });
    });

    it('blocks payment exceeding client saldo', async () => {
        const client = { id: 1, nombre: 'Pedro', telefono: '', saldo: 500 };
        (window.api.db.getClients as any).mockResolvedValue([client]);

        render(<Clientes session={null} />);
        await waitFor(() => screen.getByText('Pedro'));

        fireEvent.click(screen.getByTitle('Registrar Pago'));
        await waitFor(() => screen.getByRole('heading', { name: 'Registrar Pago' }));

        // The only spinbutton visible in the payment modal
        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '1000' } });

        // Use fireEvent.submit to bypass HTML constraint validation in jsdom
        fireEvent.submit(input.closest('form')!);

        await waitFor(() => {
            expect(mockFire).toHaveBeenCalledWith(
                'Atención',
                expect.stringContaining('supera la deuda'),
                'warning',
            );
        });
        expect(window.api.db.payClientDebt).not.toHaveBeenCalled();
    });

    it('filters clients by search query', async () => {
        (window.api.db.getClients as any).mockResolvedValue([
            { id: 1, nombre: 'Ana Torres', telefono: '', saldo: 0 },
            { id: 2, nombre: 'Beto Ruiz', telefono: '', saldo: 0 },
        ]);
        render(<Clientes session={null} />);
        await waitFor(() => screen.getByText('Ana Torres'));

        const searchInput = screen.getByPlaceholderText(/Buscar cliente/i);
        fireEvent.change(searchInput, { target: { value: 'Ana' } });

        expect(screen.getByText('Ana Torres')).toBeInTheDocument();
        expect(screen.queryByText('Beto Ruiz')).not.toBeInTheDocument();
    });

    it('calls addMovimiento when session is open after a client payment', async () => {
        const client = { id: 1, nombre: 'Laura', telefono: '', saldo: 300 };
        (window.api.db.getClients as any).mockResolvedValue([client]);
        mockFire.mockResolvedValue({ isConfirmed: true });

        render(<Clientes session={mockSession} />);
        await waitFor(() => screen.getByText('Laura'));

        fireEvent.click(screen.getByTitle('Registrar Pago'));
        await waitFor(() => screen.getByRole('heading', { name: 'Registrar Pago' }));

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '300' } });
        fireEvent.submit(input.closest('form')!);

        await waitFor(() => {
            expect(window.api.db.payClientDebt).toHaveBeenCalledWith(
                expect.objectContaining({ clientId: 1, amount: 300 })
            );
            expect(window.api.db.addMovimiento).toHaveBeenCalledWith(
                expect.objectContaining({
                    tipo: 'ENTRADA',
                    categoria: 'Cobro de Fiado',
                    monto: 300,
                    sesionId: mockSession.id,
                    metodoPago: 'EFECTIVO',
                })
            );
        });
    });

    it('does NOT call addMovimiento when session is null (caja cerrada)', async () => {
        const client = { id: 1, nombre: 'Laura', telefono: '', saldo: 300 };
        (window.api.db.getClients as any).mockResolvedValue([client]);
        mockFire.mockResolvedValue({ isConfirmed: true });

        render(<Clientes session={null} />);
        await waitFor(() => screen.getByText('Laura'));

        fireEvent.click(screen.getByTitle('Registrar Pago'));
        await waitFor(() => screen.getByRole('heading', { name: 'Registrar Pago' }));

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '300' } });
        fireEvent.submit(input.closest('form')!);

        await waitFor(() => {
            expect(window.api.db.payClientDebt).toHaveBeenCalled();
        });
        expect(window.api.db.addMovimiento).not.toHaveBeenCalled();
    });
});
