using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Net.Http;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using Microsoft.Data.Sqlite;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Globalization;

namespace KioscoApp
{
    public partial class MainWindow : Window
    {
        // Conexión a SQLite (archivo local)
        private string connStrActiva = $"Data Source={Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "KioscoApp", "kiosco.db")}";

        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        List<Producto> inventarioCompleto = new List<Producto>();
        private int sesionIdActiva = 0; 
        private decimal montoAperturaActual = 0;
        private decimal totalVenta = 0;

        public MainWindow()
        {
            Thread.CurrentThread.CurrentCulture = new CultureInfo("es-AR");
            Thread.CurrentThread.CurrentUICulture = new CultureInfo("es-AR");

            InitializeComponent();
            dgCarrito.ItemsSource = carrito;
            InicializarBaseDatos();
            VerificarEstadoCaja();
            CargarCategorias();

            MainTabs.SelectionChanged += (s, e) => {
                if (MainTabs.SelectedItem is TabItem ti) {
                    string h = ti.Header.ToString()!;
                    if (h.Contains("INVENTARIO")) CargarInventario();
                    else if (h.Contains("CAJA")) CargarCaja();
                    else if (h.Contains("REPORTES")) CargarReportes();
                }
            };
        }

        private void InicializarBaseDatos()
        {
            // Crear la carpeta si no existe
            string dbDir = Path.GetDirectoryName(connStrActiva.Replace("Data Source=", ""));
            if (!Directory.Exists(dbDir)) Directory.CreateDirectory(dbDir);

            // Ejecutar el script SQL para crear tablas
            using (SqliteConnection conn = new SqliteConnection(connStrActiva))
            {
                conn.Open();
                string sql = File.ReadAllText("database_sqlite.sql");
                using (SqliteCommand cmd = new SqliteCommand(sql, conn))
                {
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private SqliteConnection GetConnection() => new SqliteConnection(connStrActiva);

        private void VerificarEstadoCaja() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT id, monto_inicial FROM sesiones_caja WHERE estado = 'ABIERTA' LIMIT 1", conn);
                    using (var r = cmd.ExecuteReader()) {
                        if (r.Read()) { 
                            sesionIdActiva = r.GetInt32(0); 
                            montoAperturaActual = r.GetDecimal(1); 
                            lblCajaEfectivo.Text = montoAperturaActual.ToString("C");
                            gridApertura.Visibility = Visibility.Collapsed; 
                        } else { gridApertura.Visibility = Visibility.Visible; }
                    }
                }
            } catch { gridApertura.Visibility = Visibility.Visible; }
        }

        private void CargarCategorias() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT id, nombre FROM categorias ORDER BY nombre", conn);
                    var cats = new List<object>();
                    var seen = new HashSet<string>();
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            string nombre = r.GetString(1);
                            if (!seen.Contains(nombre)) {
                                seen.Add(nombre);
                                cats.Add(new { Id = r.GetInt32(0), Nombre = nombre });
                            }
                        }
                    }
                    cbCargaCategoria.ItemsSource = cats;
                }
            } catch { }
        }

        private void FinalizarVenta() {
            if (carrito.Count == 0) return;
            string m = (cbMetodoPago.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Efectivo";
            using (SqliteConnection conn = GetConnection()) {
                conn.Open();
                using (SqliteTransaction t = conn.BeginTransaction()) {
                    try {
                        SqliteCommand cV = new SqliteCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id) VALUES (@t, @c, @m, @sid); SELECT last_insert_rowid();", conn, t);
                        cV.Parameters.AddWithValue("@t", totalVenta); 
                        cV.Parameters.AddWithValue("@c", carrito.Count); 
                        cV.Parameters.AddWithValue("@m", m); 
                        cV.Parameters.AddWithValue("@sid", sesionIdActiva);
                        long idVenta = (long)cV.ExecuteScalar();

                        foreach (var p in carrito) {
                            SqliteCommand cD = new SqliteCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @p, 1, @p)", conn, t);
                            cD.Parameters.AddWithValue("@id", idVenta); 
                            cD.Parameters.AddWithValue("@n", p.Nombre); 
                            cD.Parameters.AddWithValue("@p", p.Precio); 
                            cD.ExecuteNonQuery();

                            if (p.Id > 0) {
                                SqliteCommand cU = new SqliteCommand("UPDATE productos SET stock = stock - 1 WHERE id = @pid", conn, t);
                                cU.Parameters.AddWithValue("@pid", p.Id);
                                cU.ExecuteNonQuery();
                            }
                        }
                        t.Commit(); 
                        carrito.Clear(); CalcularTotal(); 
                        gridCobro.Visibility = Visibility.Collapsed; 
                        txtBarcodeVenta.Clear(); txtBarcodeVenta.Focus();
                        // Actualizar labels de caja
                        CargarCaja();
                    } catch (Exception ex) { t.Rollback(); MessageBox.Show(ex.Message); }
                }
            }
        }

        private void CalcularTotal() { 
            totalVenta = carrito.Sum(p => p.Precio); 
            lblTotal.Text = totalVenta.ToString("C2"); 
            lblItemCount.Text = carrito.Count.ToString(); 
        }

        private void BuscarYAgregar(string b) { 
            try { 
                using (SqliteConnection conn = GetConnection()) { 
                    SqliteCommand cmd = new SqliteCommand("SELECT id, nombre, precio FROM productos WHERE codigo_barras = @c", conn); 
                    cmd.Parameters.AddWithValue("@c", b); 
                    conn.Open(); 
                    using (var r = cmd.ExecuteReader()) { 
                        if (r.Read()) {
                            carrito.Add(new Producto { Id = r.GetInt32(0), Nombre = r.GetString(1), Precio = r.GetDecimal(2) });
                            CalcularTotal();
                        } else { MessageBox.Show("Producto no registrado."); } 
                    } 
                } 
            } catch { } 
        }

        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e) { 
            if (e.Key == Key.Enter) { 
                if (lstSuggestions.Visibility == Visibility.Visible && lstSuggestions.Items.Count > 0) {
                    // Seleccionar la primera sugerencia (esto dispara SelectionChanged automáticamente)
                    lstSuggestions.SelectedIndex = 0;
                    e.Handled = true;
                } else {
                    string b = txtBarcodeVenta.Text.Trim(); 
                    if (string.IsNullOrEmpty(b) && carrito.Count > 0) { AbrirPanelCobro(); } 
                    else if (!string.IsNullOrEmpty(b)) { BuscarYAgregar(b); txtBarcodeVenta.Clear(); }
                }
            } 
        }

        private void BtnGuardar_Click(object sender, RoutedEventArgs e) {
            try { 
                using (SqliteConnection conn = GetConnection()) { 
                    conn.Open(); 
                    // Verificar si existe
                    SqliteCommand checkCmd = new SqliteCommand("SELECT stock FROM productos WHERE codigo_barras = @c", conn);
                    checkCmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text);
                    var existingStock = checkCmd.ExecuteScalar();
                    if (existingStock != null) {
                        // Actualizar
                        SqliteCommand updateCmd = new SqliteCommand("UPDATE productos SET nombre = @n, precio = @p, stock = stock + @s, categoria_id = @cat WHERE codigo_barras = @c", conn);
                        updateCmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text); 
                        updateCmd.Parameters.AddWithValue("@n", txtCargaNombre.Text); 
                        updateCmd.Parameters.AddWithValue("@p", decimal.Parse(txtCargaPrecio.Text)); 
                        updateCmd.Parameters.AddWithValue("@s", decimal.Parse(txtCargaStock.Text)); 
                        updateCmd.Parameters.AddWithValue("@cat", cbCargaCategoria.SelectedValue ?? 1);
                        updateCmd.ExecuteNonQuery();
                    } else {
                        // Insertar
                        SqliteCommand insertCmd = new SqliteCommand("INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES (@c, @n, @p, @s, @cat)", conn);
                        insertCmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text); 
                        insertCmd.Parameters.AddWithValue("@n", txtCargaNombre.Text); 
                        insertCmd.Parameters.AddWithValue("@p", decimal.Parse(txtCargaPrecio.Text)); 
                        insertCmd.Parameters.AddWithValue("@s", decimal.Parse(txtCargaStock.Text)); 
                        insertCmd.Parameters.AddWithValue("@cat", cbCargaCategoria.SelectedValue ?? 1);
                        insertCmd.ExecuteNonQuery();
                    }
                    MessageBox.Show("Producto Guardado."); 
                } 
            } catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
        }

        private void AbrirPanelCobro() { 
            lblTotalCobro.Text = totalVenta.ToString("C2"); 
            txtPagaCon.Clear();
            lblVuelto.Text = "$ 0.00";
            gridCobro.Visibility = Visibility.Visible; 
            txtPagaCon.Focus(); 
        }

        private void TxtPagaCon_TextChanged(object sender, TextChangedEventArgs e) { 
            if (decimal.TryParse(txtPagaCon.Text, out decimal p)) 
                lblVuelto.Text = (p - totalVenta).ToString("C2"); 
        }

        private void BtnAbrirCaja_Click(object sender, RoutedEventArgs e) {
            if (decimal.TryParse(txtMontoInicial.Text, out decimal m)) {
                try {
                    using (SqliteConnection conn = GetConnection()) {
                        conn.Open();
                        SqliteCommand cmd = new SqliteCommand("INSERT INTO sesiones_caja (monto_inicial, estado) VALUES (@m, 'ABIERTA'); SELECT last_insert_rowid();", conn);
                        cmd.Parameters.AddWithValue("@m", m);
                        sesionIdActiva = (int)(long)cmd.ExecuteScalar();
                        montoAperturaActual = m;
                        lblCajaEfectivo.Text = m.ToString("C");
                        lblCajaTotal.Text = "$ 0";
                        lblCajaOtros.Text = "$ 0";
                    }
                    gridApertura.Visibility = Visibility.Collapsed;
                } catch (Exception ex) { MessageBox.Show(ex.Message); }
            }
        }

        // --- Eventos faltantes para que no de error ---
        private void BtnManualOpen_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Visible;
        private void BtnManualCancel_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Collapsed;
        private void BtnManualConfirm_Click(object sender, RoutedEventArgs e) {
            if (decimal.TryParse(txtManualPrecio.Text, out decimal p)) {
                carrito.Add(new Producto { Nombre = txtManualNombre.Text, Precio = p });
                CalcularTotal();
                gridManual.Visibility = Visibility.Collapsed;
            }
        }
        private void BtnQuitar_Click(object sender, RoutedEventArgs e) { if (dgCarrito.SelectedItem is Producto p) { carrito.Remove(p); CalcularTotal(); } }
        private void BtnConfirmarVenta_Click(object sender, RoutedEventArgs e) => FinalizarVenta();
        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) => gridCobro.Visibility = Visibility.Collapsed;
        private void TxtPagaCon_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) FinalizarVenta(); }
        private void GridCobro_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Escape) gridCobro.Visibility = Visibility.Collapsed; }
        private void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) txtCargaNombre.Focus(); }
        private async void TxtCargaBarcode_LostFocus(object sender, RoutedEventArgs e) { /* Lógica API OpenFoodFacts */ }
        private void TxtBuscarInventario_TextChanged(object sender, TextChangedEventArgs e) {
            string filtro = txtBuscarInventario.Text.ToLower();
            var filtrado = inventarioCompleto.Where(p => p.Nombre.ToLower().Contains(filtro) || p.CodigoBarras.Contains(filtro)).ToList();
            dgInventario.ItemsSource = filtrado;
        }
        private void DgInventario_CellEditEnding(object sender, DataGridCellEditEndingEventArgs e) { /* Update DB */ }
        private void DgInventario_KeyDown(object sender, KeyEventArgs e) { }
        private void DataGrid_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e) { }
        private void BtnCerrarCaja_Click(object sender, RoutedEventArgs e) {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    // Calcular totales de ventas
                    SqliteCommand cmdVentas = new SqliteCommand("SELECT SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END) as efectivo, SUM(CASE WHEN metodo_pago != 'Efectivo' THEN total ELSE 0 END) as otros FROM ventas WHERE sesion_id = @sid", conn);
                    cmdVentas.Parameters.AddWithValue("@sid", sesionIdActiva);
                    decimal efectivo = 0, otros = 0;
                    using (var r = cmdVentas.ExecuteReader()) {
                        if (r.Read()) {
                            efectivo = r.IsDBNull(0) ? 0 : r.GetDecimal(0);
                            otros = r.IsDBNull(1) ? 0 : r.GetDecimal(1);
                        }
                    }
                    // Cerrar sesión
                    SqliteCommand cmdCerrar = new SqliteCommand("UPDATE sesiones_caja SET estado = 'CERRADA', fecha_cierre = CURRENT_TIMESTAMP, monto_final_efectivo = @ef, monto_final_otros = @ot WHERE id = @id", conn);
                    cmdCerrar.Parameters.AddWithValue("@ef", montoAperturaActual + efectivo);
                    cmdCerrar.Parameters.AddWithValue("@ot", otros);
                    cmdCerrar.Parameters.AddWithValue("@id", sesionIdActiva);
                    cmdCerrar.ExecuteNonQuery();
                }
                sesionIdActiva = 0;
                gridApertura.Visibility = Visibility.Visible;
                lblCajaEfectivo.Text = "$ 0";
                lblCajaTotal.Text = "$ 0";
                dgHistorialVentas.ItemsSource = null;
            } catch (Exception ex) { MessageBox.Show(ex.Message); }
        }
        private void CargarInventario() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT p.id, p.codigo_barras, p.nombre, COALESCE(c.nombre, 'Sin Categoría') as categoria, p.precio, p.stock FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id", conn);
                    using (var r = cmd.ExecuteReader()) {
                        inventarioCompleto.Clear();
                        while (r.Read()) {
                            inventarioCompleto.Add(new Producto {
                                Id = r.GetInt32(0),
                                CodigoBarras = r.GetString(1),
                                Nombre = r.GetString(2),
                                Categoria = r.GetString(3),
                                Precio = r.GetDecimal(4),
                                Stock = r.GetDecimal(5)
                            });
                        }
                    }
                    dgInventario.ItemsSource = inventarioCompleto;
                }
            } catch { }
        }
        private void CargarCaja() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    // Calcular totales de ventas
                    SqliteCommand cmdVentas = new SqliteCommand("SELECT SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END) as efectivo, SUM(CASE WHEN metodo_pago != 'Efectivo' THEN total ELSE 0 END) as otros FROM ventas WHERE sesion_id = @sid", conn);
                    cmdVentas.Parameters.AddWithValue("@sid", sesionIdActiva);
                    decimal efectivo = 0, otros = 0;
                    using (var r = cmdVentas.ExecuteReader()) {
                        if (r.Read()) {
                            efectivo = r.IsDBNull(0) ? 0 : r.GetDecimal(0);
                            otros = r.IsDBNull(1) ? 0 : r.GetDecimal(1);
                        }
                    }
                    lblCajaEfectivo.Text = (montoAperturaActual + efectivo).ToString("C");
                    lblCajaOtros.Text = otros.ToString("C");
                    lblCajaTotal.Text = (efectivo + otros).ToString("C");

                    SqliteCommand cmd = new SqliteCommand("SELECT id, total, fecha, metodo_pago FROM ventas WHERE sesion_id = @sid ORDER BY fecha DESC", conn);
                    cmd.Parameters.AddWithValue("@sid", sesionIdActiva);
                    var ventas = new List<dynamic>();
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            ventas.Add(new {
                                Id = r.GetInt32(0),
                                Total = r.GetDecimal(1),
                                Fecha = r.GetDateTime(2),
                                MetodoPago = r.GetString(3),
                                DetalleTexto = "Venta #" + r.GetInt32(0)
                            });
                        }
                    }
                    dgHistorialVentas.ItemsSource = ventas;
                }
            } catch { }
        }
        private void CargarReportes() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT id, fecha_apertura, fecha_cierre, monto_final_efectivo, monto_final_otros FROM sesiones_caja WHERE estado = 'CERRADA' ORDER BY fecha_cierre DESC", conn);
                    var cierres = new List<dynamic>();
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            var efectivo = r.IsDBNull(3) ? 0 : r.GetDecimal(3);
                            var otros = r.IsDBNull(4) ? 0 : r.GetDecimal(4);
                            cierres.Add(new {
                                Id = r.GetInt32(0),
                                FechaCierre = r.GetDateTime(2),
                                MontoFinalEfectivo = efectivo,
                                MontoFinalOtros = otros,
                                TotalDia = efectivo + otros
                            });
                        }
                    }
                    dgHistorialCierres.ItemsSource = cierres;
                    lblRecaudacionTotalHistorica.Text = cierres.Sum(c => (decimal)c.TotalDia).ToString("C");
                }
            } catch { }
        }
        private void LstSuggestions_SelectionChanged(object sender, SelectionChangedEventArgs e) {
            if (lstSuggestions.SelectedItem is Producto p) {
                carrito.Add(p);
                CalcularTotal();
                txtBarcodeVenta.Clear();
                lstSuggestions.Visibility = Visibility.Collapsed;
            }
        }
        private void TxtBarcodeVenta_TextChanged(object sender, TextChangedEventArgs e) {
            string texto = txtBarcodeVenta.Text.Trim();
            if (!string.IsNullOrEmpty(texto) && !long.TryParse(texto, out _)) {
                // Buscar por nombre
                try {
                    using (SqliteConnection conn = GetConnection()) {
                        conn.Open();
                        SqliteCommand cmd = new SqliteCommand("SELECT id, nombre, precio FROM productos WHERE nombre LIKE @n LIMIT 10", conn);
                        cmd.Parameters.AddWithValue("@n", "%" + texto + "%");
                        var sugerencias = new List<Producto>();
                        using (var r = cmd.ExecuteReader()) {
                            while (r.Read()) {
                                sugerencias.Add(new Producto { Id = r.GetInt32(0), Nombre = r.GetString(1), Precio = r.GetDecimal(2) });
                            }
                        }
                        lstSuggestions.ItemsSource = sugerencias;
                        lstSuggestions.Visibility = sugerencias.Any() ? Visibility.Visible : Visibility.Collapsed;
                    }
                } catch { }
            } else {
                lstSuggestions.Visibility = Visibility.Collapsed;
            }
        }
        private void BtnNuevaCategoria_Click(object sender, RoutedEventArgs e) { gridNuevaCategoria.Visibility = Visibility.Visible; }
        private void BtnGuardarNuevaCategoria_Click(object sender, RoutedEventArgs e) {
            // Asumir que hay un TextBox txtNuevaCategoria en XAML
            // Si no, implementar según el XAML
            MessageBox.Show("Funcionalidad no implementada.");
        }
        private void BtnCancelarNuevaCategoria_Click(object sender, RoutedEventArgs e) { gridNuevaCategoria.Visibility = Visibility.Collapsed; }
    }

    public class Producto {
        public int Id { get; set; }
        public string CodigoBarras { get; set; } = "";
        public string Nombre { get; set; } = "";
        public decimal Precio { get; set; }
        public decimal Stock { get; set; }
        public string Categoria { get; set; } = "";
    }
}