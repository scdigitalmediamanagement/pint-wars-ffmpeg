/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#173A4F',
    tint: '#D98B3A',

    // Core surfaces
    background: '#F6F1E8',
    foreground: '#173A4F',

    // Cards / elevated surfaces
    card: '#FFFDF9',
    cardForeground: '#173A4F',

    // Primary action color (buttons, links, active states)
    primary: '#173A4F',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E7DED0',
    secondaryForeground: '#173A4F',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EDE5D9',
    mutedForeground: '#6F6A61',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#D98B3A',
    accentForeground: '#FFFDF9',

    // Destructive actions (delete, error states)
    destructive: '#B94A3A',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#D9CCBA',
    input: '#D9CCBA',
  },

  dark: {
    text: '#FFFDF9',
    tint: '#F0AA5C',
    background: '#132B39',
    foreground: '#FFFDF9',
    card: '#1B394A',
    cardForeground: '#FFFDF9',
    primary: '#F0AA5C',
    primaryForeground: '#132B39',
    secondary: '#2A4A5C',
    secondaryForeground: '#FFFDF9',
    muted: '#234354',
    mutedForeground: '#B8C4C7',
    accent: '#F0AA5C',
    accentForeground: '#132B39',
    destructive: '#E27462',
    destructiveForeground: '#132B39',
    border: '#3D5B68',
    input: '#3D5B68',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
