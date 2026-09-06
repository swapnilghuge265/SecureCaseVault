"use client";

import { useTheme } from "@/components/theme-provider";

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <label className="label">Appearance</label>

      <select
        className="input"
        value={theme}
        onChange={(e) =>
          setTheme(e.target.value as "dark" | "light" | "system")
        }
      >
        <option value="dark">🌙 Dark</option>
        <option value="light">☀️ Light</option>
        <option value="system">🖥️ System</option>
      </select>

      <p className="mt-2 text-xs text-mut">
        Choose the appearance you prefer. Your choice is saved on this device.
      </p>
    </div>
  );
}