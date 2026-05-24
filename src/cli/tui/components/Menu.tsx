import { Box, Text } from 'ink';
import { theme } from '../theme';

export interface MenuItem {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
}

interface MenuProps {
  items: MenuItem[];
  selected: number;
}

export function Menu({ items, selected }: MenuProps) {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Text
          key={item.id}
          color={
            item.disabled
              ? theme.dim
              : index === selected
                ? theme.accent
                : undefined
          }
        >
          {index === selected ? '>' : ' '} {item.label}
          <Text color={theme.dim}> - {item.detail}</Text>
        </Text>
      ))}
    </Box>
  );
}
