using System;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using MySqlConnector;
using Newtonsoft.Json.Linq;
using System.Data;
using System.Collections.Generic;

namespace KioscoApp
{
    public partial class MainWindow : Window
    {
        private string[] posiblesConnStrs = {
            "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Emanuel;Port=3306;AllowUserVariables=True",
            "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Gtacinco135;Port=3306;AllowUserVariables=True"  
        };

        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        List<Producto> inventarioCompleto = new List<Producto>();
        private string connStrActiva = "";
        private int sesionIdActiva = 0; 
        private int montoAperturaActual = 0;
        private int totalVenta = 0;

        public MainWindow()
        {
            InitializeComponent();
            dgCarrito.ItemsSource = carrito;
            EstablecerConexionValida();
            VerificarEstadoCaja();

            MainTabs.SelectionChanged += (s, e) =>
            {
                if (MainTabs.SelectedItem is TabItem ti && ti.Header != null)
                {
                    string h = ti.Header.ToString()!;
                    if (h.Contains("INVENTARIO")) CargarInventario();
                    else if (h.Contains("CAJA")) CargarCaja();
                    else if (h.Contains("REPORTES")) CargarReportes();
                }
            };
            Loaded += (s, e) => { txtBarcodeVenta.Focus(); };
        }

        private void EstablecerConexionValida() {
            foreach (string c in posiblesConnStrs) {
                try { 
                    using (MySqlConnection conn = new MySqlConnection(c)) { 
                        conn.Open(); 
                        connStrActiva = c; 
                        return; 
                    } 
                } catch { continue; }
            }
        }

        private MySqlConnection GetConnection() => new MySqlConnection(connStrActiva);

        private void VerificarEstadoCaja() {
            try {
                using (MySqlConnection conn = GetConnection()) {
                    conn.Open();
                    MySqlCommand cmd = new MySqlCommand("SELECT id, monto_inicial FROM sesiones_caja WHERE estado = 'ABIERTA' LIMIT 1", conn);
                    using (var r = cmd.ExecuteReader()) {
                        if (r.Read()) { 
                            sesionIdActiva = r.GetInt32("id"); 
                            montoAperturaActual = Convert.ToInt32(r.GetDecimal("monto_inicial")); 
                            gridApertura.Visibility = Visibility.Collapsed; 
                        }
                        else { gridApertura.Visibility = Visibility.Visible; }
                    }
                }
            } catch { gridApertura.Visibility = Visibility.Visible; }
        }

        private void BtnAbrirCaja_Click(object sender, RoutedEventArgs e) {
            if (int.TryParse(txtMontoInicial.Text, out int m)) {
                try {
                    using (MySqlConnection conn = GetConnection()) {
                        conn.Open();
                        MySqlCommand cmd = new MySqlCommand("INSERT INTO sesiones_caja (monto_inicial, estado) VALUES (@m, 'ABIERTA')", conn);
                        cmd.Parameters.AddWithValue("@m", m);
                        cmd.ExecuteNonQuery();
                        sesionIdActiva = (int)cmd.LastInsertedId;
                        montoAperturaActual = m;
                    }
                    gridApertura.Visibility = Visibility.Collapsed;
                    txtBarcodeVenta.Focus();
                } catch (Exception ex) { MessageBox.Show(ex.Message); }
            }
        }

        private void BtnCerrarCaja_Click(object sender, RoutedEventArgs e) {
            if (MessageBox.Show("¿Seguro que quieres cerrar la caja?", "Cierre", MessageBoxButton.YesNo) == MessageBoxResult.Yes) {
                try {
                    int efec = 0, otros = 0;
                    using (MySqlConnection conn = GetConnection()) {
                        conn.Open();
                        MySqlCommand cmdS = new MySqlCommand("SELECT metodo_pago, SUM(total) as suma FROM ventas WHERE sesion_id = @sid GROUP BY metodo_pago", conn);
                        cmdS.Parameters.AddWithValue("@sid", sesionIdActiva);
                        using (var r = cmdS.ExecuteReader()) {
                            while(r.Read()) {
                                if (r["metodo_pago"].ToString() == "Efectivo") efec = Convert.ToInt32(r.GetDecimal("suma"));
                                else otros += Convert.ToInt32(r.GetDecimal("suma"));
                            }
                        }
                        MySqlCommand cmdC = new MySqlCommand("UPDATE sesiones_caja SET fecha_cierre = NOW(), monto_final_efectivo = @e, monto_final_otros = @o, estado = 'CERRADA' WHERE id = @id", conn);
                        cmdC.Parameters.AddWithValue("@e", efec + montoAperturaActual);
                        cmdC.Parameters.AddWithValue("@o", otros);
                        cmdC.Parameters.AddWithValue("@id", sesionIdActiva);
                        cmdC.ExecuteNonQuery();
                    }
                    VerificarEstadoCaja();
                } catch (Exception ex) { MessageBox.Show(ex.Message); }
            }
        }

        private void CargarCaja() {
            try {
                ObservableCollection<VentaResumen> vs = new ObservableCollection<VentaResumen>();
                int vE = 0, vO = 0;
                using (MySqlConnection conn = GetConnection()) {
                    conn.Open();
                    MySqlCommand cmd = new MySqlCommand(@"SELECT v.fecha, v.metodo_pago, v.total, GROUP_CONCAT(vd.nombre SEPARATOR ', ') as det 
                        FROM ventas v LEFT JOIN venta_detalles vd ON v.id = vd.venta_id WHERE v.sesion_id = @sid GROUP BY v.id ORDER BY v.fecha DESC", conn);
                    cmd.Parameters.AddWithValue("@sid", sesionIdActiva);
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            var v = new VentaResumen { 
                                Fecha = Convert.ToDateTime(r["fecha"]), 
                                MetodoPago = r["metodo_pago"].ToString()!, 
                                Total = Convert.ToInt32(r.GetDecimal("total")), 
                                DetalleTexto = r["det"]?.ToString() ?? "" 
                            };
                            vs.Add(v); 
                            if (v.MetodoPago == "Efectivo") vE += v.Total; else vO += v.Total;
                        }
                    }
                }
                dgHistorialVentas.ItemsSource = vs;
                // Forzamos el símbolo de peso en el código por si la región está en España
                lblCajaEfectivo.Text = "$ " + (montoAperturaActual + vE).ToString("#,##0");
                lblCajaOtros.Text = "$ " + vO.ToString("#,##0");
                lblCajaTotal.Text = "$ " + (vE + vO).ToString("#,##0");
            } catch { }
        }

        private void CargarReportes() {
            try {
                ObservableCollection<SesionCaja> ses = new ObservableCollection<SesionCaja>();
                int acc = 0;
                using (MySqlConnection conn = GetConnection()) {
                    conn.Open();
                    MySqlCommand cmd = new MySqlCommand("SELECT * FROM sesiones_caja WHERE estado = 'CERRADA' ORDER BY fecha_cierre DESC", conn);
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            var s = new SesionCaja { 
                                FechaCierre = Convert.ToDateTime(r["fecha_cierre"]), 
                                MontoFinalEfectivo = Convert.ToInt32(r.GetDecimal("monto_final_efectivo")), 
                                MontoFinalOtros = Convert.ToInt32(r.GetDecimal("monto_final_otros")) 
                            };
                            ses.Add(s); acc += s.TotalDia;
                        }
                    }
                }
                dgHistorialCierres.ItemsSource = ses;
                lblRecaudacionTotalHistorica.Text = "$ " + acc.ToString("#,##0");
            } catch { }
        }

        private void FinalizarVenta() {
            string m = (cbMetodoPago.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Efectivo";
            using (MySqlConnection conn = GetConnection()) {
                conn.Open();
                using (MySqlTransaction t = conn.BeginTransaction()) {
                    try {
                        MySqlCommand cV = new MySqlCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id) VALUES (@t, @c, @m, @sid)", conn, t);
                        cV.Parameters.AddWithValue("@t", totalVenta); 
                        cV.Parameters.AddWithValue("@c", carrito.Count); 
                        cV.Parameters.AddWithValue("@m", m); 
                        cV.Parameters.AddWithValue("@sid", sesionIdActiva);
                        cV.ExecuteNonQuery(); 
                        long idVenta = cV.LastInsertedId;

                        foreach (var p in carrito) {
                            MySqlCommand cD = new MySqlCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @p, 1, @p)", conn, t);
                            cD.Parameters.AddWithValue("@id", idVenta); 
                            cD.Parameters.AddWithValue("@n", p.Nombre); 
                            cD.Parameters.AddWithValue("@p", p.Precio); 
                            cD.ExecuteNonQuery();

                            MySqlCommand cU = new MySqlCommand("UPDATE productos SET stock = stock - 1 WHERE id = @pid", conn, t);
                            cU.Parameters.AddWithValue("@pid", p.Id);
                            cU.ExecuteNonQuery();
                        }
                        t.Commit(); 
                        carrito.Clear(); CalcularTotal(); 
                        gridCobro.Visibility = Visibility.Collapsed; 
                        txtBarcodeVenta.Focus();
                    } catch (Exception ex) { t.Rollback(); MessageBox.Show(ex.Message); }
                }
            }
        }

        private void CargarInventario() {
            try {
                inventarioCompleto.Clear();
                using (MySqlConnection conn = GetConnection()) {
                    conn.Open();
                    MySqlCommand cmd = new MySqlCommand("SELECT p.id, p.codigo_barras, p.nombre, p.precio, p.stock FROM productos p", conn);
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            inventarioCompleto.Add(new Producto { 
                                Id = r.GetInt32("id"), 
                                CodigoBarras = r["codigo_barras"].ToString()!, 
                                Nombre = r["nombre"].ToString()!, 
                                Precio = Convert.ToInt32(r.GetDecimal("precio")), 
                                Stock = Convert.ToInt32(r.GetDecimal("stock")) 
                            });
                        }
                    }
                }
                dgInventario.ItemsSource = new ObservableCollection<Producto>(inventarioCompleto);
            } catch { }
        }

        private void DgInventario_CellEditEnding(object sender, DataGridCellEditEndingEventArgs e) {
            if (e.EditAction == DataGridEditAction.Commit) {
                var p = e.Row.Item as Producto;
                if (p != null) {
                    Dispatcher.BeginInvoke(new Action(() => {
                        try {
                            using (MySqlConnection conn = GetConnection()) {
                                conn.Open();
                                MySqlCommand cmd = new MySqlCommand("UPDATE productos SET precio = @p, stock = @s WHERE id = @id", conn);
                                cmd.Parameters.AddWithValue("@p", p.Precio); 
                                cmd.Parameters.AddWithValue("@s", p.Stock); 
                                cmd.Parameters.AddWithValue("@id", p.Id);
                                cmd.ExecuteNonQuery();
                            }
                        } catch (Exception ex) { 
                            MessageBox.Show("Error al guardar: " + ex.Message); 
                            CargarInventario(); 
                        }
                    }), System.Windows.Threading.DispatcherPriority.Background);
                }
            }
        }

        private void TxtBuscarInventario_TextChanged(object sender, TextChangedEventArgs e) {
            string f = txtBuscarInventario.Text.ToLower();
            var filtrados = string.IsNullOrEmpty(f) ? inventarioCompleto : inventarioCompleto.Where(x => x.Nombre.ToLower().Contains(f) || x.CodigoBarras.Contains(f)).ToList();
            dgInventario.ItemsSource = new ObservableCollection<Producto>(filtrados);
        }

        private void CalcularTotal() { 
            totalVenta = carrito.Sum(p => p.Precio); 
            lblTotal.Text = "$ " + totalVenta.ToString("#,##0"); 
            lblItemCount.Text = carrito.Count.ToString(); 
        }

        private void AgregarAlCarrito(Producto pBase) { 
            carrito.Add(new Producto { Id = pBase.Id, Nombre = pBase.Nombre, Precio = pBase.Precio }); 
            CalcularTotal(); 
        }

        private void BuscarYAgregar(string b) { 
            try { 
                using (MySqlConnection conn = GetConnection()) { 
                    MySqlCommand cmd = new MySqlCommand("SELECT id, nombre, precio FROM productos WHERE codigo_barras = @c", conn); 
                    cmd.Parameters.AddWithValue("@c", b); 
                    conn.Open(); 
                    using (var r = cmd.ExecuteReader()) { 
                        if (r.Read()) {
                            AgregarAlCarrito(new Producto { 
                                Id = r.GetInt32("id"), 
                                Nombre = r["nombre"].ToString()!, 
                                Precio = Convert.ToInt32(r.GetDecimal("precio")) 
                            });
                        } else { MessageBox.Show("No existe"); } 
                    } 
                } 
            } catch { } 
        }

        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e) { 
            if (e.Key == Key.Enter) { 
                string b = txtBarcodeVenta.Text.Trim(); 
                if (string.IsNullOrEmpty(b) && carrito.Count > 0) AbrirPanelCobro(); 
                else if (!string.IsNullOrEmpty(b)) { BuscarYAgregar(b); txtBarcodeVenta.Clear(); } 
            } 
        }

        private void TxtBarcodeVenta_TextChanged(object sender, TextChangedEventArgs e) { 
            string q = txtBarcodeVenta.Text.Trim(); 
            if (q.Length < 2) { lstSuggestions.Visibility = Visibility.Collapsed; return; }
            try { 
                using (MySqlConnection conn = GetConnection()) { 
                    MySqlCommand cmd = new MySqlCommand("SELECT id, nombre, precio FROM productos WHERE nombre LIKE @q LIMIT 5", conn); 
                    cmd.Parameters.AddWithValue("@q", "%"+q+"%"); 
                    conn.Open(); 
                    var s = new ObservableCollection<Producto>(); 
                    using (var r = cmd.ExecuteReader()) { 
                        while (r.Read()) s.Add(new Producto { 
                            Id = r.GetInt32("id"), 
                            Nombre = r["nombre"].ToString()!, 
                            Precio = Convert.ToInt32(r.GetDecimal("precio")) 
                        }); 
                    } 
                    lstSuggestions.ItemsSource = s; 
                    lstSuggestions.Visibility = s.Count > 0 ? Visibility.Visible : Visibility.Collapsed; 
                } 
            } catch { }
        }

        private void LstSuggestions_SelectionChanged(object sender, SelectionChangedEventArgs e) { 
            if (lstSuggestions.SelectedItem is Producto p) { 
                AgregarAlCarrito(p); 
                txtBarcodeVenta.Clear(); 
                lstSuggestions.Visibility = Visibility.Collapsed; 
                txtBarcodeVenta.Focus(); 
            } 
        }

        private void BtnQuitar_Click(object sender, RoutedEventArgs e) { if (dgCarrito.SelectedItem is Producto p) { carrito.Remove(p); CalcularTotal(); } }
        private void AbrirPanelCobro() { lblTotalCobro.Text = "$ " + totalVenta.ToString("#,##0"); gridCobro.Visibility = Visibility.Visible; txtPagaCon.Focus(); }
        private void TxtPagaCon_TextChanged(object sender, TextChangedEventArgs e) { if (int.TryParse(txtPagaCon.Text, out int p)) lblVuelto.Text = "$ " + (p - totalVenta).ToString("#,##0"); }
        private void TxtPagaCon_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) FinalizarVenta(); }
        private void BtnConfirmarVenta_Click(object sender, RoutedEventArgs e) => FinalizarVenta();
        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) { gridCobro.Visibility = Visibility.Collapsed; txtBarcodeVenta.Focus(); }
        private void GridCobro_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Escape) { gridCobro.Visibility = Visibility.Collapsed; txtBarcodeVenta.Focus(); } }
        
        private async void TxtCargaBarcode_LostFocus(object sender, RoutedEventArgs e) { 
            try { 
                string b = txtCargaBarcode.Text.Trim(); 
                if (b.Length > 5) { 
                    using (HttpClient client = new HttpClient()) {
                        string r = await client.GetStringAsync($"https://world.openfoodfacts.org/api/v0/product/{b}.json"); 
                        var j = JObject.Parse(r); 
                        if (j["status"]?.ToString() == "1") 
                            txtCargaNombre.Text = j["product"]?["product_name"]?.ToString() ?? ""; 
                    }
                } 
            } catch { } 
        }

        private void BtnGuardar_Click(object sender, RoutedEventArgs e) {
            try { 
                using (MySqlConnection conn = GetConnection()) { 
                    conn.Open(); 
                    MySqlCommand cmd = new MySqlCommand("INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES (@c, @n, @p, @s) ON DUPLICATE KEY UPDATE precio=@p, stock=stock+@s", conn); 
                    cmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text); 
                    cmd.Parameters.AddWithValue("@n", txtCargaNombre.Text); 
                    cmd.Parameters.AddWithValue("@p", int.Parse(txtCargaPrecio.Text)); 
                    cmd.Parameters.AddWithValue("@s", int.Parse(txtCargaStock.Text)); 
                    cmd.ExecuteNonQuery(); 
                    MessageBox.Show("Guardado"); 
                } 
            } catch (Exception ex) { MessageBox.Show(ex.Message); }
        }

        private void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) txtCargaNombre.Focus(); }
        private void BtnManualOpen_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Visible;
        private void BtnManualCancel_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Collapsed;
        private void BtnManualConfirm_Click(object sender, RoutedEventArgs e) { 
            if (int.TryParse(txtManualPrecio.Text, out int p)) { 
                AgregarAlCarrito(new Producto { Nombre = txtManualNombre.Text, Precio = p }); 
                gridManual.Visibility = Visibility.Collapsed; 
                txtBarcodeVenta.Focus(); 
            } 
        }
    }

    public class Producto { 
        public int Id { get; set; } 
        public string CodigoBarras { get; set; } = ""; 
        public string Nombre { get; set; } = ""; 
        public int Precio { get; set; } 
        public int Stock { get; set; } 
        public string Categoria { get; set; } = ""; 
    }
    
    public class VentaResumen { 
        public DateTime Fecha { get; set; } 
        public string MetodoPago { get; set; } = ""; 
        public int Total { get; set; } 
        public string DetalleTexto { get; set; } = ""; 
    }
    
    public class SesionCaja { 
        public DateTime FechaCierre { get; set; } 
        public int MontoFinalEfectivo { get; set; } 
        public int MontoFinalOtros { get; set; } 
        public int TotalDia => MontoFinalEfectivo + MontoFinalOtros; 
    }
}