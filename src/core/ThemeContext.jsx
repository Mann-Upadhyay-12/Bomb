import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const BG_COLOR_KEY = 'bombvision_bg_color';
export const BG_IMAGE_KEY = 'bombvision_bg_image';
export const THEME_KEY = 'bombvision_theme';
export const DEFAULT_BG_COLOR = '#13151A';

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  const [bgColor, setBgColorState] = useState(() => {
    try {
      return localStorage.getItem(BG_COLOR_KEY) || DEFAULT_BG_COLOR;
    } catch (e) {
      return DEFAULT_BG_COLOR;
    }
  });

  const [bgImage, setBgImageState] = useState(() => {
    try {
      return localStorage.getItem(BG_IMAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // If background color is at default or matches standard theme, remove inline override so theme CSS takes effect
    if (!bgColor || bgColor === DEFAULT_BG_COLOR || bgColor === '#EDE6D6' || bgColor === '#13151A') {
      document.documentElement.style.removeProperty('--paper');
      document.body.style.backgroundColor = '';
    } else {
      document.documentElement.style.setProperty('--paper', bgColor);
      document.body.style.backgroundColor = bgColor;
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }, [theme, bgColor]);

  useEffect(() => {
    if (!bgImage) {
      document.body.style.backgroundImage = '';
    } else {
      document.body.style.backgroundImage = `url("${bgImage}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    }
    try {
      localStorage.setItem(BG_IMAGE_KEY, bgImage);
    } catch (e) {}
  }, [bgImage]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'parchment' ? 'dark' : 'parchment'));
  };

  const setTheme = (t) => setThemeState(t);
  const setBgColor = (c) => setBgColorState(c);
  const setBgImage = (url) => setBgImageState(url);

  return (
    <ThemeContext.Provider value={{
      theme,
      isDark: theme !== 'parchment',
      toggleTheme,
      setTheme,
      bgColor,
      setBgColor,
      bgImage,
      setBgImage
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
