import { useState } from 'react';

export interface Shortcuts {
    tabVentas: string;
    tabInventario: string;
    tabReportes: string;
    tabClientes: string;
    tabCaja: string;
    pagarEfectivo: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
    tabVentas: 'F1',
    tabInventario: 'F2',
    tabReportes: 'F3',
    tabClientes: 'F4',
    tabCaja: 'F5',
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
