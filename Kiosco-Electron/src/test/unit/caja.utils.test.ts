import { describe, it, expect } from 'vitest';
import { parseMontoArg, validarAperturaCaja, validarPagoDeuda } from '../../utils/caja.utils';

describe('parseMontoArg', () => {
    it('parses an Argentine-formatted number (dots as thousands separators)', () => {
        expect(parseMontoArg('1.500')).toBe(1500);
    });
    it('parses a decimal with comma', () => {
        expect(parseMontoArg('1.500,50')).toBe(1500.5);
    });
    it('parses a plain integer string', () => {
        expect(parseMontoArg('5000')).toBe(5000);
    });
    it('returns NaN for non-numeric input', () => {
        expect(isNaN(parseMontoArg('abc'))).toBe(true);
    });
    it('parses zero', () => {
        expect(parseMontoArg('0')).toBe(0);
    });
});

describe('validarAperturaCaja', () => {
    it('returns error for empty string', () => {
        expect(validarAperturaCaja('', null)).not.toBeNull();
    });
    it('returns error for whitespace-only string', () => {
        expect(validarAperturaCaja('   ', null)).not.toBeNull();
    });
    it('returns error for non-numeric input', () => {
        expect(validarAperturaCaja('abc', null)).not.toBeNull();
    });
    it('returns error for negative monto', () => {
        expect(validarAperturaCaja('-100', null)).not.toBeNull();
    });
    it('returns null for valid positive monto without lastClosing', () => {
        expect(validarAperturaCaja('5000', null)).toBeNull();
    });
    it('returns null when monto equals lastClosing', () => {
        expect(validarAperturaCaja('5000', 5000)).toBeNull();
    });
    it('returns null when monto is less than lastClosing', () => {
        expect(validarAperturaCaja('4000', 5000)).toBeNull();
    });
    it('returns error when monto exceeds lastClosing', () => {
        expect(validarAperturaCaja('6000', 5000)).not.toBeNull();
    });
    it('error message mentions both amounts when monto exceeds lastClosing', () => {
        const msg = validarAperturaCaja('6.000', 5000);
        expect(msg).toContain('6');
        expect(msg).toContain('5');
    });
    it('returns null for zero monto (valid opening with no cash)', () => {
        expect(validarAperturaCaja('0', null)).toBeNull();
    });
});

describe('validarPagoDeuda', () => {
    it('returns error for empty string', () => {
        expect(validarPagoDeuda('', 1000)).not.toBeNull();
    });
    it('returns error for zero', () => {
        expect(validarPagoDeuda(0, 1000)).not.toBeNull();
    });
    it('returns error for negative amount', () => {
        expect(validarPagoDeuda(-50, 1000)).not.toBeNull();
    });
    it('returns error when amount exceeds saldo', () => {
        expect(validarPagoDeuda(1500, 1000)).not.toBeNull();
    });
    it('returns null for a valid partial payment', () => {
        expect(validarPagoDeuda(500, 1000)).toBeNull();
    });
    it('returns null when amount equals saldo exactly (full cancellation)', () => {
        expect(validarPagoDeuda(1000, 1000)).toBeNull();
    });
    it('returns error message containing both amounts when exceeding saldo', () => {
        const msg = validarPagoDeuda(2000, 1000);
        expect(msg).toContain('2');
        expect(msg).toContain('1');
    });
    it('accepts numeric type input', () => {
        expect(validarPagoDeuda(300, 500)).toBeNull();
    });
});
