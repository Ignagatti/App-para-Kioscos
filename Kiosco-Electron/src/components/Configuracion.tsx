import { useState, useEffect } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import type { Shortcuts } from '../hooks/useShortcuts';
import { DEFAULT_SHORTCUTS } from '../hooks/useShortcuts';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

interface ConfiguracionProps {
    shortcuts: Shortcuts;
    onShortcutChange: (key: keyof Shortcuts, value: string) => void;
    onReset: () => void;
}

const formatKey = (key: string): string => {
    if (key === ' ') return 'Espacio';
    if (key === 'ArrowUp') return '↑';
    if (key === 'ArrowDown') return '↓';
    if (key === 'ArrowLeft') return '←';
    if (key === 'ArrowRight') return '→';
    if (key === 'Control') return 'Ctrl';
    if (key === 'Alt') return 'Alt';
    if (key === 'Shift') return 'Shift';
    if (key.length === 1) return key.toUpperCase();
    return key;
};

const SHORTCUT_DEFS: { key: keyof Shortcuts; label: string; description: string }[] = [
    { key: 'tabVentas',       label: 'Ir a Ventas',               description: 'Navegar a la pantalla de ventas' },
    { key: 'tabInventario',   label: 'Ir a Inventario',           description: 'Navegar al inventario de productos' },
    { key: 'tabReportes',     label: 'Ir a Reportes',             description: 'Navegar a los reportes' },
    { key: 'tabClientes',     label: 'Ir a Clientes/Fiados',      description: 'Navegar a la lista de clientes' },
    { key: 'tabCaja',         label: 'Ir a Caja',                 description: 'Navegar a la caja registradora' },
    { key: 'pagarEfectivo',   label: 'Cobro rápido en Efectivo',  description: 'Cobra el carrito actual en efectivo sin abrir el modal' },
];

export default function Configuracion({ shortcuts, onShortcutChange, onReset }: ConfiguracionProps) {
    const [listening, setListening] = useState<keyof Shortcuts | null>(null);

    // Global capture-phase listener — fires before App.tsx's handler so F1-F5 don't switch tabs
    useEffect(() => {
        if (!listening) return;

        const capture = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key !== 'Escape') {
                // Warn if the key is already used by another shortcut
                const conflict = (Object.keys(shortcuts) as (keyof Shortcuts)[]).find(
                    k => k !== listening && shortcuts[k] === e.key
                );
                if (conflict) {
                    const conflictLabel = SHORTCUT_DEFS.find(d => d.key === conflict)?.label ?? conflict;
                    MySwal.fire({
                        icon: 'warning',
                        title: 'Tecla en uso',
                        text: `"${formatKey(e.key)}" ya está asignada a "${conflictLabel}". Elegí otra.`,
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        confirmButtonColor: '#3b82f6',
                        timer: 3000,
                        showConfirmButton: false,
                    });
                } else {
                    onShortcutChange(listening, e.key);
                }
            }
            setListening(null);
        };

        // Small delay so the button click itself doesn't get captured
        const id = setTimeout(() => {
            window.addEventListener('keydown', capture, { capture: true, once: true });
        }, 80);

        return () => {
            clearTimeout(id);
            window.removeEventListener('keydown', capture, { capture: true });
        };
    }, [listening]);

    const handleReset = async () => {
        const { isConfirmed } = await MySwal.fire({
            title: '¿Restaurar teclas?',
            text: 'Se volverán a los valores por defecto (F1–F5, F12).',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sí, restaurar',
            cancelButtonText: 'Cancelar',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
        });
        if (isConfirmed) onReset();
    };

    const navDefs = SHORTCUT_DEFS.slice(0, 5);
    const salesDefs = SHORTCUT_DEFS.slice(5);

    return (
        <div style={{ height: '100%', overflowY: 'auto' }}>
            <div style={{ maxWidth: '700px' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
                    <Keyboard size={28} color="var(--primary)" />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Atajos de Teclado</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Hacé clic en <strong>Cambiar</strong> y presioná la tecla que quieras usar. Escape cancela.
                        </p>
                    </div>
                </div>

                {/* Navegación */}
                <Section title="Navegación">
                    {navDefs.map(def => (
                        <ShortcutRow
                            key={def.key}
                            label={def.label}
                            description={def.description}
                            currentKey={shortcuts[def.key]}
                            defaultKey={DEFAULT_SHORTCUTS[def.key]}
                            isListening={listening === def.key}
                            onCapture={() => setListening(def.key)}
                        />
                    ))}
                </Section>

                {/* Ventas */}
                <Section title="Ventas" style={{ marginTop: '16px' }}>
                    {salesDefs.map(def => (
                        <ShortcutRow
                            key={def.key}
                            label={def.label}
                            description={def.description}
                            currentKey={shortcuts[def.key]}
                            defaultKey={DEFAULT_SHORTCUTS[def.key]}
                            isListening={listening === def.key}
                            onCapture={() => setListening(def.key)}
                        />
                    ))}
                </Section>

                {/* Reset */}
                <button
                    className="btn"
                    onClick={handleReset}
                    style={{
                        marginTop: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <RotateCcw size={15} />
                    Restaurar teclas por defecto
                </button>
            </div>
        </div>
    );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div
            className="stat-card"
            style={{ ...style, padding: '20px 24px' }}
        >
            <h4 style={{
                margin: '0 0 12px',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                fontWeight: 700,
            }}>
                {title}
            </h4>
            {children}
        </div>
    );
}

interface ShortcutRowProps {
    label: string;
    description: string;
    currentKey: string;
    defaultKey: string;
    isListening: boolean;
    onCapture: () => void;
}

function ShortcutRow({ label, description, currentKey, defaultKey, isListening, onCapture }: ShortcutRowProps) {
    const isModified = currentKey !== defaultKey;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderBottom: '1px solid var(--border)',
        }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{label}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {description}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '16px' }}>
                {isListening ? (
                    <span style={{
                        padding: '6px 14px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        border: '2px solid var(--primary)',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        color: 'var(--primary)',
                        minWidth: '140px',
                        textAlign: 'center',
                    }}>
                        Presioná una tecla...
                    </span>
                ) : (
                    <kbd style={{
                        padding: '5px 14px',
                        backgroundColor: 'var(--bg-main)',
                        border: `1px solid ${isModified ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: isModified ? 'var(--primary)' : 'var(--text-primary)',
                        minWidth: '52px',
                        textAlign: 'center',
                        display: 'inline-block',
                    }}>
                        {formatKey(currentKey)}
                    </kbd>
                )}

                <button
                    className="btn"
                    onClick={onCapture}
                    disabled={isListening}
                    style={{
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                    }}
                >
                    Cambiar
                </button>
            </div>
        </div>
    );
}
