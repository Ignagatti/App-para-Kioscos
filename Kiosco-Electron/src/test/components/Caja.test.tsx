import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Caja from '../../components/Caja';
import type { SessionStatus, Movement } from '../../types/electron';

const mockFire = vi.hoisted(() => vi.fn().mockResolvedValue({ isConfirmed: false }));

vi.mock('sweetalert2-react-content', () => ({ default: (s: any) => s }));
vi.mock('sweetalert2', () => ({
    default: {
        fire: mockFire,
        mixin: vi.fn(() => ({ fire: vi.fn() })),
        isVisible: vi.fn(() => false),
    },
}));

const session: SessionStatus = {
    id: 1,
    monto_inicial: 5000,
    fecha_apertura: '2024-01-01T10:00:00',
};

const movement: Movement = {
    id: 1, fecha: '2024-01-01T10:30:00', tipo: 'ENTRADA',
    categoria: 'Inicio', monto: 5000, descripcion: '',
    metodo_pago: 'EFECTIVO', sesion_id: 1,
};

describe('Caja – caja cerrada (session = null)', () => {
    it('shows "La caja está cerrada" message', () => {
        render(<Caja session={null} onSessionChange={vi.fn()} />);
        expect(screen.getByText(/La caja está cerrada/i)).toBeInTheDocument();
    });

    it('shows "Abrir Caja" submit button', () => {
        render(<Caja session={null} onSessionChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Abrir Caja/i })).toBeInTheDocument();
    });

    it('pre-fills monto input with last closing amount', async () => {
        (window.api.db.getLastClosingAmount as any).mockResolvedValue(3000);
        render(<Caja session={null} onSessionChange={vi.fn()} />);

        await waitFor(() => {
            const input = screen.getByRole('spinbutton') as HTMLInputElement;
            expect(input.value).toBe('3000');
        });
    });

    it('shows warning and does NOT call openCaja when monto is empty', async () => {
        render(<Caja session={null} onSessionChange={vi.fn()} />);

        const form = screen.getByRole('button', { name: /Abrir Caja/i }).closest('form')!;
        fireEvent.submit(form);

        await waitFor(() =>
            expect(mockFire).toHaveBeenCalledWith('Atención', expect.any(String), 'warning')
        );
        expect(window.api.db.openCaja).not.toHaveBeenCalled();
    });

    it('calls openCaja + getSessionStatus + onSessionChange when form is valid', async () => {
        const onSessionChange = vi.fn();
        (window.api.db.openCaja as any).mockResolvedValue({ id: 1 });
        (window.api.db.getSessionStatus as any).mockResolvedValue(session);

        render(<Caja session={null} onSessionChange={onSessionChange} />);

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '5000' } });
        fireEvent.submit(input.closest('form')!);

        await waitFor(() => {
            expect(window.api.db.openCaja).toHaveBeenCalledWith(5000);
            expect(window.api.db.getSessionStatus).toHaveBeenCalled();
            expect(onSessionChange).toHaveBeenCalledWith(session);
        });
    });

    it('"Nuevo" movement button is disabled when caja is closed', () => {
        render(<Caja session={null} onSessionChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Nuevo/i })).toBeDisabled();
    });

    it('shows "Abre la caja para ver movimientos" in the movements table', () => {
        render(<Caja session={null} onSessionChange={vi.fn()} />);
        expect(screen.getByText(/Abre la caja para ver/i)).toBeInTheDocument();
    });
});

describe('Caja – caja abierta (session provided)', () => {
    it('shows "Caja Abierta" label', () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        expect(screen.getByText(/Caja Abierta/i)).toBeInTheDocument();
    });

    it('shows "Cerrar Caja" submit button', () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Cerrar Caja/i })).toBeInTheDocument();
    });

    it('"Nuevo" movement button is enabled when caja is open', () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Nuevo/i })).not.toBeDisabled();
    });

    it('shows empty movements message when no movements', async () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        await waitFor(() =>
            expect(screen.getByText(/No hay movimientos en esta sesión/i)).toBeInTheDocument()
        );
    });

    it('renders movement rows when movements exist', async () => {
        (window.api.db.getMovimientos as any).mockResolvedValue([movement]);
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    });

    it('fills suggested amounts when "Sugerir montos" is clicked', async () => {
        (window.api.db.getTotalesSugeridos as any).mockResolvedValue({ efectivo: 7500, otros: 2000 });
        render(<Caja session={session} onSessionChange={vi.fn()} />);

        fireEvent.click(screen.getByText(/Sugerir montos/i));

        await waitFor(() => {
            const spinbuttons = screen.getAllByRole('spinbutton');
            expect((spinbuttons[0] as HTMLInputElement).value).toBe('7500');
            expect((spinbuttons[1] as HTMLInputElement).value).toBe('2000');
        });
    });

    it('calls closeCaja + onSessionChange(null) when close confirmed', async () => {
        const onSessionChange = vi.fn();
        mockFire.mockResolvedValue({ isConfirmed: true });

        render(<Caja session={session} onSessionChange={onSessionChange} />);

        const [ef, ot] = screen.getAllByRole('spinbutton');
        fireEvent.change(ef, { target: { value: '6000' } });
        fireEvent.change(ot, { target: { value: '1000' } });
        fireEvent.submit(screen.getByRole('button', { name: /Cerrar Caja/i }).closest('form')!);

        await waitFor(() => {
            expect(window.api.db.closeCaja).toHaveBeenCalledWith({
                sessionId: session.id,
                montoEfectivo: 6000,
                montoOtros: 1000,
            });
            expect(onSessionChange).toHaveBeenCalledWith(null);
        });
    });

    it('does NOT call closeCaja when close is cancelled', async () => {
        mockFire.mockResolvedValue({ isConfirmed: false });

        render(<Caja session={session} onSessionChange={vi.fn()} />);

        const [ef, ot] = screen.getAllByRole('spinbutton');
        fireEvent.change(ef, { target: { value: '6000' } });
        fireEvent.change(ot, { target: { value: '1000' } });
        fireEvent.submit(screen.getByRole('button', { name: /Cerrar Caja/i }).closest('form')!);

        await waitFor(() => expect(mockFire).toHaveBeenCalled());
        expect(window.api.db.closeCaja).not.toHaveBeenCalled();
    });
});

describe('Caja – movement modal', () => {
    it('opens movement modal when "Nuevo" is clicked', async () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo/i }));
        expect(screen.getByText(/Registrar Movimiento/i)).toBeInTheDocument();
    });

    it('closes movement modal on Cancelar click', async () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo/i }));
        expect(screen.getByText(/Registrar Movimiento/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
        await waitFor(() =>
            expect(screen.queryByText(/Registrar Movimiento/i)).not.toBeInTheDocument()
        );
    });

    it('shows warning and does NOT call addMovimiento when categoria is empty', async () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo/i }));

        const registrarBtn = screen.getByRole('button', { name: /Registrar/i });
        fireEvent.submit(registrarBtn.closest('form')!);

        await waitFor(() =>
            expect(mockFire).toHaveBeenCalledWith('Faltan datos', expect.any(String), 'warning')
        );
        expect(window.api.db.addMovimiento).not.toHaveBeenCalled();
    });

    it('calls addMovimiento with correct data when form is valid', async () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo/i }));

        const registrarBtn = screen.getByRole('button', { name: /Registrar/i });
        const form = registrarBtn.closest('form')!;

        // Fill categoria
        fireEvent.change(
            within(form).getByPlaceholderText(/Pago a proveedor/i),
            { target: { value: 'Retiro del dueño' } }
        );

        // Fill monto (only spinbutton in the movement form)
        fireEvent.change(
            within(form).getByRole('spinbutton'),
            { target: { value: '2000' } }
        );

        fireEvent.submit(form);

        await waitFor(() =>
            expect(window.api.db.addMovimiento).toHaveBeenCalledWith(
                expect.objectContaining({
                    categoria: 'Retiro del dueño',
                    monto: 2000,
                    sesionId: session.id,
                    tipo: 'ENTRADA',
                })
            )
        );
    });

    it('defaults movement tipo to ENTRADA', async () => {
        render(<Caja session={session} onSessionChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo/i }));

        const form = screen.getByRole('button', { name: /Registrar/i }).closest('form')!;
        const tipoSelect = within(form).getAllByRole('combobox')[0] as HTMLSelectElement;
        expect(tipoSelect.value).toBe('ENTRADA');
    });
});
