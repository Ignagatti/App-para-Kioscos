export type ResultadoParcial =
    | { tipo: 'FIADO_TOTAL' }
    | { tipo: 'PAGO_COMPLETO' }
    | { tipo: 'PARCIAL'; deuda: number };

export const calcularPagoParcial = (total: number, abono: number): ResultadoParcial => {
    if (abono <= 0) return { tipo: 'FIADO_TOTAL' };
    const deuda = Math.round((total - abono) * 100) / 100;
    if (deuda <= 0) return { tipo: 'PAGO_COMPLETO' };
    return { tipo: 'PARCIAL', deuda };
};

export const parseAbono = (value: string): number => {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
};

export const validarAbono = (abonoStr: string, total: number): string | null => {
    const n = parseFloat(abonoStr);
    if (abonoStr.trim() === '' || isNaN(n)) return 'Ingresá un monto válido.';
    if (n < 0) return 'El monto no puede ser negativo.';
    if (n > total) return `El abono ($${n.toLocaleString()}) no puede superar el total ($${total.toLocaleString()}).`;
    return null;
};
