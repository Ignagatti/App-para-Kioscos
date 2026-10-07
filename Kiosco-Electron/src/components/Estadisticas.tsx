import { useState, useEffect } from 'react';
import {
    TrendingUp, TrendingDown, ShoppingCart, DollarSign,
    Clock, AlertTriangle, CreditCard, Tag, Award,
} from 'lucide-react';
import type {
    StatsResumen, TopProducto, StatsMetodoPago,
    StatsCategoria, StatsHoraPico, ProductoBajoStock,
} from '../types/electron';

type Period = 'today' | 'week' | 'month' | 'all';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week',  label: 'Última semana' },
    { key: 'month', label: 'Este mes' },
    { key: 'all',   label: 'Todo el tiempo' },
];

const METODO_LABELS: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    OTROS: 'Otros',
    FIADO: 'Fiado',
};

const METODO_COLORS: Record<string, string> = {
    EFECTIVO: '#22c55e',
    OTROS: '#3b82f6',
    FIADO: '#f59e0b',
};

function fmt(n: number) {
    const [int, dec] = n.toFixed(2).split('.');
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `$${intFmt},${dec}`;
}

function fmtCant(n: number) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function Estadisticas() {
    const [period, setPeriod] = useState<Period>('month');
    const [resumen, setResumen] = useState<StatsResumen | null>(null);
    const [topProductos, setTopProductos]   = useState<TopProducto[]>([]);
    const [menosVendidos, setMenosVendidos] = useState<TopProducto[]>([]);
    const [metodoPago, setMetodoPago] = useState<StatsMetodoPago[]>([]);
    const [categorias, setCategorias] = useState<StatsCategoria[]>([]);
    const [horaPico, setHoraPico] = useState<StatsHoraPico[]>([]);
    const [bajoStock, setBajoStock] = useState<ProductoBajoStock[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadStats(); }, [period]);

    async function loadStats() {
        setLoading(true);
        try {
            const [res, top, menos, mp, cat, hora, stock] = await Promise.all([
                window.api.db.getStatsResumen(period),
                window.api.db.getTopProductos(period),
                window.api.db.getMenosVendidos(period),
                window.api.db.getStatsMetodoPago(period),
                window.api.db.getStatsCategorias(period),
                window.api.db.getStatsHoraPico(period),
                window.api.db.getProductosBajoStock(),
            ]);
            setResumen(res);
            setTopProductos(top);
            setMenosVendidos(menos);
            setMetodoPago(mp);
            setCategorias(cat);
            setHoraPico(hora);
            setBajoStock(stock);
        } finally {
            setLoading(false);
        }
    }

    const totalMetodoCant = metodoPago.reduce((s, m) => s + m.cantidad, 0);
    const maxTop  = Math.max(...topProductos.map(p => p.cantidad_total), 1);
    const maxHora = Math.max(...horaPico.map(h => h.cantidad_ventas), 1);
    const maxCat  = Math.max(...categorias.map(c => c.ingresos), 1);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                Cargando estadísticas...
            </div>
        );
    }

    return (
        <div style={{ overflowY: 'auto', height: '100%', paddingRight: '8px' }}>

            {/* Selector de período */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {PERIODS.map(p => (
                    <button
                        key={p.key}
                        onClick={() => setPeriod(p.key)}
                        style={{
                            padding: '8px 18px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            backgroundColor: period === p.key ? 'var(--primary)' : 'var(--bg-card)',
                            color: period === p.key ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${period === p.key ? 'var(--primary)' : 'var(--border)'}`,
                            transition: 'all 0.2s',
                        }}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Tarjetas resumen */}
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <SummaryCard
                    icon={<ShoppingCart size={20} color="#3b82f6" />}
                    label="Ventas realizadas"
                    value={String(resumen?.total_ventas ?? 0)}
                    bg="rgba(59, 130, 246, 0.1)"
                />
                <SummaryCard
                    icon={<DollarSign size={20} color="#22c55e" />}
                    label="Ingresos totales"
                    value={fmt(resumen?.ingresos ?? 0)}
                    bg="rgba(34, 197, 94, 0.1)"
                />
                <SummaryCard
                    icon={<TrendingUp size={20} color="#8b5cf6" />}
                    label="Ganancia neta"
                    value={fmt(resumen?.ganancia ?? 0)}
                    bg="rgba(139, 92, 246, 0.1)"
                />
                <SummaryCard
                    icon={<CreditCard size={20} color="#f59e0b" />}
                    label="Ticket promedio"
                    value={fmt(resumen?.ticket_promedio ?? 0)}
                    bg="rgba(245, 158, 11, 0.1)"
                />
            </div>

            {/* Fila: más vendidos + método de pago */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <Card title="Más vendidos" icon={<Award size={15} />}>
                    {topProductos.length === 0
                        ? <Empty />
                        : topProductos.map((p, i) => (
                            <div key={i} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '72%' }}>
                                        <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>#{i + 1}</span>
                                        {p.nombre}
                                    </span>
                                    <span style={{ fontWeight: 600, flexShrink: 0 }}>
                                        {fmtCant(p.cantidad_total)} {p.es_por_kilo ? 'kg' : 'uds'}
                                    </span>
                                </div>
                                <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(p.cantidad_total / maxTop) * 100}%`,
                                        backgroundColor: 'var(--primary)',
                                        borderRadius: '3px',
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>
                        ))
                    }
                </Card>

                <Card title="Método de pago" icon={<CreditCard size={15} />}>
                    {metodoPago.length === 0
                        ? <Empty />
                        : metodoPago.map((m, i) => {
                            const pct = totalMetodoCant ? Math.round(m.cantidad / totalMetodoCant * 100) : 0;
                            const color = METODO_COLORS[m.metodo_pago.toUpperCase()] ?? '#64748b';
                            return (
                                <div key={i} style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                                        <span style={{ fontWeight: 600 }}>
                                            {METODO_LABELS[m.metodo_pago.toUpperCase()] ?? m.metodo_pago}
                                        </span>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            {m.cantidad} ventas · {pct}%
                                        </span>
                                    </div>
                                    <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${pct}%`,
                                            backgroundColor: color,
                                            borderRadius: '4px',
                                            transition: 'width 0.5s ease',
                                        }} />
                                    </div>
                                    <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {fmt(m.monto_total)}
                                    </div>
                                </div>
                            );
                        })
                    }
                </Card>
            </div>

            {/* Fila: menos vendidos + por categoría */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <Card title="Menos vendidos" icon={<TrendingDown size={15} />}>
                    {menosVendidos.length === 0
                        ? <Empty />
                        : menosVendidos.map((p, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem',
                            }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '72%' }}>
                                    {p.nombre}
                                </span>
                                <span style={{ color: '#f87171', fontWeight: 600, flexShrink: 0 }}>
                                    {fmtCant(p.cantidad_total)} {p.es_por_kilo ? 'kg' : 'uds'}
                                </span>
                            </div>
                        ))
                    }
                </Card>

                <Card title="Por categoría" icon={<Tag size={15} />}>
                    {categorias.length === 0
                        ? <Empty />
                        : categorias.map((c, i) => (
                            <div key={i} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '62%' }}>
                                        {c.categoria}
                                    </span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
                                        {fmt(c.ingresos)}
                                    </span>
                                </div>
                                <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(c.ingresos / maxCat) * 100}%`,
                                        backgroundColor: 'var(--accent)',
                                        borderRadius: '3px',
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>
                        ))
                    }
                </Card>
            </div>

            {/* Horario pico */}
            <Card title="Horario de ventas" icon={<Clock size={15} />} style={{ marginBottom: '20px' }}>
                {horaPico.length === 0
                    ? <Empty />
                    : (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '72px' }}>
                                {Array.from({ length: 24 }, (_, h) => {
                                    const data = horaPico.find(x => x.hora === h);
                                    const pct = data ? Math.max((data.cantidad_ventas / maxHora) * 100, 6) : 0;
                                    return (
                                        <div
                                            key={h}
                                            title={data
                                                ? `${h}:00 hs — ${data.cantidad_ventas} venta${data.cantidad_ventas !== 1 ? 's' : ''} · ${fmt(data.monto_total)}`
                                                : `${h}:00 hs — sin ventas`
                                            }
                                            style={{
                                                flex: '1 1 0',
                                                height: `${pct}%`,
                                                backgroundColor: data ? 'var(--primary)' : 'var(--border)',
                                                borderRadius: '3px 3px 0 0',
                                                opacity: data ? 1 : 0.25,
                                                cursor: data ? 'pointer' : 'default',
                                                transition: 'height 0.5s ease',
                                                minHeight: data ? '4px' : '0',
                                            }}
                                        />
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                                {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
                                    <span key={h} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '12.5%', textAlign: 'center' }}>
                                        {h}h
                                    </span>
                                ))}
                            </div>
                        </div>
                    )
                }
            </Card>

            {/* Productos con bajo stock */}
            {bajoStock.length > 0 && (
                <Card
                    title={`Bajo stock (≤ 5 unidades) — ${bajoStock.length} producto${bajoStock.length !== 1 ? 's' : ''}`}
                    icon={<AlertTriangle size={15} color="#f59e0b" />}
                    style={{ marginBottom: '20px', borderColor: 'rgba(245, 158, 11, 0.35)' }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {bajoStock.map((p, i) => (
                            <div key={i} style={{
                                padding: '5px 12px',
                                borderRadius: '8px',
                                backgroundColor: p.stock === 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                border: `1px solid ${p.stock === 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                                fontSize: '0.8rem',
                            }}>
                                <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                                <span style={{ color: p.stock === 0 ? '#f87171' : '#fbbf24', marginLeft: '8px', fontWeight: 700 }}>
                                    {p.stock === 0 ? 'SIN STOCK' : `${fmtCant(p.stock)} ${p.es_por_kilo ? 'kg' : (p.stock !== 1 ? 'uds' : 'ud')}`}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

        </div>
    );
}

// ── Sub-componentes ─────────────────────────────────────────────────────────────

function Card({ title, icon, children, style }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    return (
        <div className="stat-card" style={{ ...style, gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
                <h3 style={{
                    margin: 0, fontSize: '0.78rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    color: 'var(--text-secondary)',
                }}>
                    {title}
                </h3>
            </div>
            {children}
        </div>
    );
}

function SummaryCard({ icon, label, value, bg }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    bg: string;
}) {
    return (
        <div className="stat-card">
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '38px', height: '38px', borderRadius: '10px',
                backgroundColor: bg, marginBottom: '8px',
            }}>
                {icon}
            </div>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
        </div>
    );
}

function Empty() {
    return (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '14px 0' }}>
            Sin datos para el período seleccionado
        </div>
    );
}
