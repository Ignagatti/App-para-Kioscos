export const parseMontoArg = (montoStr: string): number =>
    parseFloat(montoStr.replace(/\./g, '').replace(',', '.'));

export const validarAperturaCaja = (
    montoStr: string,
    lastClosing: number | null
): string | null => {
    const mi = parseMontoArg(montoStr);
    if (!montoStr.trim() || isNaN(mi) || mi < 0)
        return 'Ingresá un monto inicial válido.';
    if (lastClosing !== null && mi > lastClosing)
        return `El monto inicial ($${mi.toLocaleString()}) no puede superar el monto de cierre anterior ($${lastClosing.toLocaleString()}).`;
    return null;
};

export const validarPagoDeuda = (
    amount: number | string,
    saldo: number
): string | null => {
    const n = Number(amount);
    if (amount === '' || isNaN(n) || n <= 0)
        return 'Ingresá un monto válido mayor a cero.';
    if (n > saldo)
        return `El monto ingresado ($${n.toLocaleString()}) supera la deuda actual ($${saldo.toLocaleString()}).`;
    return null;
};
