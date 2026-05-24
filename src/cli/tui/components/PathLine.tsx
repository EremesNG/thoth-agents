import { Box, Text } from 'ink';
import { theme } from '../theme';

export function wrapTerminalText(text: string, width = 74): string[] {
  if (text.length <= width) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + width));
    cursor += width;
  }
  return chunks;
}

interface PathLineProps {
  label?: string;
  value: string;
  width?: number;
}

export function PathLine({ label, value, width }: PathLineProps) {
  const lines = wrapTerminalText(value, width);
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={line} color={theme.dim}>
          {index === 0 ? `${label ? `${label}: ` : ''}${line}` : `  ${line}`}
        </Text>
      ))}
    </Box>
  );
}
