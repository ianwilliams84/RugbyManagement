// Ironsides Rugby Management launcher, compiled to runme.exe by
// tools\build-runme.ps1. Modelled on the Trading Manager Platform's runme.exe.
//
// Starts the site's Node server in the background, opens the browser, then
// stays at a prompt so you can reopen the browser, restart the server to pick
// up code changes, or see its recent output, without closing the window.
// Closing the window (or q / Ctrl+C) stops the server.
//
// NOTE: this file must stay C# 5 compatible - it is compiled by the .NET
// Framework csc.exe (no string interpolation, no Process.Kill(entireTree)).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

[assembly: AssemblyTitle("Ironsides Rugby - Team Management")]
[assembly: AssemblyProduct("Ironsides Rugby Management")]
[assembly: AssemblyDescription("Starts the Ironsides Rugby Management site")]

class Launcher
{
    const string Title = "Ironsides Rugby - Team Management";
    const string DefaultPort = "3001";
    const string ServerScript = "server/index.js";

    static string RootDir;
    static string NodeExe;
    static string Port;
    static Process Proc;

    static readonly List<string> log = new List<string>();
    static readonly object gate = new object();

    static void Note(string line)
    {
        if (line == null) return;
        lock (gate)
        {
            log.Add(line);
            if (log.Count > 300) log.RemoveAt(0);
        }
    }

    static string[] Tail(int n)
    {
        lock (gate)
        {
            int skip = log.Count > n ? log.Count - n : 0;
            var outp = new List<string>();
            for (int i = skip; i < log.Count; i++) outp.Add(log[i]);
            return outp.ToArray();
        }
    }

    // Keep a reference so the delegate is not collected while Windows holds it.
    delegate bool HandlerRoutine(uint ctrlType);
    static HandlerRoutine ctrlHandler;
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetConsoleCtrlHandler(HandlerRoutine handler, bool add);

    static int Main()
    {
        Console.Title = Title;
        RootDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        Directory.SetCurrentDirectory(RootDir);

        Console.WriteLine("==========================================");
        Console.WriteLine("  " + Title);
        Console.WriteLine("==========================================");
        Console.WriteLine();

        NodeExe = FindNode();
        if (NodeExe == null)
        {
            Console.WriteLine("ERROR: node.js not found.");
            Console.WriteLine("Install Node 20+ from https://nodejs.org and re-run.");
            Pause();
            return 1;
        }
        if (NodeExe != "node")
        {
            Environment.SetEnvironmentVariable(
                "PATH", Path.GetDirectoryName(NodeExe) + ";" + Environment.GetEnvironmentVariable("PATH"));
        }

        Port = ReadPort();

        if (!Directory.Exists(Path.Combine(RootDir, "node_modules")))
        {
            Console.WriteLine("Installing dependencies (first run only)...");
            if (RunWait("cmd.exe", "/c npm install", false) != 0)
            {
                Console.WriteLine("npm install failed.");
                Pause();
                return 1;
            }
            Console.WriteLine();
        }

        // Stop the server if the window is closed or Ctrl+C is pressed,
        // otherwise node keeps holding the port after the window is gone.
        ctrlHandler = new HandlerRoutine(OnConsoleSignal);
        SetConsoleCtrlHandler(ctrlHandler, true);

        // A failed start (e.g. NAS unreachable) still drops to the prompt, so
        // you can fix it and press r instead of relaunching.
        if (StartServer()) OpenBrowser();

        Console.WriteLine();
        PrintHelp();
        CommandLoop();

        StopServer();
        return 0;
    }

    // ---- Interactive prompt ----------------------------------------------

    static void PrintHelp()
    {
        Console.WriteLine("------------------------------------------");
        Console.WriteLine("  http://localhost:" + Port);
        Console.WriteLine("------------------------------------------");
        Console.WriteLine("  o   open in the browser");
        Console.WriteLine("  r   restart the server (picks up code and");
        Console.WriteLine("      settings-file changes, ~2 sec)");
        Console.WriteLine("  l   show recent server output");
        Console.WriteLine("  ?   show this list");
        Console.WriteLine("  q   quit (stops the server)");
        Console.WriteLine();
    }

    static void CommandLoop()
    {
        while (true)
        {
            Console.Write("> ");
            string line = Console.ReadLine();
            // Ctrl+C / closed stdin gives null - treat as quit rather than spin.
            if (line == null) return;

            switch (line.Trim().ToLowerInvariant())
            {
                case "":
                    break;

                case "o":
                case "open":
                    OpenBrowser();
                    break;

                case "r":
                case "s":
                case "reload":
                case "restart":
                    Console.WriteLine("Restarting...");
                    StopServer();
                    StartServer();
                    break;

                case "l":
                case "log":
                case "logs":
                    ShowLogs();
                    break;

                case "?":
                case "h":
                case "help":
                    PrintHelp();
                    break;

                case "q":
                case "quit":
                case "exit":
                    Console.WriteLine("Stopping the server...");
                    return;

                default:
                    Console.WriteLine("Unknown command. Press ? for the list.");
                    break;
            }
        }
    }

    static void ShowLogs()
    {
        Console.WriteLine();
        Console.WriteLine("--- server output ---");
        string[] tail = Tail(25);
        if (tail.Length == 0) Console.WriteLine("(no output)");
        foreach (string l in tail) Console.WriteLine("  " + l);
        if (Proc == null || Proc.HasExited) Console.WriteLine("  (the server is NOT running - press r to start it)");
        Console.WriteLine();
    }

    // ---- Server control ---------------------------------------------------

    static bool StartServer()
    {
        KillLeftoverServer();
        lock (gate) log.Clear();

        var psi = new ProcessStartInfo(NodeExe, ServerScript);
        psi.UseShellExecute = false;
        psi.WorkingDirectory = RootDir;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.CreateNoWindow = true;

        Proc = new Process();
        Proc.StartInfo = psi;
        Proc.OutputDataReceived += delegate(object o, DataReceivedEventArgs e) { Note(e.Data); };
        Proc.ErrorDataReceived  += delegate(object o, DataReceivedEventArgs e) { Note(e.Data); };

        try
        {
            Proc.Start();
            Proc.BeginOutputReadLine();
            Proc.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            Console.WriteLine("Could not start the server: " + ex.Message);
            return false;
        }

        if (!WaitForPort(30000))
        {
            // Most likely cause: the NAS data folder can't be reached, which
            // the server reports and then exits on purpose.
            Thread.Sleep(300);
            Console.WriteLine("The server did not start. Its output:");
            foreach (string l in Tail(15)) Console.WriteLine("  " + l);
            Console.WriteLine("Fix the problem above, then press r to try again.");
            return false;
        }

        // Echo the server's startup lines (data folder in use, URL).
        Thread.Sleep(200);
        foreach (string l in Tail(5)) Console.WriteLine(l);
        return true;
    }

    static void StopServer()
    {
        if (Proc == null) return;
        try
        {
            if (!Proc.HasExited)
            {
                RunWait("taskkill", "/PID " + Proc.Id + " /T /F", true);
                Proc.WaitForExit(10000);
            }
        }
        catch { }
        Proc = null;
    }

    /// Stops a server left over from an earlier launcher window that was
    /// force-closed. Only touches a node.exe that is listening on our port AND
    /// was started with our server script, so nothing else can be hit.
    static void KillLeftoverServer()
    {
        bool killedAny = false;
        foreach (int pid in FindPidsListeningOn(Port))
        {
            string info = RunCapture("wmic",
                "process where \"ProcessId=" + pid + "\" get Name,CommandLine /format:list");
            if (info.IndexOf("Name=node.exe", StringComparison.OrdinalIgnoreCase) < 0) continue;
            if (info.IndexOf("server/index.js", StringComparison.OrdinalIgnoreCase) < 0 &&
                info.IndexOf("server\\index.js", StringComparison.OrdinalIgnoreCase) < 0) continue;
            Console.WriteLine("Stopping a server left over from an earlier window (PID " + pid + ")...");
            RunWait("taskkill", "/PID " + pid + " /T /F", true);
            killedAny = true;
        }
        // Give Windows a moment to release the socket before we rebind it.
        if (killedAny) Thread.Sleep(500);
    }

    static List<int> FindPidsListeningOn(string port)
    {
        var pids = new List<int>();
        foreach (string rawLine in RunCapture("netstat", "-ano -p TCP").Split('\n'))
        {
            string line = rawLine.Trim();
            if (line.IndexOf("LISTENING", StringComparison.OrdinalIgnoreCase) < 0) continue;
            string[] parts = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            // Expected columns: Proto  LocalAddress  ForeignAddress  State  PID
            if (parts.Length < 5) continue;
            int colon = parts[1].LastIndexOf(':');
            if (colon < 0 || parts[1].Substring(colon + 1) != port) continue;
            int pid;
            if (int.TryParse(parts[parts.Length - 1], out pid) && !pids.Contains(pid)) pids.Add(pid);
        }
        return pids;
    }

    static bool WaitForPort(int timeoutMs)
    {
        int p = int.Parse(Port);
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < timeoutMs)
        {
            if (Proc == null || Proc.HasExited) return false;
            try
            {
                using (var c = new TcpClient())
                {
                    c.Connect("127.0.0.1", p);
                    return true;
                }
            }
            catch { Thread.Sleep(250); }
        }
        return false;
    }

    static bool OnConsoleSignal(uint ctrlType)
    {
        StopServer();
        return false; // let default handling continue closing the window
    }

    // ---- Plumbing ---------------------------------------------------------

    /// The server takes PORT from the secrets file (dev\secrets\ironsides.env,
    /// or IRONSIDES_ENV), so read the same place to know where to point the
    /// browser. Falls back to 3001, the server's own default.
    static string ReadPort()
    {
        string envFile = Environment.GetEnvironmentVariable("IRONSIDES_ENV");
        if (string.IsNullOrEmpty(envFile))
            envFile = Path.Combine(Path.GetDirectoryName(RootDir), "secrets", "ironsides.env");
        try
        {
            foreach (string raw in File.ReadAllLines(envFile))
            {
                string line = raw.Trim();
                if (!line.StartsWith("PORT=")) continue;
                string v = line.Substring(5).Trim().Trim('"', '\'');
                int n;
                if (int.TryParse(v, out n) && n > 0 && n < 65536) return v;
            }
        }
        catch { }
        return DefaultPort;
    }

    static void OpenBrowser()
    {
        try
        {
            var psi = new ProcessStartInfo("http://localhost:" + Port);
            psi.UseShellExecute = true;
            Process.Start(psi);
        }
        catch { /* not fatal - the URL is printed above */ }
    }

    static string FindNode()
    {
        // The shareable download ships its own Node in node\node.exe, so it
        // runs on a PC that has never installed Node.
        string bundled = Path.Combine(RootDir, "node", "node.exe");
        if (File.Exists(bundled)) return bundled;

        // Only trust PATH if "node" actually resolves there.
        try
        {
            var psi = new ProcessStartInfo("cmd.exe", "/c where node");
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            var t = Process.Start(psi);
            t.WaitForExit();
            if (t.ExitCode == 0) return "node";
        }
        catch { }

        foreach (string cand in new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe"),
        })
        {
            if (File.Exists(cand)) return cand;
        }
        return null;
    }

    static int RunWait(string file, string args, bool quiet)
    {
        var psi = new ProcessStartInfo(file, args);
        psi.UseShellExecute = false;
        psi.WorkingDirectory = RootDir;
        if (quiet)
        {
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
        }
        var p = Process.Start(psi);
        p.WaitForExit();
        return p.ExitCode;
    }

    static string RunCapture(string file, string args)
    {
        try
        {
            var psi = new ProcessStartInfo(file, args);
            psi.UseShellExecute = false;
            psi.WorkingDirectory = RootDir;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            var p = Process.Start(psi);
            string output = p.StandardOutput.ReadToEnd();
            p.WaitForExit();
            return output;
        }
        catch { return ""; }
    }

    static void Pause()
    {
        Console.WriteLine();
        Console.Write("Press any key to close...");
        try { Console.ReadKey(); } catch { }
    }
}
