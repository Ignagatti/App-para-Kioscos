using System;
using System.IO;

namespace KioscoApp
{
    internal static class Logger
    {
        private static readonly object _lock = new object();
        private static string LogFilePath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "KioscoApp", "logs.txt");

        public static void LogInfo(string msg)
        {
            Write("INFO", msg);
        }

        public static void LogError(string msg)
        {
            Write("ERROR", msg);
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
