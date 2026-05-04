import { describe, it, expect } from 'vitest';
import { calcularPagoParcial, validarAbono } from '../../utils/venta.utils';

describe('calcularPagoParcial', () => {
    it('returns FIADO_TOTAL when abono is 0', () => {
        expect(calcularPagoParcial(1000, 0).tipo).toBe('FIADO_TOTAL');
    });
    it('returns FIADO_TOTAL when abono is negative', () => {
        expect(calcularPagoParcial(1000, -100).tipo).toBe('FIADO_TOTAL');
    });
    it('returns PAGO_COMPLETO when abono equals total', () => {
        expect(calcularPagoParcial(1000, 1000).tipo).toBe('PAGO_COMPLETO');
    });
    it('returns PAGO_COMPLETO when abono exceeds total', () => {
        expect(calcularPagoParcial(1000, 1200).tipo).toBe('PAGO_COMPLETO');
    });
    it('returns PARCIAL with correct remainder for $1500 total and $600 abono', () => {
        const result = calcularPagoParcial(1500, 600);
        expect(result.tipo).toBe('PARCIAL');
        if (result.tipo === 'PARCIAL') expect(result.deuda).toBe(900);
    });
    it('rounds deuda to 2 decimal places to avoid floating-point drift', () => {
        // 10.30 - 10.10 = 0.1999... without rounding
        const result = calcularPagoParcial(10.30, 10.10);
        expect(result.tipo).toBe('PARCIAL');
        if (result.tipo === 'PARCIAL') expect(result.deuda).toBe(0.20);
    });
    it('handles cent-level amounts correctly', () => {
        const result = calcularPagoParcial(100.99, 50.49);
        expect(result.tipo).toBe('PARCIAL');
        if (result.tipo === 'PARCIAL') expect(result.deuda).toBe(50.50);
    });
    it('deuda of 0 or less → PAGO_COMPLETO (no lingering debt)', () => {
        const result = calcularPagoParcial(1000, 999.999);
        expect(result.tipo).toBe('PAGO_COMPLETO');
    });
});

describe('validarAbono', () => {
    it('returns error for empty string', () => {
        expect(validarAbono('', 1000)).not.toBeNull();
    });
    it('returns error for non-numeric string', () => {
        expect(validarAbono('abc', 1000)).not.toBeNull();
    });
    it('returns error for negative abono', () => {
        expect(validarAbono('-100', 1000)).not.toBeNull();
    });
    it('returns error when abono exceeds total', () => {
        expect(validarAbono('1500', 1000)).not.toBeNull();
    });
    it('returns null for 0 (valid: everything goes to fiado)', () => {
        expect(validarAbono('0', 1000)).toBeNull();
    });
    it('returns null for a valid partial amount', () => {
        expect(validarAbono('500', 1000)).toBeNull();
    });
    it('returns null when abono equals total (full payment)', () => {
        expect(validarAbono('1000', 1000)).toBeNull();
    });
});
