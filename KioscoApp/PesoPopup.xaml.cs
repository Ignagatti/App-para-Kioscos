using System;
using System.Windows;
using System.Windows.Input;

namespace KioscoApp
{
    public partial class PesoPopup : Window
    {
        public decimal PesoGramos { get; private set; }
        public bool Confirmado { get; private set; }

        public PesoPopup(string productoNombre, decimal precioPorKilo)
        {
            InitializeComponent();
            lblProducto.Text = $"Producto: {productoNombre}";
            Title = $"Precio por kilo: ${precioPorKilo:#,##0.00}";
            txtGramos.Focus();
        }

        private void TxtGramos_PreviewTextInput(object sender, TextCompositionEventArgs e)
        {
            // Solo permitir números y punto decimal
            if (!char.IsDigit(e.Text, 0) && e.Text != "." && e.Text != ",")
            {
                e.Handled = true;
            }
        }

        private void BtnAceptar_Click(object sender, RoutedEventArgs e)
        {
            if (decimal.TryParse(txtGramos.Text.Replace(",", "."), out decimal gramos) && gramos > 0)
            {
                PesoGramos = gramos;
                Confirmado = true;
                DialogResult = true;
                Close();
            }
            else
            {
                MessageBox.Show("Ingrese un peso válido en gramos.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void BtnCancelar_Click(object sender, RoutedEventArgs e)
        {
            Confirmado = false;
            DialogResult = false;
            Close();
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                if (decimal.TryParse(txtGramos.Text.Replace(",", "."), out decimal gramos) && gramos > 0)
                {
                    PesoGramos = gramos;
                    Confirmado = true;
                    DialogResult = true;
                    Close();
                }
                else
                {
                    MessageBox.Show("Ingrese un peso válido en gramos.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            else if (e.Key == Key.Escape)
            {
                Confirmado = false;
                DialogResult = false;
                Close();
            }
            base.OnKeyDown(e);
        }
    }
}