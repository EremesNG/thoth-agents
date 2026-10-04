import type { CustomEditor, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { lifecycleHost } from "./test-support/lifecycle-harness.js";

describe("background-tasks navigator editor", () => {
  it("embeds Pi's working status through the fallback editor proxy when no prior factory exists", async () => {
    const host = lifecycleHost("navigator-default-editor", true);
    expect(host.editor).toBeUndefined();
    try {
      await host.emit("session_start");
      const factory = host.editor as NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;
      expect(factory).toBeTypeOf("function");
      const editor = factory(
        { requestRender() {} } as never,
        { borderColor: (value: string) => value } as never,
        { matches: () => false } as never,
      ) as CustomEditor;

      expect("embedWorkingStatus" in editor).toBe(true);
      expect(editor.embedWorkingStatus).toBe(true);
      expect("setWorkingStatusIndicator" in editor).toBe(true);
      expect(editor.setWorkingStatusIndicator).toBeTypeOf("function");
      editor.setWorkingStatusIndicator(undefined);
    } finally {
      await host.emit("session_shutdown", "reload");
    }
  });
});
