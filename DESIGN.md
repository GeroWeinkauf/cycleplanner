# CyclePlanner Design System

This document defines the visual design language used throughout the application.
All future UI work should follow these conventions to maintain consistency.

## Inspiration

The design is inspired by modern tools like **Linear.app**, **Vercel Dashboard**, and
**Notion**. Key principles:

- **Clean & minimal** — no unnecessary decoration
- **High information density** — compact but readable
- **Clear hierarchy** — color, weight, and size guide the eye
- **Subtle interactions** — hover states, smooth transitions
- **Dark-ready** — semantic color tokens enable future dark mode

## Framework

- **Tailwind CSS 4** for all styling
- No custom CSS files — everything via Tailwind utility classes
- Class order convention: layout → sizing → spacing → colors → typography → borders → effects → transitions

## Color Tokens

| Token | Tailwind Class | Usage |
|---|---|---|
| Primary | `blue-600` | Active elements, accents, links |
| Primary light | `blue-50` | Active backgrounds |
| Text primary | `gray-900` | Headings |
| Text secondary | `gray-700` | Body text |
| Text muted | `gray-500` | Labels, secondary info |
| Text subtle | `gray-400` | Placeholders, disabled |
| Border | `gray-200` | Card borders, dividers |
| Border light | `gray-100` | Subtle separators |
| Background | `white` / `gray-50` | Cards / page background |
| Success | `green-500/700` | Valhalla status, positive metrics |
| Danger | `red-500/600` | Errors, warnings |
| Warning | `amber-500/600` | Contradictions, blocked segments |
| Surface (Asphalt) | `green-400` | Surface distribution bar |
| Surface (Gravel) | `amber-500` | Surface distribution bar |
| Surface (Dirt) | `orange-600` | Surface distribution bar |

## Typography Scale

| Size | Class | Usage |
|---|---|---|
| `10px` | `text-[10px]` | Meta info, badges, secondary labels |
| `11px` | `text-[11px]` | Body text in compact panels |
| `12px` | `text-xs` | Labels, section headers |
| `13px` | `text-sm` | Values, metrics |
| `14px` | `text-base` | App title, major headings |
| — | `font-semibold` | Section headers |
| — | `font-bold` | Key values, app title |
| — | `font-medium` | Interactive elements |
| — | `tracking-tight` | App title |
| — | `tracking-wide` | Uppercase section labels |
| — | `uppercase` | Section headers |

## Spacing Scale

| Value | Class | Usage |
|---|---|---|
| `4px` (`1`) | `p-1`, `gap-1` | Tight icon padding, small gaps |
| `6px` (`1.5`) | `p-1.5`, `gap-1.5` | Compact button padding |
| `8px` (`2`) | `p-2`, `gap-2` | Standard card padding, grid gaps |
| `12px` (`3`) | `p-3`, `px-3` | Section padding |
| `16px` (`4`) | `p-4`, `px-4` | Header padding |

## Component Patterns

### Cards / Sections
```
<div className="px-3 py-2 border-t border-gray-200">
  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
    SECTION TITLE
  </div>
  ... content ...
</div>
```

### Buttons (Primary)
```
<button className="rounded bg-blue-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors">
  Label
</button>
```

### Buttons (Secondary)
```
<button className="rounded bg-white border border-gray-200 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
  Label
</button>
```

### Input Fields
```
<input className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20" />
```

### Metric Cards
```
<div className="rounded bg-blue-50 px-2 py-1.5">
  <div className="text-[10px] text-gray-500">Label</div>
  <div className="text-sm font-bold text-blue-700">Value</div>
</div>
```

### Status Indicators
```
<div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
  <div className="h-2 w-2 rounded-full bg-green-500" />
  <span className="text-green-700">Status text</span>
</div>
```

## Layout Principles

1. **Sidebar**: `w-72`, `bg-gray-50/80`, `backdrop-blur`, `border-r border-gray-200`
2. **Sections separated** by `border-t border-gray-200` or `divide-y divide-gray-200`
3. **Two-column grids**: `grid grid-cols-2 gap-2` for metric pairs
4. **Progress bars**: `h-3 rounded-full bg-gray-200 overflow-hidden` with colored child divs
5. **Hover feedback**: Always provide `hover:bg-gray-50` on interactive elements

## Future Iterations

When adding new features:
- Use the color tokens defined above
- Follow the spacing scale
- Match the typography scale
- Use the component patterns as templates
- Add new tokens here if needed
