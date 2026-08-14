import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import logoLight from '../../assets/swastha-logo.png';
import logoDark from '../../assets/swastha-logo-dark.png';

export default function Logo({ className = 'h-14 w-auto' }) {
  const { isDark } = useTheme();
  return <img src={isDark ? logoDark : logoLight} alt="Swastha" className={className} />;
}
