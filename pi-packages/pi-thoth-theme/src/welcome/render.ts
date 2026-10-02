import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { IconMode } from '../shared/config.ts';
import { getThothLogoLines } from './logo.ts';
import type {
  WelcomeData,
  WelcomeProvider,
  WelcomeSession,
} from './resources.ts';

export interface ActiveThemeLike {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
}

function color(
  theme: ActiveThemeLike | undefined,
  token: string,
  text: string,
): string {
  if (!text) return '';
  if (theme?.fg) {
    try {
      return theme.fg(token, text);
    } catch {
      return text;
    }
  }
  return text;
}

function bold(theme: ActiveThemeLike | undefined, text: string): string {
  if (!text) return '';
  if (theme?.bold) {
    try {
      return theme.bold(text);
    } catch {
      return text;
    }
  }
  return text;
}

function padEnd(text: string, width: number): string {
  const current = visibleWidth(text);
  if (current > width) return truncateToWidth(text, width);
  return text + ' '.repeat(Math.max(0, width - current));
}

function center(text: string, width: number): string {
  const current = visibleWidth(text);
  if (current > width) return truncateToWidth(text, width);
  const left = Math.floor((width - current) / 2);
  const right = width - current - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function formatResourceSummary(
  theme: ActiveThemeLike | undefined,
  resources: WelcomeData['resources'],
  sep: string,
): string {
  const parts: string[] = [];
  const cText = (s: string) => color(theme, 'text', s);
  const cSuccess = (s: string) => color(theme, 'success', s);
  const cDim = (s: string) => color(theme, 'dim', s);

  if (typeof resources.tools === 'number') {
    parts.push(cText('tools ') + cSuccess(String(resources.tools)));
  }
  if (typeof resources.skills === 'number') {
    parts.push(cText('skills ') + cSuccess(String(resources.skills)));
  }
  if (typeof resources.extensions === 'number') {
    parts.push(cText('exts ') + cSuccess(String(resources.extensions)));
  }

  return parts.join(cDim(sep));
}

function buildTips(
  theme: ActiveThemeLike | undefined,
  mode: IconMode,
): string[] {
  const bullet = mode === 'ascii' ? '*' : '•';
  const sep = mode === 'ascii' ? ' | ' : '  ·  ';
  const cDim = (s: string) => color(theme, 'dim', s);
  const cMuted = (s: string) => color(theme, 'muted', s);
  return [
    ` ${cDim(bullet)} ${cMuted('/ for commands')}${cDim(sep)}${cMuted('! for bash')}`,
  ];
}

function buildProviderRows(
  theme: ActiveThemeLike | undefined,
  providers: readonly WelcomeProvider[],
  mode: IconMode,
  maxWidth: number,
): string[] {
  const bullet = mode === 'ascii' ? '*' : '●';
  const cSuccess = (s: string) => color(theme, 'success', s);
  const cMuted = (s: string) => color(theme, 'muted', s);
  const cDim = (s: string) => color(theme, 'dim', s);

  if (providers.length === 0) {
    return [` ${cDim('No tool providers')}`];
  }

  return providers.slice(0, 4).map((p) => {
    const mark = cSuccess(bullet);
    const name = cMuted(p.name);
    const prefixWidth = visibleWidth(` ${bullet} ${p.name}: `);
    const detailWidth = Math.max(1, maxWidth - prefixWidth);
    const detail = cDim(truncateToWidth(p.detail, detailWidth));
    return ` ${mark} ${name} ${detail}`;
  });
}

function buildSessionRows(
  theme: ActiveThemeLike | undefined,
  sessions: readonly WelcomeSession[],
  mode: IconMode,
  maxWidth: number,
): string[] {
  const bullet = mode === 'ascii' ? '*' : '•';
  const cDim = (s: string) => color(theme, 'dim', s);
  const cMuted = (s: string) => color(theme, 'muted', s);

  if (sessions.length === 0) {
    return [` ${cDim('No recent sessions')}`];
  }

  return sessions.slice(0, 4).map((s) => {
    const age = ` (${s.timeAgo})`;
    const ageWidth = visibleWidth(age);
    const bulletPrefix = ` ${bullet} `;
    const maxNameWidth = Math.max(
      1,
      maxWidth - visibleWidth(bulletPrefix) - ageWidth,
    );
    const name = cMuted(truncateToWidth(s.name, maxNameWidth));
    return ` ${cDim(bullet)} ${name}${cDim(age)}`;
  });
}

export function renderWelcomeHeader(
  theme: ActiveThemeLike | undefined,
  data: WelcomeData,
  width: number,
  mode: IconMode = 'nerd',
): string[] {
  if (width <= 0) return [];

  const isAscii = mode === 'ascii';
  const cAccent = (s: string) => color(theme, 'accent', s);
  const cDim = (s: string) => color(theme, 'dim', s);
  const cMuted = (s: string) => color(theme, 'muted', s);
  const cText = (s: string) => color(theme, 'text', s);

  const bTl = isAscii ? '+' : '╭';
  const bTr = isAscii ? '+' : '╮';
  const bBl = isAscii ? '+' : '╰';
  const bBr = isAscii ? '+' : '╯';
  const bV = isAscii ? '|' : '│';
  const bH = isAscii ? '-' : '─';
  const sep = isAscii ? ' | ' : '  ·  ';
  const mark = isAscii ? '*' : '◆';

  // Wide layout (2 columns)
  if (width >= 64) {
    const boxWidth = width;
    const contentWidth = boxWidth - 3; // left bV, middle bV, right bV
    const logoLines = getThothLogoLines(mode);
    const logoWidth = Math.max(...logoLines.map((l) => visibleWidth(l)));
    const leftColumn = Math.max(logoWidth + 2, 24);
    const rightColumn = contentWidth - leftColumn;

    if (rightColumn >= 30) {
      // Build left column
      const leftRows: string[] = [
        '',
        center(bold(theme, cAccent('T H O T H')), leftColumn),
        '',
        ...logoLines.map((line) => center(cAccent(line), leftColumn)),
        '',
        center(cText(data.model || 'pi-coding-agent'), leftColumn),
        center(cDim(data.provider || ''), leftColumn),
      ];

      // Build right column
      const resourceSummary = formatResourceSummary(theme, data.resources, sep);
      const rightDivider = ` ${cDim(bH.repeat(Math.max(1, rightColumn - 2)))}`;
      const resourceHeader = resourceSummary
        ? ` ${cAccent(mark)} ${bold(theme, cAccent('Resources'))}  ${resourceSummary}`
        : ` ${cAccent(mark)} ${bold(theme, cAccent('Resources'))}`;

      const rightRows: string[] = [
        resourceHeader,
        rightDivider,
        ` ${cAccent(mark)} ${bold(theme, cAccent('Tool Providers'))}`,
        ...buildProviderRows(theme, data.providers, mode, rightColumn),
        rightDivider,
        ` ${cAccent(mark)} ${bold(theme, cAccent('Recent Sessions'))}`,
        ...buildSessionRows(theme, data.sessions, mode, rightColumn),
        rightDivider,
        ...buildTips(theme, mode),
      ];

      const maxRows = Math.max(leftRows.length, rightRows.length);
      while (leftRows.length < maxRows) leftRows.push('');
      while (rightRows.length < maxRows) rightRows.push('');

      const label = ` v${data.version} `;
      const lead = bH.repeat(3);
      const remainingFill = Math.max(
        0,
        boxWidth - 2 - visibleWidth(lead) - visibleWidth(label),
      );
      const topBorder = `${cDim(bTl)}${cDim(lead)}${cAccent(label)}${cDim(bH.repeat(remainingFill))}${cDim(bTr)}`;
      const bottomBorder = `${cDim(bBl)}${cDim(bH.repeat(boxWidth - 2))}${cDim(bBr)}`;

      const out: string[] = [topBorder];
      for (let i = 0; i < maxRows; i++) {
        const leftCell = padEnd(leftRows[i] ?? '', leftColumn);
        const rightCell = padEnd(rightRows[i] ?? '', rightColumn);
        out.push(`${cDim(bV)}${leftCell}${cDim(bV)}${rightCell}${cDim(bV)}`);
      }
      out.push(bottomBorder);

      return out.map((line) =>
        visibleWidth(line) <= width ? line : truncateToWidth(line, width),
      );
    }
  }

  // Medium layout (single column boxed)
  if (width >= 42) {
    const boxWidth = width;
    const innerWidth = boxWidth - 2;
    const label = ` Thoth v${data.version} `;
    const lead = bH.repeat(2);
    const remainingFill = Math.max(
      0,
      boxWidth - 2 - visibleWidth(lead) - visibleWidth(label),
    );
    const topBorder = `${cDim(bTl)}${cDim(lead)}${cAccent(label)}${cDim(bH.repeat(remainingFill))}${cDim(bTr)}`;
    const bottomBorder = `${cDim(bBl)}${cDim(bH.repeat(boxWidth - 2))}${cDim(bBr)}`;

    const divider = `${cDim(bV)} ${cDim(bH.repeat(Math.max(1, innerWidth - 2)))} ${cDim(bV)}`;

    const resourceSummary = formatResourceSummary(theme, data.resources, sep);

    const content: string[] = [
      center(bold(theme, cAccent('T H O T H')), innerWidth),
      center(cText(data.model || 'pi-coding-agent'), innerWidth),
      divider,
      ...(resourceSummary
        ? [` ${cAccent(mark)} ${resourceSummary}`, divider]
        : []),
      ` ${cAccent(mark)} ${bold(theme, cAccent('Recent Sessions'))}`,
      ...buildSessionRows(theme, data.sessions, mode, innerWidth),
    ];

    const out: string[] = [topBorder];
    for (const row of content) {
      if (row === divider) {
        out.push(divider);
      } else {
        out.push(`${cDim(bV)}${padEnd(row, innerWidth)}${cDim(bV)}`);
      }
    }
    out.push(bottomBorder);

    return out.map((line) =>
      visibleWidth(line) <= width ? line : truncateToWidth(line, width),
    );
  }

  // Narrow layout (minimal text lines without outer box)
  const lines: string[] = [
    cAccent(bold(theme, `Thoth v${data.version}`)),
    cText(truncateToWidth(data.model || 'ready', width)),
  ];

  const narrowParts: string[] = [];
  if (typeof data.resources.tools === 'number') {
    narrowParts.push(`tools:${data.resources.tools}`);
  }
  if (typeof data.resources.skills === 'number') {
    narrowParts.push(`skills:${data.resources.skills}`);
  }
  if (typeof data.resources.extensions === 'number') {
    narrowParts.push(`exts:${data.resources.extensions}`);
  }
  if (narrowParts.length > 0) {
    lines.push(cDim(narrowParts.join(' ')));
  }

  if (data.sessions.length > 0) {
    const s = data.sessions[0];
    if (s) {
      lines.push(cMuted(truncateToWidth(`* ${s.name}`, width)));
    }
  }

  return lines.map((line) =>
    visibleWidth(line) <= width ? line : truncateToWidth(line, width),
  );
}
