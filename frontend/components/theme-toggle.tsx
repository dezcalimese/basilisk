"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const themes = [
    { value: "light", icon: "icon-[lucide--sun]", label: "Light" },
    { value: "dark", icon: "icon-[lucide--moon]", label: "Dark" },
    { value: "system", icon: "icon-[lucide--monitor]", label: "System" },
  ];

  return (
    <div className="glass-card rounded-full p-1 flex gap-1">
      {themes.map(({ value, icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`
            relative w-8 h-8 rounded-full transition-all duration-300 flex items-center justify-center
            ${theme === value
              ? "bg-primary text-primary-foreground shadow-lg"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            }
          `}
          title={label}
        >
          <i className={`${icon} w-4 h-4 block`} />
        </button>
      ))}
    </div>
  );
}
