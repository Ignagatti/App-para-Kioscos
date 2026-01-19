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

namespace KioscoApp
{
    public partial class MainWindow : Window
    {
        // Lista de posibles cadenas de conexión
        private string[] posiblesConnStrs = {
            "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Emanuel;Port=3306;AllowUserVariables=True",
            "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Gtacinco135;Port=3306;AllowUserVariables=True"
        };

        private string connStrActiva = "";
        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        decimal totalVenta = 0;

        public MainWindow()
        {
            InitializeComponent();
            dgCarrito.ItemsSource = carrito;

            // Intentar establecer la conexión válida al arrancar
            EstablecerConexionValida();

            MainTabs.SelectionChanged += (s, e) =>
            {
                if (MainTabs.SelectedItem is TabItem ti && ti.Header != null && ti.Header.ToString()!.Contains("INVENTARIO"))
                {
                    CargarInventario();
                }
            };

            Loaded += (s, e) =>
            {
                txtBarcodeVenta.Focus();
            };
        }

        private void EstablecerConexionValida()
        {
            foreach (string cadena in posiblesConnStrs)
            {
                try
                {
                    using (MySqlConnection conn = new MySqlConnection(cadena))
                    {
                        conn.Open();
                        connStrActiva = cadena; // Si abre, esta es la que usamos
                        return; 
                    }
                }
                catch (MySqlException ex) when (ex.Number == 1045) // Error de acceso denegado
                {
                    continue; // Probar la siguiente clave
                }
                catch (Exception) { continue; }
            }

            if (string.IsNullOrEmpty(connStrActiva))
            {
                MessageBox.Show("❌ No se pudo conectar con ninguna de las contraseñas (Emanuel o Gtacinco135).", "Error de Base de Datos");
            }
        }

        // Método auxiliar para obtener una conexión lista para usar
        private MySqlConnection GetConnection()
        {
            if (string.IsNullOrEmpty(connStrActiva)) EstablecerConexionValida();
            return new MySqlConnection(connStrActiva);
        }

        private void CargarInventario()
        {
            try
            {
                ObservableCollection<Producto> listaInventario = new ObservableCollection<Producto>();
                using (MySqlConnection conn = GetConnection())
                {
                    conn.Open();
                    string sql = @"SELECT p.id, p.codigo_barras, p.nombre, p.precio, p.stock, c.nombre as categoria_nombre 
                                   FROM productos p 
                                   LEFT JOIN categorias c ON p.categoria_id = c.id";

                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            listaInventario.Add(new Producto
                            {
                                Id = Convert.ToInt32(reader["id"]),
                                CodigoBarras = reader["codigo_barras"]?.ToString() ?? "",
                                Nombre = reader["nombre"]?.ToString() ?? "Sin nombre",
                                Precio = Convert.ToDecimal(reader["precio"]),
                                Stock = Convert.ToDecimal(reader["stock"]), // Ahora decimal para pesar quesos
                                Categoria = reader["categoria_nombre"]?.ToString() ?? "General"
                            });
                        }
                    }
                }
                dgInventario.ItemsSource = listaInventario;
            }
            catch (Exception ex) { MessageBox.Show("Error al cargar inventario: " + ex.Message); }
        }

        private void BtnGuardar_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(txtCargaBarcode.Text) || string.IsNullOrWhiteSpace(txtCargaNombre.Text)) return;
                if (!decimal.TryParse(txtCargaPrecio.Text, out decimal precioValue)) return;
                decimal.TryParse(txtCargaStock.Text, out decimal stockValue);

                using (MySqlConnection conn = GetConnection())
                {
                    conn.Open();
                    string sql = "INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES (@c, @n, @p, @s) ON DUPLICATE KEY UPDATE nombre=@n, precio=@p, stock=stock+@s";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text.Trim());
                    cmd.Parameters.AddWithValue("@n", txtCargaNombre.Text.Trim());
                    cmd.Parameters.AddWithValue("@p", precioValue);
                    cmd.Parameters.AddWithValue("@s", stockValue);
                    cmd.ExecuteNonQuery();
                    
                    MessageBox.Show("✓ Producto guardado correctamente.");
                    txtCargaBarcode.Clear(); txtCargaNombre.Clear(); txtCargaPrecio.Clear(); txtCargaStock.Text = "0";
                }
            }
            catch (Exception ex) { MessageBox.Show("Error al guardar: " + ex.Message); }
        }

        private void FinalizarVenta()
        {
            string metodo = (cbMetodoPago.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Efectivo";

            using (MySqlConnection conn = GetConnection())
            {
                conn.Open();
                using (MySqlTransaction trans = conn.BeginTransaction())
                {
                    try
                    {
                        MySqlCommand cmdVenta = new MySqlCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago) VALUES (@t, @c, @m)", conn, trans);
                        cmdVenta.Parameters.AddWithValue("@t", totalVenta);
                        cmdVenta.Parameters.AddWithValue("@c", carrito.Count);
                        cmdVenta.Parameters.AddWithValue("@m", metodo);
                        cmdVenta.ExecuteNonQuery();
                        long ventaId = cmdVenta.LastInsertedId;

                        foreach (var p in carrito)
                        {
                            MySqlCommand cmdDet = new MySqlCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @p, 1, @p)", conn, trans);
                            cmdDet.Parameters.AddWithValue("@id", ventaId);
                            cmdDet.Parameters.AddWithValue("@n", p.Nombre);
                            cmdDet.Parameters.AddWithValue("@p", p.Precio);
                            cmdDet.ExecuteNonQuery();

                            MySqlCommand cmdStock = new MySqlCommand("UPDATE productos SET stock = stock - 1 WHERE nombre = @n", conn, trans);
                            cmdStock.Parameters.AddWithValue("@n", p.Nombre);
                            cmdStock.ExecuteNonQuery();
                        }
                        trans.Commit();
                        MessageBox.Show("✓ Venta completada.");
                        carrito.Clear(); CalcularTotal();
                        gridCobro.Visibility = Visibility.Collapsed;
                    }
                    catch (Exception ex) { trans.Rollback(); MessageBox.Show("Error: " + ex.Message); }
                }
            }
        }

        // ... El resto de los métodos (TextChanged, KeyDown, etc.) deben usar "using (MySqlConnection conn = GetConnection())"
    }

    public class Producto
    {
        public int Id { get; set; }
        public string CodigoBarras { get; set; } = "";
        public string Nombre { get; set; } = "";
        public decimal Precio { get; set; }
        public decimal Stock { get; set; } // Cambiado a decimal para quesos/pesables
        public string Categoria { get; set; } = "General";
    }
}