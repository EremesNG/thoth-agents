// Real CreateProcessW breakaway attempt, executed from inside the tested Job Object.
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class BreakawayProbe
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct Startup {
        public int cb;
        public string Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public ushort ShowWindow, Reserved2;
        public IntPtr ReservedPtr, StdInput, StdOutput, StdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes,
        IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd,
        ref Startup startup, out ProcessInfo info);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr process, uint milliseconds);

    public static object Attempt(string executable) {
        var startup = new Startup { cb = Marshal.SizeOf<Startup>() };
        ProcessInfo child;
        // CREATE_BREAKAWAY_FROM_JOB | CREATE_NO_WINDOW (no visible console).
        const uint flags = 0x01000000 | 0x08000000;
        bool created = CreateProcessW(executable,
            new StringBuilder("\"" + executable + "\" -e \"setInterval(()=>{},1000)\""),
            IntPtr.Zero, IntPtr.Zero, false, flags, IntPtr.Zero, null, ref startup, out child);
        int error = created ? 0 : Marshal.GetLastWin32Error();
        // Fail-safe for the red case: even a genuinely escaped child must not be left behind.
        bool cleaned = !created;
        if (created) {
            try { cleaned = TerminateProcess(child.Process, 1) && WaitForSingleObject(child.Process, 5000) == 0; }
            finally { CloseHandle(child.Thread); CloseHandle(child.Process); }
        }
        return new { created, error, flags, pid = child.ProcessId, cleaned };
    }
}
