import React from 'react';
import { motion } from 'framer-motion';
import { ROUTE_MODES } from './src/services/routing.js';

const EASE = [0.22, 1, 0.36, 1];

/** Shortest / Fastest / Balanced segmented switch (shared with the rider screen). */
export default function RouteModeSwitch({ value, onChange, className = '', dark = false }) {
  return (
    <div
      className={`flex items-center p-0.5 rounded-md shadow-float ${dark ? 'bg-slate-950' : 'bg-white'} ${className}`}
      role="radiogroup"
      aria-label="Route mode"
    >
      {ROUTE_MODES.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={m.hint}
            onClick={() => onChange?.(m.id)}
            className={`relative px-2.5 h-7 rounded-sm text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
              active ? 'text-white' : dark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {active && (
              <motion.span
                layoutId={dark ? 'route-mode-dark' : 'route-mode'}
                className="absolute inset-0 rounded-sm bg-indigo-600"
                transition={{ duration: 0.25, ease: EASE }}
              />
            )}
            <span className="relative">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
