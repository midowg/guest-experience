/* Main WAM theme: tokens and the theme root. Docs: docs/main-wam/KIT.md §Tema. */
export { MainWamTheme, type MainWamMode } from "./MainWamTheme";
export { MainWamModeSetting, applyMainWamMode } from "./MainWamModeSetting";
export { MainWamMotionSwitch, applyMainWamMotion } from "./MainWamMotionSetting";
export {
  DEFAULT_THEME, DISPLAY_FONTS, resolveTheme, themeVars, contrast, normalizeHex, safeImageUrl, readableOn, PAGE_COLORS, mainWamThemeColor,
  type MainWamThemeInput, type ResolvedTheme, type ThemeColors, type ThemeImages, type DisplayFont,
} from "./tokens";
