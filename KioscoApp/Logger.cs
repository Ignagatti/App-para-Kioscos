using System;
using System.IO;

namespace KioscoApp
{
    internal static class Logger
    {
        private static readonly object _lock = new object();
        
        // MEJORA 1: Log Rotativo por día. Genera archivos como "logs_2026-04-24.txt"
        private static string LogFilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), 
            "KioscoApp", 
            $"logs_{DateTime.Now:yyyy-MM-dd}.txt"
        );

        public static void LogInfo(string msg)
        {
            Write("INFO", msg);
        }

        // Mantenemos este para que no se rompan los LogError que ya tenés escritos
        public static void LogError(string msg)
        {
            Write("ERROR", msg);
        }

        // MEJORA 2: Nueva función exclusiva para atrapar excepciones reales
        public static void LogError(Exception ex, string mensajeAdicional = "Ocurrió un error crítico")
        {
            // Agregamos un separador y el StackTrace (que nos dice la LÍNEA EXACTA donde falló)
            string detalle = $"{mensajeAdicional} | Detalle: {ex.Message}\nStackTrace: {ex.StackTrace}\n----------------------------------------";
            Write("ERROR", detalle);
        }

        private static void Write(string level, string msg)
        {
            try
            {
                var dir = Path.GetDirectoryName(LogFilePath);
                if (!Directory.Exists(dir!)) Directory.CreateDirectory(dir!);
                
                var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {level}: {msg}" + Environment.NewLine;
                
                lock (_lock)
                {
                    File.AppendAllText(LogFilePath, line);
                }
            }
            catch { /* No throw from logger */ }
        }
    }
}