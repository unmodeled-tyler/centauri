export type ThemeId = "dark" | "monokai" | "dracula" | "one-dark" | "catppuccin-mocha";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  /** CSS custom properties set on [data-theme] */
  variables: Record<string, string>;
  /** xterm.js terminal theme */
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
  };
}

function zincScale(scale: string[]) {
  return {
    "--color-zinc-50": scale[0],
    "--color-zinc-100": scale[1],
    "--color-zinc-200": scale[2],
    "--color-zinc-300": scale[3],
    "--color-zinc-400": scale[4],
    "--color-zinc-500": scale[5],
    "--color-zinc-600": scale[6],
    "--color-zinc-700": scale[7],
    "--color-zinc-800": scale[8],
    "--color-zinc-900": scale[9],
    "--color-zinc-950": scale[10],
  } as Record<string, string>;
}

function accentScale(scale: string[]) {
  return {
    "--color-emerald-50": scale[0],
    "--color-emerald-100": scale[1],
    "--color-emerald-200": scale[2],
    "--color-emerald-300": scale[3],
    "--color-emerald-400": scale[4],
    "--color-emerald-500": scale[5],
    "--color-emerald-600": scale[6],
    "--color-emerald-700": scale[7],
    "--color-emerald-800": scale[8],
    "--color-emerald-900": scale[9],
    "--color-emerald-950": scale[10],
  } as Record<string, string>;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  dark: {
    id: "dark",
    label: "Dark",
    variables: {},
    terminal: {
      background: "#09090b",
      foreground: "#e4e4e7",
      cursor: "#34d399",
      selectionBackground: "#3f3f46",
    },
  },

  monokai: {
    id: "monokai",
    label: "Monokai",
    variables: {
      ...zincScale([
        "#f8f8f2",  // 50
        "#f0f0e8",  // 100
        "#e6e6d6",  // 200
        "#cfcfb8",  // 300
        "#a6a68a",  // 400
        "#7e7e5c",  // 500
        "#5c5c42",  // 600
        "#3e3e2c",  // 700
        "#2a2a1c",  // 800
        "#1e1e12",  // 900
        "#18180e",  // 950
      ]),
      ...accentScale([
        "#ecfdf5",
        "#d1fae5",
        "#a7f3d0",
        "#6ee7b7",
        "#a6e22e",
        "#a6e22e",
        "#82c41e",
        "#66991a",
        "#4a6e13",
        "#334a0d",
        "#1f2e08",
      ]),
    },
    terminal: {
      background: "#272822",
      foreground: "#f8f8f2",
      cursor: "#a6e22e",
      selectionBackground: "#49483e",
    },
  },

  dracula: {
    id: "dracula",
    label: "Dracula",
    variables: {
      ...zincScale([
        "#f8f8f2",  // 50
        "#f0f0ea",  // 100
        "#e0e0d4",  // 200
        "#c5c5b4",  // 300
        "#9e9e8a",  // 400
        "#7a7a64",  // 500
        "#585842",  // 600
        "#3b3b2a",  // 700
        "#282a36",  // 800
        "#21222c",  // 900
        "#191a21",  // 950
      ]),
      ...accentScale([
        "#fdf2f8",
        "#fce7f3",
        "#fbcfe8",
        "#f9a8d4",
        "#ff79c6",
        "#ff79c6",
        "#e055a8",
        "#bd3a8a",
        "#9b286c",
        "#781b50",
        "#59103a",
      ]),
    },
    terminal: {
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#ff79c6",
      selectionBackground: "#44475a",
    },
  },

  "one-dark": {
    id: "one-dark",
    label: "One Dark",
    variables: {
      ...zincScale([
        "#abb2bf",  // 50
        "#9ba2b0",  // 100
        "#8b92a0",  // 200
        "#6d7588",  // 300
        "#545d71",  // 400
        "#404859",  // 500
        "#343a4a",  // 600
        "#2c313a",  // 700
        "#282c34",  // 800
        "#21252b",  // 900
        "#1a1d23",  // 950
      ]),
      ...accentScale([
        "#eff6ff",
        "#dbeafe",
        "#bfdbfe",
        "#93c5fd",
        "#61afef",
        "#61afef",
        "#4d9cd6",
        "#3a82bc",
        "#2867a1",
        "#1b4d87",
        "#11366b",
      ]),
    },
    terminal: {
      background: "#282c34",
      foreground: "#abb2bf",
      cursor: "#61afef",
      selectionBackground: "#3e4452",
    },
  },

  "catppuccin-mocha": {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    variables: {
      ...zincScale([
        "#cdd6f4",  // 50
        "#bac2de",  // 100
        "#a6adc8",  // 200
        "#9399b2",  // 300
        "#7f849c",  // 400
        "#6c7086",  // 500
        "#585b70",  // 600
        "#45475a",  // 700
        "#313244",  // 800
        "#1e1e2e",  // 900
        "#181825",  // 950
      ]),
      ...accentScale([
        "#f5f0fa",
        "#e8daf5",
        "#d4bef0",
        "#c0a2eb",
        "#cba6f7",
        "#cba6f7",
        "#b48fe0",
        "#9b78c9",
        "#8261b1",
        "#684a98",
        "#4e357e",
      ]),
    },
    terminal: {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#cba6f7",
      selectionBackground: "#45475a",
    },
  },
};

export const THEME_ORDER: ThemeId[] = ["dark", "monokai", "dracula", "one-dark", "catppuccin-mocha"];
