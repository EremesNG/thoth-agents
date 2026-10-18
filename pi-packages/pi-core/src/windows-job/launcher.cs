// Windows Job Object containment. Compiled once per persistent PowerShell helper.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class ThothJobLauncher
{
    const uint INFINITE = 0xffffffff;
    static readonly Dictionary<string, Container> Jobs = new Dictionary<string, Container>();
    static IntPtr parent;
    sealed class Container { public IntPtr Job, Process; public uint Pid; public IntPtr[] Pipes; }
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
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd, ref StartupEx startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr attributes, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr attributes, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr attributes);

    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateNamedPipeW(string name, uint mode, uint pipeMode, uint instances, uint outputSize, uint inputSize, uint timeout, ref Security security);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool ConnectNamedPipe(IntPtr pipe, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetNamedPipeHandleState(IntPtr pipe, ref uint mode, IntPtr maximum, IntPtr timeout);
    static readonly object OutputLock = new object();
    public static void Emit(string json) { lock (OutputLock) { Console.WriteLine(json); Console.Out.Flush(); } }
    static void Check(bool ok, string operation) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), operation); }
    static IntPtr Handle(IntPtr handle, string operation) { if (handle == IntPtr.Zero || handle == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error(), operation); return handle; }
    public static void WatchParent(int pid) {
        parent = Handle(OpenProcess(0x100000, false, pid), "OpenProcess(parent)");
        var watcher = new Thread(() => { WaitForSingleObject(parent, INFINITE); Environment.Exit(0); });
        watcher.IsBackground = true; watcher.Start();
    }
    public static string[] Prepare(string key) {
        if (key.Length != 32 || System.Text.RegularExpressions.Regex.IsMatch(key, "[^a-f0-9]")) throw new ArgumentException("Invalid key");
        if (Jobs.ContainsKey(key)) throw new ArgumentException("Duplicate key");
        var container = new Container { Pipes = new IntPtr[3] };
        IntPtr descriptor = IntPtr.Zero;
        try {
            container.Job = Handle(CreateJobObjectW(IntPtr.Zero, null), "CreateJobObjectW");
            var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000;
            Check(SetInformationJobObject(container.Job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))), "SetInformationJobObject");
            string sid = System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
            uint size;
            // Protected DACL, one ACE, no Everyone/anonymous/admin grants.
            Check(ConvertStringSecurityDescriptorToSecurityDescriptorW("D:P(A;;GA;;;" + sid + ")", 1, out descriptor, out size), "Pipe DACL");
            var security = new Security { Length = Marshal.SizeOf(typeof(Security)), Descriptor = descriptor, Inherit = 1 };
            string[] names = new string[3];
            string[] suffixes = { "stdin", "stdout", "stderr" };
            for (int i = 0; i < 3; i++) {
                names[i] = "\\\\.\\pipe\\thoth-job-" + key + "-" + suffixes[i];
                // Node net.Socket opens duplex handles. Unused directions stay idle.
                // FIRST_PIPE_INSTANCE; NOWAIT only for bounded connect, then WAIT.
                container.Pipes[i] = Handle(CreateNamedPipeW(names[i], 0x80000u | 3u, 0x9, 1, 65536, 65536, 10000, ref security), "CreateNamedPipeW");
            }
            Jobs.Add(key, container); return names;
        } catch { Dispose(container); throw; }
        finally { if (descriptor != IntPtr.Zero) LocalFree(descriptor); }
    }
    static Container Find(string key) { Container c; if (!Jobs.TryGetValue(key, out c)) throw new ArgumentException("Unknown job key"); return c; }
    public static uint Start(string key, string executable, string command, string cwd, string[] env) {
        var c = Find(key);
        IntPtr attributes = IntPtr.Zero, handles = IntPtr.Zero, jobValue = IntPtr.Zero, environment = IntPtr.Zero;
        bool initialized = false; ProcessInfo pi = new ProcessInfo();
        try {
            if (c.Process != IntPtr.Zero) throw new InvalidOperationException("Already started");
            var deadline = System.Diagnostics.Stopwatch.StartNew();
            foreach (IntPtr pipe in c.Pipes) {
                while (!ConnectNamedPipe(pipe, IntPtr.Zero)) {
                    int error = Marshal.GetLastWin32Error();
                    if (error == 535) break; // client connected before ConnectNamedPipe
                    if (error != 536) throw new Win32Exception(error, "ConnectNamedPipe error=" + error);
                    if (deadline.ElapsedMilliseconds >= 10000) throw new TimeoutException("Pipe connect timeout");
                    Thread.Sleep(10);
                }
                uint mode = 0;
                Check(SetNamedPipeHandleState(pipe, ref mode, IntPtr.Zero, IntPtr.Zero), "SetNamedPipeHandleState(WAIT)");
            }
            IntPtr size = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
            attributes = Marshal.AllocHGlobal(size);
            Check(InitializeProcThreadAttributeList(attributes, 2, 0, ref size), "InitializeProcThreadAttributeList"); initialized = true;
            handles = Marshal.AllocHGlobal(IntPtr.Size * 3);
            for (int i = 0; i < 3; i++) Marshal.WriteIntPtr(handles, IntPtr.Size * i, c.Pipes[i]);
            Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero), "HANDLE_LIST");
            jobValue = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobValue, c.Job);
            Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x2000D), jobValue, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero), "JOB_LIST");
            var startup = new StartupEx { Attributes = attributes };
            startup.Startup.cb = Marshal.SizeOf(typeof(StartupEx)); startup.Startup.Flags = 0x100;
            startup.Startup.StdInput = c.Pipes[0]; startup.Startup.StdOutput = c.Pipes[1]; startup.Startup.StdError = c.Pipes[2];
            Array.Sort(env, StringComparer.OrdinalIgnoreCase);
            environment = Marshal.StringToHGlobalUni(String.Join("\0", env) + "\0\0");
            if (!CreateProcessW(executable, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, true, 0x08080400, environment, cwd, ref startup, out pi)) {
                int error = Marshal.GetLastWin32Error();
                var failure = new Win32Exception(error, "CreateProcessW");
                // Only ordinary target resolution errors permit non-containment errors.
                failure.Data["kind"] = (error == 2 || error == 3 || error == 193 || error == 267) ? "target" : "unavailable";
                throw failure;
            }
            // Separate wait handle: release cannot invalidate a wait in progress.
            IntPtr waitHandle = Handle(OpenProcess(0x100000 | 0x1000, false, (int)pi.ProcessId), "OpenProcess(exit wait)");
            var waiter = new Thread(() => {
                try {
                    WaitForSingleObject(waitHandle, INFINITE); uint code;
                    if (GetExitCodeProcess(waitHandle, out code)) Emit("{\"event\":\"exit\",\"key\":\"" + key + "\",\"code\":" + code + "}");
                } finally { CloseHandle(waitHandle); }
            });
            waiter.IsBackground = true; waiter.Start();
            c.Process = pi.Process; c.Pid = pi.ProcessId; pi.Process = IntPtr.Zero;
            return c.Pid;
        } catch {
            // JOB_LIST guarantees any created target was born in this job.
            if (pi.Process != IntPtr.Zero) { TerminateJobObject(c.Job, 1); WaitForSingleObject(pi.Process, 5000); }
            throw;
        } finally {
            if (pi.Thread != IntPtr.Zero) CloseHandle(pi.Thread);
            if (pi.Process != IntPtr.Zero) CloseHandle(pi.Process);
            foreach (IntPtr pipe in c.Pipes) if (pipe != IntPtr.Zero) CloseHandle(pipe);
            c.Pipes = new IntPtr[0];
            if (initialized) DeleteProcThreadAttributeList(attributes);
            if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
            if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
        }
    }
    static uint Active(Container c) {
        Accounting info;
        Check(QueryInformationJobObject(c.Job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero), "QueryInformationJobObject");
        return info.ActiveProcesses;
    }
    public static void Terminate(string key, int timeoutMs) {
        var c = Find(key);
        Check(TerminateJobObject(c.Job, 1), "TerminateJobObject");
        var elapsed = System.Diagnostics.Stopwatch.StartNew();
        while (Active(c) != 0) { if (elapsed.ElapsedMilliseconds >= Math.Max(0, Math.Min(60000, timeoutMs))) throw new TimeoutException("Job did not become empty"); Thread.Sleep(10); }
    }
    public static void Release(string key) {
        var c = Find(key);
        if (Active(c) != 0) throw new InvalidOperationException("Cannot release a nonempty job");
        Jobs.Remove(key); Dispose(c);
    }
    static void Dispose(Container c) {
        if (c.Job != IntPtr.Zero) CloseHandle(c.Job);
        if (c.Process != IntPtr.Zero) CloseHandle(c.Process);
        if (c.Pipes != null) foreach (IntPtr pipe in c.Pipes) if (pipe != IntPtr.Zero) CloseHandle(pipe);
    }
    public static void Close() { foreach (var c in Jobs.Values) Dispose(c); Jobs.Clear(); }
}

