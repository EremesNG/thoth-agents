import { ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import { registerTools } from "../tools.js";

const TOOL_NAMES = ["bg_task_spawn", "bg_task_watch", "bg_task_list", "bg_task_status", "bg_task_log", "bg_task_stop", "bg_task", "bg_status"];
const ARGS: Record<string, Record<string, unknown>> = {
  bg_task_spawn: { name: "build", command: "pnpm build" },
  bg_task_watch: { command: "gh pr checks" },
  bg_task_list: { all: true },
  bg_task_status: { id: "bg_abc" },
  bg_task_log: { id: "bg_abc" },
  bg_task_stop: { id: "bg_abc" },
  bg_task: { action: "clear", id: "bg_abc" },
  bg_status: { action: "status", id: "bg_abc" },
};

const tools: Record<string, any> = {};
const ansi = /\u001b\[[0-9;]*m/g;
const strip = (lines: string[]) => lines.join("\n").replace(ansi, "");

function compose(name: string, text: string, opts: { expanded?: boolean; isError?: boolean; details?: unknown } = {}) {
  const component = new ToolExecutionComponent(name, "tc", ARGS[name], {}, tools[name], { requestRender() {} } as any, "/tmp");
  component.setExpanded(opts.expanded === true);
  component.updateResult({ content: [{ type: "text", text }], details: opts.details, isError: opts.isError === true }, false);
  return component;
}

beforeAll(() => {
  initTheme("dark");
  registerTools({ on() {}, registerTool(tool: any) { tools[tool.name] = tool; } } as any);
});

describe("framed tool renderers", () => {
  it("registers self-shell renderers on all eight tools", () => {
    for (const name of TOOL_NAMES) {
      expect(tools[name].renderShell).toBe("self");
      expect(typeof tools[name].renderCall).toBe("function");
      expect(typeof tools[name].renderResult).toBe("function");
    }
  });

  for (const name of TOOL_NAMES) {
    describe(name, () => {
      const body = Array.from({ length: 12 }, (_, index) => `row-${index + 1} 日本語`).join("\n");

      it("draws one frame with title, arg summary, collapsed body and expand hint", () => {
        const text = strip(compose(name, body).render(80));
        expect(text).toContain(name);
        expect((text.match(/╭/g) ?? []).length).toBe(1);
        expect((text.match(/╰/g) ?? []).length).toBe(1);
        expect(text).toContain("row-8");
        expect(text).not.toContain("row-9");
        expect(text).toContain("to expand");
      });

      it("shows the full body when expanded", () => {
        const text = strip(compose(name, body, { expanded: true }).render(80));
        expect(text).toContain("row-12");
        expect(text).not.toContain("to expand");
      });

      it("styles errors and keeps a single frame", () => {
        const lines = compose(name, "boom", { isError: true }).render(80);
        expect(lines.join("\n")).toContain("boom");
        expect((strip(lines).match(/╭/g) ?? []).length).toBe(1);
      });

      it("never exceeds width and is empty at width 0", () => {
        expect(compose(name, body).render(0)).toEqual([]);
        for (const width of [1, 40, 80]) {
          for (const expanded of [false, true]) {
            for (const line of compose(name, body, { expanded }).render(width)) {
              expect(visibleWidth(line)).toBeLessThanOrEqual(width);
            }
          }
        }
      });
    });
  }

  it("summarizes call arguments on one line", () => {
    const text = strip(compose("bg_task", "ok").render(80));
    expect(text).toMatch(/bg_task.*clear.*bg_abc/);
    expect(strip(compose("bg_task_spawn", "ok").render(80))).toMatch(/bg_task_spawn.*build.*pnpm build/);
  });

  it("keeps the compact log preview inside the frame", () => {
    const details = { kind: "background-task-log-display", head: "[log] bg_abc", fullLineCount: 20, compactLines: ["tail-a", "tail-b"], foldedLineCount: 15 };
    const collapsed = strip(compose("bg_task_log", Array.from({ length: 20 }, (_, i) => `full-${i}`).join("\n"), { details }).render(80));
    expect(collapsed).toContain("tail-b");
    expect(collapsed).toContain("Folded 15 display lines");
    expect(collapsed).not.toContain("full-19");
    const expanded = strip(compose("bg_task_log", Array.from({ length: 20 }, (_, i) => `full-${i}`).join("\n"), { details, expanded: true }).render(80));
    expect(expanded).toContain("full-19");
  });
});
