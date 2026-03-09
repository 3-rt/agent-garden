export interface GardenTheme {
  id: string;
  name: string;
  groundLight: number;
  groundDark: number;
  pathColor: number;
  backgroundColor: string;
  signColors: Record<string, number>;
  plantStemColor: number;
  labelColor: string;
  titleColor: string;
  dividerColor: number;
}

const THEMES: Record<string, GardenTheme> = {
  garden: {
    id: 'garden',
    name: 'Classic Garden',
    groundLight: 0x2d5a27,
    groundDark: 0x306b2b,
    pathColor: 0x8b7355,
    backgroundColor: '#2d5a27',
    signColors: { frontend: 0x1565c0, backend: 0x388e3c, tests: 0xf57c00 },
    plantStemColor: 0x4caf50,
    labelColor: '#c8e6c9',
    titleColor: '#7cb342',
    dividerColor: 0x4a7c59,
  },
  desert: {
    id: 'desert',
    name: 'Desert Oasis',
    groundLight: 0xc2a645,
    groundDark: 0xb89b3e,
    pathColor: 0x8b6914,
    backgroundColor: '#c2a645',
    signColors: { frontend: 0xcc5500, backend: 0x886633, tests: 0xaa4400 },
    plantStemColor: 0x6d8c4e,
    labelColor: '#f5deb3',
    titleColor: '#daa520',
    dividerColor: 0x9e8c6c,
  },
  zen: {
    id: 'zen',
    name: 'Zen Garden',
    groundLight: 0xd5cfc1,
    groundDark: 0xccc5b5,
    pathColor: 0x9e9687,
    backgroundColor: '#d5cfc1',
    signColors: { frontend: 0x5c7a5a, backend: 0x6b6b6b, tests: 0x8b6b4a },
    plantStemColor: 0x5c7a5a,
    labelColor: '#4a4a4a',
    titleColor: '#5c7a5a',
    dividerColor: 0xb0a898,
  },
  underwater: {
    id: 'underwater',
    name: 'Underwater',
    groundLight: 0x1a4a5e,
    groundDark: 0x1e5570,
    pathColor: 0x2a6a7a,
    backgroundColor: '#1a4a5e',
    signColors: { frontend: 0x00acc1, backend: 0x0097a7, tests: 0x00838f },
    plantStemColor: 0x26a69a,
    labelColor: '#b2ebf2',
    titleColor: '#4dd0e1',
    dividerColor: 0x2a8a9a,
  },
  space: {
    id: 'space',
    name: 'Space Station',
    groundLight: 0x1a1a2e,
    groundDark: 0x16162a,
    pathColor: 0x2a2a4e,
    backgroundColor: '#1a1a2e',
    signColors: { frontend: 0x7c4dff, backend: 0x448aff, tests: 0xff6e40 },
    plantStemColor: 0x7c4dff,
    labelColor: '#b0bec5',
    titleColor: '#7c4dff',
    dividerColor: 0x3a3a5e,
  },
};

export class ThemeManager {
  private _currentTheme: GardenTheme = THEMES.garden;
  private _listeners: Array<(theme: GardenTheme) => void> = [];

  get current(): GardenTheme {
    return this._currentTheme;
  }

  get themeId(): string {
    return this._currentTheme.id;
  }

  static getAvailableThemes(): { id: string; name: string }[] {
    return Object.values(THEMES).map(t => ({ id: t.id, name: t.name }));
  }

  setTheme(id: string) {
    const theme = THEMES[id];
    if (!theme) return;
    this._currentTheme = theme;
    for (const listener of this._listeners) {
      listener(theme);
    }
  }

  onChange(listener: (theme: GardenTheme) => void) {
    this._listeners.push(listener);
  }

  removeListener(listener: (theme: GardenTheme) => void) {
    this._listeners = this._listeners.filter(l => l !== listener);
  }
}
