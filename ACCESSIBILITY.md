# Accessibility

TensorTailor should work for everyone who uses a desktop PC: with a mouse or only a keyboard, in light or dark
mode, and with a screen reader. This page says what works, what was tested, and what is not good enough yet.

## What works

- **Keyboard.** Every button, filter and tab works with the keyboard, and every control shows a clear focus ring.
  The model list is one Tab stop: the arrow keys (or `J` and `K`) move in it, `Enter` goes to the detail panel,
  and `Space` or `C` selects a model for Compare. Other keys: `/` search, `?` Help, `1` to `4` the views,
  `W` favourite, `T` light or dark, `Esc` back. The Help window lists them all.
- **Screen readers.** The list tells the screen reader which row is active and says its verdict and best file.
  Changes such as "Selected for Compare" or "Favourite" are announced too.
- **Contrast.** Text and labels meet WCAG 2.2 level AA (at least 4.5 to 1) in light and in dark mode. The edge of
  every input field, list and search box stands out at least 3 to 1 (WCAG 1.4.11) and turns the accent colour on
  focus.
- **Not by colour alone.** Verdicts are words (*Runs well*, *Won't fit* …), and the memory bar has its numbers in
  text under it.
- **Explanations.** Point at a bar, speed, verdict or score for an explanation, or press `?` for the Help window,
  which explains every label, icon and filter.

## How it was tested

Before the first public release (November 2026) every screen was checked in headless Chrome at window widths of
1180, 1280, 1366, 1600 and 1920 pixels, in light and in dark mode: text that is cut off or overlaps, contrast
measured on the real colours, and real `Tab` walks through the page for the focus order and focus rings. Tests in
`tools/` repeat the most important checks on every change. Since 2026-11-27 the page also fits a page area of 1,100
pixels, and a test checks it.

## Known limits

- **No real screen-reader test yet.** The page was not yet tested from start to end with NVDA, JAWS or Narrator.
- **Dimmed rows.** Models that *Won't fit* are shown a little faded on purpose, so the models that do fit stand
  out. Their text is below the AA contrast level.
- **Desktop only.** TensorTailor is made for a PC screen with a page area at least 1,100 pixels wide (the Chrome
  window itself is a little wider, because of its edges). In a narrower window the right edge of the page is cut
  off. Phones, tablets and touch screens are not supported.
- **Browser.** Tested in Chrome on Windows; made for Chrome and Edge. Downloads need Chrome or Edge.

## Report a barrier

Something stops you from using TensorTailor? Please open an
[accessibility issue](https://github.com/jan-stegeman/tensortailor/issues/new?template=accessibility.yml).
Say what you tried to do, what got in the way, and which browser and assistive technology (for example a screen
reader or the zoom level) you use. TensorTailor is a free project with no fixed time for an answer, but barriers
get priority over new features.
