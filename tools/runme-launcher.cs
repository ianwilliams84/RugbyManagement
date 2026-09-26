// Tiny launcher so the site can be started by double-clicking runme.exe.
// It runs runme.bat from the same folder in a console window titled with the
// club name. Build with tools\build-runme.ps1.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("Ironsides Rugby - Team Management")]
[assembly: AssemblyProduct("Ironsides Rugby Management")]
[assembly: AssemblyDescription("Starts the Ironsides Rugby Management site")]

class Program
{
    static int Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string bat = Path.Combine(dir, "runme.bat");
        if (!File.Exists(bat))
        {
            Console.WriteLine("ERROR: runme.bat not found next to this executable.");
            Console.WriteLine("Expected at: " + bat);
            Console.WriteLine("Press Enter to exit...");
            Console.ReadLine();
            return 1;
        }
        try
        {
            Console.Title = "Ironsides Rugby - Team Management";
            var psi = new ProcessStartInfo("cmd.exe", "/c \"\"" + bat + "\"\"")
            {
                WorkingDirectory = dir,
                UseShellExecute = false,
            };
            using (var p = Process.Start(psi))
            {
                p.WaitForExit();
                return p.ExitCode;
            }
        }
        catch (Exception e)
        {
            Console.WriteLine("Failed to launch runme.bat: " + e.Message);
            Console.WriteLine("Press Enter to exit...");
            Console.ReadLine();
            return 1;
        }
    }
}
