import { writable } from 'svelte/store';

// Check for saved theme preference or default to 'dark'
const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
const defaultTheme = storedTheme || 'dark';

// Create the theme store
export const themeStore = writable(defaultTheme);

// Subscribe to theme changes and update localStorage + document
themeStore.subscribe(theme => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', theme);
    
    // Update document class for theme
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    
    // Update meta theme-color for mobile browsers
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === 'dark' ? '#1a1a1a' : '#ffffff';
    }
  }
});

// Helper function to toggle theme
export function toggleTheme() {
  themeStore.update(theme => theme === 'dark' ? 'light' : 'dark');
}