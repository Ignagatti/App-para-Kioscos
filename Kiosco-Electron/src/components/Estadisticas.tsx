import { useState, useEffect } from 'react';
import {
    TrendingUp, TrendingDown, ShoppingCart, DollarSign,
    Clock, AlertTriangle, CreditCard, Tag, Award,
    Calendar, Package, Layers
} from 'lucide-react';
import type {
    StatsResumen, TopProducto, StatsMetodoPago,
    StatsCategoria, StatsHoraPico, ProductoBajoStock, StatsPorDia
} from '../types/electron';

type Period = 'today' | 'week' | 'month' | 'all';
type TopSort = 'cantidad' | 'ganancia' | 'ingresos';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week',  label: 'Últimos 7 días' },
    { key: 'month', label: 'Este mes' },
    { key: 'all',   label: 'Histórico total' },
];

const METODO_LABELS: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    OTROS: 'Otros (QR / Tarjeta)',
    FIADO: 'Fiado (Cuenta Corriente)',
};

const METODO_COLORS: Record<string, string> = {
    EFECTIVO: 'var(--success)',
    OTROS: 'var(--accent)',
    FIADO: 'var(--warning)',
};

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmt(n: number) {
    return `$${Math.round(n || 0).toLocaleString('es-AR')}`;
}

function fmtCant(n: number) {
    return Number.isInteger(n) ? String(n) : parseFloat((n || 0).toFixed(2)).toString();
}

export default function Estadisticas() {
    const [period, setPeriod] = useState<Period>('month');
    const [topSort, setTopSort] = useState<TopSort>('ganancia');
    const [resumen, setResumen] = useState<StatsResumen | null>(null);
    const [topProductos, setTopProductos]   = useState<TopProducto[]>([]);
    const [porDia, setPorDia]               = useState<StatsPorDia[]>([]);
    const [menosVendidos, setMenosVendidos] = useState<TopProducto[]>([]);
    const [metodoPago, setMetodoPago]       = useState<StatsMetodoPago[]>([]);
    const [categorias, setCategorias]       = useState<StatsCategoria[]>([]);
    const [horaPico, setHoraPico]           = useState<StatsHoraPico[]>([]);
    const [bajoStock, setBajoStock]         = useState<ProductoBajoStock[]>([]);
    const [loading, setLoading]             = useState(true);

    useEffect(() => { loadStats(); }, [period]);

    async function loadStats() {
        setLoading(true);
        try {
            const [res, top, menos, mp, cat, hora, stock, dias] = await Promise.all([
                window.api.db.getStatsResumen(period),
                window.api.db.getTopProductos(period),
                window.api.db.getMenosVendidos(period),
                window.api.db.getStatsMetodoPago(period),
                window.api.db.getStatsCategorias(period),
                window.api.db.getStatsHoraPico(period),
                window.api.db.getProductosBajoStock(),
                window.api.db.getStatsPorDia ? window.api.db.getStatsPorDia(period) : Promise.resolve([]),
            ]);
            setResumen(res);
            setTopProductos(top);
            setMenosVendidos(menos);
            setMetodoPago(mp);
            setCategorias(cat);
            setHoraPico(hora);
            setBajoStock(stock);
            setPorDia(dias);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                Cargando estadísticas del negocio...
            </div>
        );
    }

    const ingresos = resumen?.ingresos ?? 0;
    const ganancia = resumen?.ganancia ?? 0;
    const costoMercaderia = resumen?.costo_mercaderia ?? Math.max(0, ingresos - ganancia);
    const gastosSalidas = resumen?.gastos_salidas ?? 0;
    const resultadoFinal = ganancia - gastosSalidas;
    const margenGlobal = ingresos > 0 ? Math.round((ganancia / ingresos) * 100) : 0;
    const diasActivos = Math.max(1, resumen?.dias_activos ?? 1);
    const promedioDiario = ingresos / diasActivos;

    // Top productos ordenados según criterio elegido
    const sortedTop = [...topProductos].sort((a, b) => {
        if (topSort === 'ganancia') return (b.ganancia_total || 0) - (a.ganancia_total || 0);
        if (topSort === 'ingresos') return (b.ingresos_total || 0) - (a.ingresos_total || 0);
        return (b.cantidad_total || 0) - (a.cantidad_total || 0);
    }).slice(0, 10);

    const maxTopMetric = Math.max(
        ...sortedTop.map(p =>
            topSort === 'ganancia' ? (p.ganancia_total || 0) :
            topSort === 'ingresos' ? (p.ingresos_total || 0) :
            (p.cantidad_total || 0)
        ),
        1
    );

    const totalMetodoMonto = metodoPago.reduce((s, m) => s + m.monto_total, 0);
    const totalMetodoCant  = metodoPago.reduce((s, m) => s + m.cantidad, 0);
    const maxCat = Math.max(...categorias.map(c => c.ingresos), 1);
    const totalCatIngresos = categorias.reduce((s, c) => s + c.ingresos, 0);

    // Horarios y turnos
    const maxHora = Math.max(...horaPico.map(h => h.cantidad_ventas), 1);
    const bestHour = horaPico.length > 0
        ? [...horaPico].sort((a, b) => b.cantidad_ventas - a.cantidad_ventas)[0]
        : null;

    const turnos = [
        { label: 'Mañana (06 a 14 hs)', horas: [6, 7, 8, 9, 10, 11, 12, 13] },
        { label: 'Tarde (14 a 20 hs)',  horas: [14, 15, 16, 17, 18, 19] },
        { label: 'Noche (20 a 06 hs)',  horas: [20, 21, 22, 23, 0, 1, 2, 3, 4, 5] },
    ].map(t => {
        const rows = horaPico.filter(h => t.horas.includes(h.hora));
        const ventas = rows.reduce((acc, r) => acc + r.cantidad_ventas, 0);
        const monto  = rows.reduce((acc, r) => acc + r.monto_total, 0);
        return { ...t, ventas, monto };
    });
    const totalTurnosVentas = Math.max(1, turnos.reduce((acc, t) => acc + t.ventas, 0));

    // Evolución diaria (últimos 14 días con actividad dentro del período)
    const recentDays = porDia.slice(-14);
    const maxDayIngreso = Math.max(...recentDays.map(d => d.ingresos), 1);
    const bestDay = porDia.length > 0
        ? [...porDia].sort((a, b) => b.ingresos - a.ingresos)[0]
        : null;

    // Rendimiento promedio por día de la semana (Lun-Dom)
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]; // Lun a Dom
    const weekdayStats = weekdayOrder.map(dow => {
        const matching = porDia.filter(d => d.dia_semana === dow);
        const countDays = matching.length;
        const avgIngresos = countDays > 0 ? matching.reduce((s, d) => s + d.ingresos, 0) / countDays : 0;
        const totalVentasDow = matching.reduce((s, d) => s + d.cantidad_ventas, 0);
        return {
            dow,
            label: DIAS_SEMANA[dow],
            avgIngresos,
            totalVentasDow,
            countDays,
        };
    });
    const maxWeekdayAvg = Math.max(...weekdayStats.map(w => w.avgIngresos), 1);

    return (
        <div style={{ overflowY: 'auto', height: '100%', paddingRight: '8px' }}>

            {/* Selector de período */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {diasActivos} {diasActivos === 1 ? 'día con ventas' : 'días con ventas'} en el período
                </div>
            </div>

            {/* Fila 1: 6 KPIs Principales */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '14px',
                marginBottom: '20px',
            }}>
                <SummaryCard
                    icon={<DollarSign size={20} color="var(--primary-light)" />}
                    label="Facturación Total"
                    value={fmt(ingresos)}
                    sub={`Prom. ${fmt(promedioDiario)} / día activo`}
                    bg="rgba(45, 122, 95, 0.14)"
                />
                <SummaryCard
                    icon={<TrendingUp size={20} color="var(--success-light)" />}
                    label="Ganancia Bruta (Ventas)"
                    value={fmt(ganancia)}
                    sub={`Margen real: ${margenGlobal}% sobre ventas`}
                    bg="rgba(53, 138, 95, 0.14)"
                    valueColor="var(--success-light)"
                />
                <SummaryCard
                    icon={<Package size={20} color="var(--accent)" />}
                    label="Costo Mercadería (A reponer)"
                    value={fmt(costoMercaderia)}
                    sub={gastosSalidas > 0 ? `Salidas caja: -${fmt(gastosSalidas)} (Neto: ${fmt(resultadoFinal)})` : 'Capital necesario para reponer lo vendido'}
                    bg="rgba(196, 132, 61, 0.14)"
                />
                <SummaryCard
                    icon={<ShoppingCart size={20} color="var(--primary-light)" />}
                    label="Tickets Emitidos"
                    value={String(resumen?.total_ventas ?? 0)}
                    sub={`${fmtCant(resumen?.unidades_totales ?? 0)} uds · ${(resumen?.items_promedio ?? 0).toFixed(1)} ítems/ticket`}
                    bg="rgba(45, 122, 95, 0.14)"
                />
                <SummaryCard
                    icon={<CreditCard size={20} color="var(--warning)" />}
                    label="Ticket Promedio"
                    value={fmt(resumen?.ticket_promedio ?? 0)}
                    sub={`Compra más alta: ${fmt(resumen?.ticket_maximo ?? 0)}`}
                    bg="rgba(204, 132, 51, 0.14)"
                />
                <SummaryCard
                    icon={<Layers size={20} color="var(--accent)" />}
                    label="Capital en Mercadería"
                    value={fmt(resumen?.valor_inventario_venta ?? 0)}
                    sub={`Costo stock: ${fmt(resumen?.valor_inventario_costo ?? 0)} · Fiados: ${fmt(resumen?.deuda_clientes_total ?? 0)}`}
                    bg="rgba(196, 132, 61, 0.14)"
                />
            </div>

            {/* Fila 2: Evolución Diaria + Rendimiento por Día de Semana */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <Card
                    title="Evolución diaria de ingresos y ganancias"
                    icon={<Calendar size={15} />}
                    rightInfo={bestDay ? `Récord: ${bestDay.fecha.split('-').reverse().slice(0, 2).join('/')} (${fmt(bestDay.ingresos)})` : undefined}
                >
                    {recentDays.length === 0 ? (
                        <Empty />
                    ) : (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px', paddingTop: '10px' }}>
                                {recentDays.map((d) => {
                                    const pctIngreso = Math.max((d.ingresos / maxDayIngreso) * 100, 6);
                                    const pctGanancia = d.ingresos > 0 ? Math.max((d.ganancia / maxDayIngreso) * 100, 3) : 0;
                                    const shortDate = d.fecha.split('-').slice(1).reverse().join('/');
                                    return (
                                        <div
                                            key={d.fecha}
                                            title={`${shortDate} (${DIAS_SEMANA[d.dia_semana]}): ${fmt(d.ingresos)} vendidos · Ganancia: ${fmt(d.ganancia)} · ${d.cantidad_ventas} tickets`}
                                            style={{
                                                flex: '1 1 0',
                                                height: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'flex-end',
                                                alignItems: 'center',
                                                gap: '4px',
                                            }}
                                        >
                                            <div style={{
                                                width: '100%',
                                                height: `${pctIngreso}%`,
                                                backgroundColor: 'rgba(45, 122, 95, 0.35)',
                                                border: '1px solid var(--primary)',
                                                borderRadius: '4px 4px 0 0',
                                                position: 'relative',
                                                display: 'flex',
                                                alignItems: 'flex-end',
                                            }}>
                                                <div style={{
                                                    width: '100%',
                                                    height: `${Math.min(100, (pctGanancia / pctIngreso) * 100)}%`,
                                                    backgroundColor: 'var(--primary)',
                                                    borderRadius: '2px 2px 0 0',
                                                }} />
                                            </div>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                {shortDate}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-secondary)', justifyContent: 'flex-end' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '10px', height: '10px', backgroundColor: 'rgba(45, 122, 95, 0.35)', border: '1px solid var(--primary)', borderRadius: '2px', display: 'inline-block' }} />
                                    Facturación total
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '10px', height: '10px', backgroundColor: 'var(--primary)', borderRadius: '2px', display: 'inline-block' }} />
                                    Ganancia limpia
                                </span>
                            </div>
                        </div>
                    )}
                </Card>

                <Card title="¿Qué día de la semana se vende más? (Promedio)" icon={<TrendingUp size={15} />}>
                    {porDia.length === 0 ? (
                        <Empty />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                            {weekdayStats.map(w => {
                                const pct = w.avgIngresos > 0 ? Math.max((w.avgIngresos / maxWeekdayAvg) * 100, 4) : 0;
                                return (
                                    <div key={w.dow}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: 600 }}>
                                                {w.label}
                                                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '6px', fontSize: '0.75rem' }}>
                                                    ({w.totalVentasDow} tickets)
                                                </span>
                                            </span>
                                            <span style={{ fontWeight: 700, color: w.avgIngresos === maxWeekdayAvg && w.avgIngresos > 0 ? 'var(--primary-light)' : 'var(--text-primary)' }}>
                                                {fmt(w.avgIngresos)}/día
                                            </span>
                                        </div>
                                        <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${pct}%`,
                                                backgroundColor: w.avgIngresos === maxWeekdayAvg && w.avgIngresos > 0 ? 'var(--primary-light)' : 'var(--primary)',
                                                borderRadius: '3px',
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>

            {/* Fila 3: Ranking de Productos (con filtro Ganancia / Unidades / Facturación) + Categorías */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <Card
                    title="Top 10 Productos Estrella"
                    icon={<Award size={15} />}
                    rightElement={
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {([
                                { key: 'ganancia', label: 'Mayor Ganancia $' },
                                { key: 'cantidad', label: 'Más Unidades' },
                                { key: 'ingresos', label: 'Mayor Caja $' },
                            ] as { key: TopSort; label: string }[]).map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setTopSort(tab.key)}
                                    style={{
                                        padding: '4px 9px',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: topSort === tab.key ? 'var(--primary)' : 'var(--bg-main)',
                                        color: topSort === tab.key ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${topSort === tab.key ? 'var(--primary)' : 'var(--border)'}`,
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    }
                >
                    {sortedTop.length === 0 ? (
                        <Empty />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {sortedTop.map((p, i) => {
                                const metricVal =
                                    topSort === 'ganancia' ? (p.ganancia_total || 0) :
                                    topSort === 'ingresos' ? (p.ingresos_total || 0) :
                                    (p.cantidad_total || 0);
                                const pct = Math.max((metricVal / maxTopMetric) * 100, 4);
                                const margenProd = p.ingresos_total > 0
                                    ? Math.round((p.ganancia_total / p.ingresos_total) * 100)
                                    : 0;

                                return (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.84rem' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '52%' }}>
                                                <span style={{ color: 'var(--text-secondary)', marginRight: '6px', fontFamily: 'monospace' }}>#{i + 1}</span>
                                                <strong>{p.nombre}</strong>
                                            </span>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.78rem', flexShrink: 0 }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                    {fmtCant(p.cantidad_total)} {p.es_por_kilo ? 'kg' : 'uds'}
                                                </span>
                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                    Venta: {fmt(p.ingresos_total)}
                                                </span>
                                                <span style={{ fontWeight: 700, color: 'var(--success-light)' }}>
                                                    +{fmt(p.ganancia_total)} ({margenProd}%)
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${pct}%`,
                                                backgroundColor: 'var(--primary)',
                                                borderRadius: '3px',
                                                transition: 'width 0.3s ease',
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <Card title="Rentabilidad por Categoría" icon={<Tag size={15} />}>
                        {categorias.length === 0 ? (
                            <Empty />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {categorias.map((c, i) => {
                                    const sharePct = totalCatIngresos > 0 ? Math.round((c.ingresos / totalCatIngresos) * 100) : 0;
                                    const margenCat = c.ingresos > 0 ? Math.round((c.ganancia / c.ingresos) * 100) : 0;
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.84rem' }}>
                                                <span style={{ fontWeight: 600 }}>
                                                    {c.categoria}
                                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '6px', fontSize: '0.76rem' }}>
                                                        ({sharePct}% del total)
                                                    </span>
                                                </span>
                                                <span style={{ fontSize: '0.8rem' }}>
                                                    <strong>{fmt(c.ingresos)}</strong>
                                                    <span style={{ color: 'var(--success-light)', marginLeft: '8px', fontWeight: 600 }}>
                                                        Gan: {fmt(c.ganancia)} ({margenCat}%)
                                                    </span>
                                                </span>
                                            </div>
                                            <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${(c.ingresos / maxCat) * 100}%`,
                                                    backgroundColor: 'var(--accent)',
                                                    borderRadius: '3px',
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Card title="Desglose por Medio de Pago" icon={<CreditCard size={15} />}>
                        {metodoPago.length === 0 ? (
                            <Empty />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {metodoPago.map((m, i) => {
                                    const pctMonto = totalMetodoMonto ? Math.round((m.monto_total / totalMetodoMonto) * 100) : 0;
                                    const pctCant  = totalMetodoCant ? Math.round((m.cantidad / totalMetodoCant) * 100) : 0;
                                    const ticketMedio = m.cantidad > 0 ? m.monto_total / m.cantidad : 0;
                                    const color = METODO_COLORS[m.metodo_pago.toUpperCase()] ?? '#6e7571';
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.86rem' }}>
                                                <span style={{ fontWeight: 600 }}>
                                                    {METODO_LABELS[m.metodo_pago.toUpperCase()] ?? m.metodo_pago}
                                                </span>
                                                <span style={{ fontWeight: 700 }}>
                                                    {fmt(m.monto_total)} ({pctMonto}%)
                                                </span>
                                            </div>
                                            <div style={{ height: '7px', borderRadius: '4px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${pctMonto}%`,
                                                    backgroundColor: color,
                                                    borderRadius: '4px',
                                                }} />
                                            </div>
                                            <div style={{ marginTop: '3px', fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{m.cantidad} operaciones ({pctCant}% de los tickets)</span>
                                                <span>Ticket prom: {fmt(ticketMedio)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Fila 4: Horario Pico + Distribución por Turno */}
            <Card
                title="Movimiento por Hora y Turnos del Día"
                icon={<Clock size={15} />}
                style={{ marginBottom: '20px' }}
                rightInfo={bestHour ? `Hora Pico: ${bestHour.hora}:00 hs (${bestHour.cantidad_ventas} ventas · ${fmt(bestHour.monto_total)})` : undefined}
            >
                {horaPico.length === 0 ? (
                    <Empty />
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '84px' }}>
                                {Array.from({ length: 24 }, (_, h) => {
                                    const data = horaPico.find(x => x.hora === h);
                                    const pct = data ? Math.max((data.cantidad_ventas / maxHora) * 100, 8) : 0;
                                    const isPeak = bestHour && bestHour.hora === h;
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
                                                backgroundColor: isPeak ? 'var(--accent)' : data ? 'var(--primary)' : 'var(--border)',
                                                borderRadius: '3px 3px 0 0',
                                                opacity: data ? 1 : 0.25,
                                                cursor: data ? 'pointer' : 'default',
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

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
                            {turnos.map((t, idx) => {
                                const pct = Math.round((t.ventas / totalTurnosVentas) * 100);
                                return (
                                    <div key={idx} style={{
                                        padding: '8px 12px',
                                        backgroundColor: 'var(--bg-main)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '0.82rem',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{t.label}</div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                                {t.ventas} ventas ({pct}%)
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 700, color: 'var(--primary-light)' }}>
                                            {fmt(t.monto)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </Card>

            {/* Fila 5: Reposición Prioritaria (Bajo Stock con rotación) + Menos vendidos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <Card
                    title={`Reposición Prioritaria (Stock ≤ 5) — ${bajoStock.length} productos`}
                    icon={<AlertTriangle size={15} color="var(--warning)" />}
                >
                    {bajoStock.length === 0 ? (
                        <div style={{ color: 'var(--success-light)', fontSize: '0.88rem', padding: '12px 0' }}>
                            Todo el inventario tiene buen nivel de stock (más de 5 unidades).
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                            {bajoStock.map((p, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    backgroundColor: p.stock === 0 ? 'rgba(196, 77, 77, 0.12)' : 'var(--bg-main)',
                                    border: `1px solid ${p.stock === 0 ? 'rgba(196, 77, 77, 0.35)' : 'var(--border)'}`,
                                    fontSize: '0.83rem',
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                                            ({p.categoria})
                                        </span>
                                        {(p.vendidos_mes ?? 0) > 0 && (
                                            <div style={{ fontSize: '0.74rem', color: 'var(--primary-light)', marginTop: '2px' }}>
                                                Rotación 30d: {fmtCant(p.vendidos_mes!)} {p.es_por_kilo ? 'kg' : 'uds'} vendidas
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{
                                            color: p.stock === 0 ? 'var(--danger-light)' : 'var(--warning)',
                                            fontWeight: 700,
                                        }}>
                                            {p.stock === 0 ? 'SIN STOCK' : `Quedan ${fmtCant(p.stock)} ${p.es_por_kilo ? 'kg' : 'uds'}`}
                                        </span>
                                        {(p.precio_costo ?? 0) > 0 && (
                                            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                                                Costo u.: {fmt(p.precio_costo!)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <Card title="Productos con Menor Rotación" icon={<TrendingDown size={15} />}>
                    {menosVendidos.length === 0 ? (
                        <Empty />
                    ) : (
                        <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                            {menosVendidos.map((p, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem',
                                }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68%' }}>
                                        {p.nombre}
                                    </span>
                                    <span style={{ color: p.cantidad_total === 0 ? 'var(--danger-light)' : 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>
                                        {p.cantidad_total === 0 ? 'Sin ventas' : `${fmtCant(p.cantidad_total)} ${p.es_por_kilo ? 'kg' : 'uds'}`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

        </div>
    );
}

// ── Sub-componentes ─────────────────────────────────────────────────────────────

function Card({ title, icon, children, style, rightInfo, rightElement }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    style?: React.CSSProperties;
    rightInfo?: string;
    rightElement?: React.ReactNode;
}) {
    return (
        <div className="stat-card" style={{ ...style, gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
                    <h3 style={{
                        margin: 0, fontSize: '0.78rem', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.8px',
                        color: 'var(--text-secondary)',
                    }}>
                        {title}
                    </h3>
                </div>
                {rightInfo && (
                    <span style={{ fontSize: '0.76rem', color: 'var(--primary-light)', fontWeight: 600 }}>
                        {rightInfo}
                    </span>
                )}
                {rightElement}
            </div>
            {children}
        </div>
    );
}

function SummaryCard({ icon, label, value, sub, bg, valueColor }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    bg: string;
    valueColor?: string;
}) {
    return (
        <div className="stat-card" style={{ padding: '18px 20px', gap: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="label" style={{ fontSize: '0.8rem' }}>{label}</span>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '34px', height: '34px', borderRadius: '9px',
                    backgroundColor: bg,
                }}>
                    {icon}
                </div>
            </div>
            <div className="value" style={{ fontSize: '1.45rem', color: valueColor || 'var(--text-primary)' }}>
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {sub}
                </div>
            )}
        </div>
    );
}

function Empty() {
    return (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '18px 0' }}>
            Sin datos registrados para el período seleccionado
        </div>
    );
}
