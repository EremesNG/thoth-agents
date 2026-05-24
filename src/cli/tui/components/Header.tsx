import { Box, Text } from 'ink';
import { theme } from '../theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.title}>
        thoth-agents
      </Text>
      <Text color={theme.accent}>{title}</Text>
      {subtitle ? <Text color={theme.dim}>{subtitle}</Text> : null}
    </Box>
  );
}
