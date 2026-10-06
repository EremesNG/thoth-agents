import { getMarkdownTheme } from '@earendil-works/pi-coding-agent';
import { Markdown } from '@earendil-works/pi-tui';

const MAX_ENTRIES = 200;

interface Entry {
  markdown: Markdown;
  width?: number;
  lines?: string[];
}

/** Parses each preview once and reuses rendered lines per width. */
export class MarkdownCache {
  private readonly entries = new Map<string, Entry>();

  render(source: string, width: number): string[] {
    let entry = this.entries.get(source);
    if (!entry) {
      if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
      entry = { markdown: new Markdown(source, 0, 0, getMarkdownTheme()) };
      this.entries.set(source, entry);
    }
    if (entry.width !== width || !entry.lines) {
      entry.lines = entry.markdown.render(width);
      entry.width = width;
    }
    return entry.lines;
  }

  clear(): void {
    this.entries.clear();
  }
}
