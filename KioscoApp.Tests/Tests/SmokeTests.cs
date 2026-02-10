using System;
using System.IO;
using System.Linq;
using Xunit;

namespace KioscoApp.Tests
{
    public class SmokeTests
    {
        string FindSolutionRoot(string start)
        {
            var dir = new DirectoryInfo(start);
            while (dir != null)
            {
                if (dir.GetFiles("*.sln").Any()) return dir.FullName;
                dir = dir.Parent;
            }
            throw new InvalidOperationException("Solution root not found");
        }

        [Fact]
        public void TrivialTrue()
        {
            Assert.True(true);
        }

        [Fact]
        public void DatabaseSqlFileExists()
        {
            var baseDir = AppContext.BaseDirectory;
            var solutionRoot = FindSolutionRoot(baseDir);
            var sqlPath = Path.Combine(solutionRoot, "KioscoApp", "database_sqlite.sql");
            Assert.True(File.Exists(sqlPath), $"database_sqlite.sql not found at {sqlPath}");
        }
    }
}
