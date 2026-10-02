// Windows Job Object containment. Compiled once per persistent PowerShell helper.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class WindowsJobPrototype
{
    const uint INFINITE = 0xffffffff;
    static readonly Dictionary<string, Container> Jobs = new Dictionary<string, Container>();
    static IntPtr parent;
    sealed class Container { public IntPtr Job, Process; public uint Pid; }
    [StructLayout(LayoutKind.Sequential)] struct Security { public int Length; public IntPtr Descriptor; public int Inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
        public int cb; public string Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public ushort ShowWindow, Reserved2; public IntPtr ReservedPtr, StdInput, StdOutput, StdError;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup Startup; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadCount, WriteCount, OtherCount, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateFileW(string name, uint access, uint sharing, ref Security security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd, ref StartupEx startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr attributes, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr attributes, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr attributes);

    static void Check(bool success, string operation) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error(), operation); }
    static IntPtr Handle(IntPtr handle, string operation) { if (handle == IntPtr.Zero || handle == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error(), operation); return handle; }
    public static bool InJob(int pid) {
        IntPtr h = Handle(OpenProcess(0x1000, false, pid), "OpenProcess(query)");
        try { bool result; Check(IsProcessInJob(h, IntPtr.Zero, out result), "IsProcessInJob"); return result; }
        finally { CloseHandle(h); }
    }
    public static void WatchParent(int pid) {
        parent = Handle(OpenProcess(0x100000, false, pid), "OpenProcess(parent)");
        // This native wait stays independent of the PowerShell pipeline / blocking stdin.
        var watcher = new Thread(() => { WaitForSingleObject(parent, INFINITE); Environment.Exit(0); });
        watcher.IsBackground = true;
        watcher.Start();
    }
    static string Quote(string text) {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in text) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') result.Append('\\', slashes * 2 + 1);
            else result.Append('\\', slashes);
            result.Append(c); slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }
    public static object Launch(string key, string executable, string[] argv, string cwd, string[] env, string log, bool denyAssignment = false, string stderrLog = null) {
        if (Jobs.ContainsKey(key)) throw new ArgumentException("Duplicate job key");
        IntPtr job = IntPtr.Zero, output = IntPtr.Zero, errorOutput = IntPtr.Zero, input = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero, environment = IntPtr.Zero;
        bool initialized = false; ProcessInfo pi = new ProcessInfo();
        try {
            job = Handle(CreateJobObjectW(IntPtr.Zero, null), "CreateJobObject");
            var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway flags.
            Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf<ExtendedLimits>()), "SetInformationJobObject");
            var security = new Security { Length = Marshal.SizeOf<Security>(), Inherit = 1 };
            output = Handle(CreateFileW(log, 0x4, 7, ref security, 4, 0x80, IntPtr.Zero), "CreateFile(log append)");
            errorOutput = String.IsNullOrEmpty(stderrLog) || stderrLog == log ? output : Handle(CreateFileW(stderrLog, 0x4, 7, ref security, 4, 0x80, IntPtr.Zero), "CreateFile(stderr append)");
            input = Handle(CreateFileW("NUL", 0x80000000, 7, ref security, 3, 0x80, IntPtr.Zero), "CreateFile(NUL)");
            IntPtr size = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
            attributes = Marshal.AllocHGlobal(size);
            Check(InitializeProcThreadAttributeList(attributes, 1, 0, ref size), "InitializeProcThreadAttributeList"); initialized = true;
            int handleCount = errorOutput == output ? 2 : 3;
            handles = Marshal.AllocHGlobal(IntPtr.Size * handleCount);
            Marshal.WriteIntPtr(handles, 0, output); Marshal.WriteIntPtr(handles, IntPtr.Size, input);
            if (handleCount == 3) Marshal.WriteIntPtr(handles, IntPtr.Size * 2, errorOutput);
            // Allowlist only stdio. Job and parent handles are also non-inheritable.
            Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handles, new IntPtr(IntPtr.Size * handleCount), IntPtr.Zero, IntPtr.Zero), "UpdateProcThreadAttribute(handle list)");
            var startup = new StartupEx { Attributes = attributes };
            startup.Startup.cb = Marshal.SizeOf<StartupEx>(); startup.Startup.Flags = 0x100;
            startup.Startup.StdInput = input; startup.Startup.StdOutput = output; startup.Startup.StdError = errorOutput;
            Array.Sort(env, StringComparer.OrdinalIgnoreCase);
            environment = Marshal.StringToHGlobalUni(String.Join("\0", env) + "\0\0");
            var command = new StringBuilder(Quote(executable)); foreach (string arg in argv) command.Append(' ').Append(Quote(arg));
            // SUSPENDED | NO_WINDOW | UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT.
            Check(CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, true, 0x08080404, environment, cwd, ref startup, out pi), "CreateProcessW(suspended)");
            if (!AssignProcessToJobObject(denyAssignment ? new IntPtr(-1) : job, pi.Process)) {
                int error = Marshal.GetLastWin32Error();
                Check(TerminateProcess(pi.Process, 1), "TerminateProcess(unassigned suspended child)");
                WaitForSingleObject(pi.Process, INFINITE);
                var failure = new Win32Exception(error, "AssignProcessToJobObject (child terminated without resuming)");
                failure.Data["failedPid"] = pi.ProcessId; failure.Data["neverResumed"] = true;
                throw failure;
            }
            if (ResumeThread(pi.Thread) == 0xffffffff) throw new Win32Exception(Marshal.GetLastWin32Error(), "ResumeThread");
            Jobs.Add(key, new Container { Job = job, Process = pi.Process, Pid = pi.ProcessId });
            job = IntPtr.Zero; pi.Process = IntPtr.Zero;
            return new { pid = pi.ProcessId };
        } catch {
            if (pi.Process != IntPtr.Zero) { TerminateProcess(pi.Process, 1); WaitForSingleObject(pi.Process, INFINITE); }
            throw;
        } finally {
            if (pi.Thread != IntPtr.Zero) CloseHandle(pi.Thread);
            if (pi.Process != IntPtr.Zero) CloseHandle(pi.Process);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (errorOutput != IntPtr.Zero && errorOutput != output) CloseHandle(errorOutput);
            if (output != IntPtr.Zero) CloseHandle(output);
            if (input != IntPtr.Zero) CloseHandle(input);
            if (initialized) DeleteProcThreadAttributeList(attributes);
            if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
        }
    }
    public static object Query(string key) {
        var job = Jobs[key]; Accounting info;
        Check(QueryInformationJobObject(job.Job, 1, out info, (uint)Marshal.SizeOf<Accounting>(), IntPtr.Zero), "QueryInformationJobObject");
        uint? exitCode = null;
        if (WaitForSingleObject(job.Process, 0) == 0) { uint code; Check(GetExitCodeProcess(job.Process, out code), "GetExitCodeProcess"); exitCode = code; }
        long creation, exit, kernel, user;
        Check(GetProcessTimes(job.Process, out creation, out exit, out kernel, out user), "GetProcessTimes");
        return new { pid = job.Pid, activeProcesses = info.ActiveProcesses, totalProcesses = info.TotalProcesses, exitCode, creationTime = DateTime.FromFileTimeUtc(creation).ToString("O") };
    }
    public static object Terminate(string key) { Check(TerminateJobObject(Jobs[key].Job, 1), "TerminateJobObject"); return Query(key); }
    public static object Release(string key) {
        var job = Jobs[key]; Accounting info;
        Check(QueryInformationJobObject(job.Job, 1, out info, (uint)Marshal.SizeOf<Accounting>(), IntPtr.Zero), "QueryInformationJobObject(release)");
        if (info.ActiveProcesses != 0) throw new InvalidOperationException("Cannot release a nonempty job");
        Jobs.Remove(key); CloseHandle(job.Job); CloseHandle(job.Process); return new { released = true };
    }
    public static void Close() {
        foreach (var job in Jobs.Values) { CloseHandle(job.Job); CloseHandle(job.Process); }
        Jobs.Clear();
        // Parent handle stays open until process exit: watcher may still be waiting.
    }
}
