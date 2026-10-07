import { useState } from 'react';

export interface Shortcuts {
    tabVentas: string;
    tabInventario: string;
    tabReportes: string;
    tabClientes: string;
    tabCaja: string;
    tabProveedores: string;
    tabEstadisticas: string;
    pagarEfectivo: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
    tabVentas: 'F1',
    tabCaja: 'F2',
    tabInventario: 'F3',
    tabProveedores: 'F4',
    tabClientes: 'F5',
    tabReportes: 'F6',
    tabEstadisticas: 'F7',
    pagarEfectivo: 'F12',
};

const STORAGE_KEY = 'kiosco_shortcuts';

export function useShortcuts() {
    const [shortcuts, setShortcutsState] = useState<Shortcuts>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) };
        } catch {}
        return { ...DEFAULT_SHORTCUTS };
    });

    const setShortcut = (key: keyof Shortcuts, value: string) => {
        setShortcutsState(prev => {
            const next = { ...prev, [key]: value };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const resetShortcuts = () => {
        localStorage.removeItem(STORAGE_KEY);
        setShortcutsState({ ...DEFAULT_SHORTCUTS });
    };

    return { shortcuts, setShortcut, resetShortcuts };
}
