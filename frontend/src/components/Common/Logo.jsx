import React from 'react';
import logo from '../../assets/swastha-logo.png';

export default function Logo({ className = 'h-14 w-auto' }) {
  return <img src={logo} alt="Swastha" className={className} />;
}
