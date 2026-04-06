import { Anchor, Container, Group, Text } from '@mantine/core';
import { IconChartHistogram } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ColorSchemeSwitch } from './ColorSchemeSwitch.tsx';
import classes from './Header.module.css';

export function Header(): ReactNode {
  return (
    <header className={classes.header}>
      <Container size="md" className={classes.inner}>
        <Text size="xl" fw={700}>
          <IconChartHistogram size={30} className={classes.icon} />
          Prosperity 4
        </Text>

        <Group gap="md">
          <Anchor component={NavLink} to="/" fw={500} size="sm">
            Monte Carlo
          </Anchor>
          <Anchor component={NavLink} to="/submission" fw={500} size="sm">
            Submission Analyzer
          </Anchor>
          <ColorSchemeSwitch />
        </Group>
      </Container>
    </header>
  );
}
