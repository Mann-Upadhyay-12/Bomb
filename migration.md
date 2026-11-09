# React + JSX Unified Architecture Migration Guide

This document describes the migrated architecture of the Bomb Vision multi-module solver application, covering component APIs, per-module layout rules, and instructions for authoring new modules.

---

## 1. Target Layout Order

Every puzzle module strictly follows the unified 4-tier layout (top to bottom):

1. **Input Area (`<ModuleInput />`)**:
   - Holds the common controls row (`COPY ON DECODE`, `PARCHMENT / DARK`, `CLEAR`, plus module-specific buttons).
   - Holds `<Dropzone />` (if the module accepts screenshots/GIFs).
   - Holds `<PreviewRow />` (thumbnail and resolution metadata of uploaded images).
   - Holds module-specific configuration inputs (e.g. word lists, text inputs, edge condition toggles).
2. **Answer Section (`<AnswerPanel />`)**:
   - The primary solved answer(s) rendered in stamp style.
   - Clicking the panel copies the formatted result directly to clipboard.
   - Displays real-time statistics and hint instructions.
3. **Copy-Paste Section (`<CopyLines />`)**:
   - A horizontal row of individual copy buttons directly below the answer.
   - Wraps cleanly on mobile/narrow viewports.
   - Provides granular copy items (e.g., individual safe cells, full answer strings, frequency, moves).
4. **Working Section (`<WorkingPanel />`)**:
   - A collapsible container displaying the module's internal calculation or interactive canvas/grid.
   - Rendered strictly via each module's own `working.jsx`.

---

## 2. Shared Component API Reference

All shared components reside in `src/core/components/` with companion styles in `src/styles/components/`.

### `<ModuleLayout />`
Enforces the mandatory 4-tier layout structure.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `input` | `ReactNode` | The input section (typically `<ModuleInput />`). |
| `answers` | `ReactNode` | The answer section (typically `<AnswerPanel />`). |
| `copylines` | `ReactNode` | The copy buttons section (typically `<CopyLines />`). |
| `working` | `ReactNode` | The working panel (typically `<WorkingPanel />`). |
| `children` | `ReactNode` | Optional extra elements. |

```jsx
<ModuleLayout
  input={<ModuleInput ... />}
  answers={<AnswerPanel ... />}
  copylines={<CopyLines ... />}
  working={<WorkingPanel ... />}
/>
```

---

### `<ModuleInput />`
Standardized wrapper for dropzones and controls. Automatically wires up `COPY ON DECODE` and theme switching hooks.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `dropzone` | `ReactNode` | Dropzone element (`<Dropzone ... />`) or `null`. |
| `preview` | `ReactNode` | Image preview thumbnail element or `null`. |
| `controls` | `ReactNode` | Additional module buttons (e.g. `clear`, `sample`, etc.). |
| `children` | `ReactNode` | Custom configuration fields placed directly below dropzone. |

---

### `<AnswerPanel />`
Standardized answer display panel matching the classic heist stamp aesthetic.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `label` | `string` | Header eyebrow label (e.g. `'GUARANTEED SAFE SQUARES'`). |
| `stats` | `string` | Secondary stats line (e.g. `'NEW: 3 | TOTAL: 12'`). |
| `answers` | `string \| string[]` | Array of answers rendered as tags, or single string. |
| `placeholder`| `string` | Text to display when no answers are resolved yet. |
| `copyValue` | `string` | The exact string copied to clipboard when clicked. |

---

### `<CopyLines />`
Horizontal row of copy buttons utilizing `useClipboard`.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `items` | `Array<{ label: string, value: string, toast?: string }>` | List of copy button items. |

```jsx
<CopyLines
  items={[
    { label: 'COPY ALL SAFE (4)', value: 'A1 B2 C3 D4' },
    { label: 'A1', value: 'A1' }
  ]}
/>
```

---

### `<WorkingPanel />`
Standardized container for the module's working/explanation logic.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `title` | `string` | Header text describing the working area. |
| `legend` | `ReactNode` | Optional legend elements displayed in the header. |
| `collapsible` | `boolean` | Allows user to collapse the panel (default `true`). |
| `defaultExpanded` | `boolean` | Initial expanded state (default `true`). |
| `children` | `ReactNode` | Module-specific working UI from `working.jsx`. |

---

### `<Dropzone />`
Handles drag & drop, file picker selection, and window/element paste events.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `onImage` | `(img, dataUri, fileBlob) => void` | Invoked with HTMLImageElement, preview data URI, and Blob. |
| `onFiles` | `(files: FileList \| File[]) => void` | Optional multi-file handler (e.g. Diagram). |
| `multiple` | `boolean` | Whether multi-file picking is enabled (default `false`). |
| `icon` | `string` | Dropzone emoji/icon banner. |
| `title` | `string` | Primary prompt text. |
| `sub` | `ReactNode` | Subtitle instructions. |

---

## 3. Core Hooks & Providers

* `useAppState()`: Accesses `appMode`, `copyOnDecode`, `prefixHash`, `lastCopyString`, and `lastImg`.
* `useTheme()`: Accesses `theme`, `isDark`, `toggleTheme`, `bgColor`, `setBgColor`, `bgImage`, `setBgImage`.
* `useToast()`: Accesses `showToast(msg)` to display floating notifications.
* `useClipboard()`: Provides `copy(text, toastMsg)` with `# ` prefixing support and fallback copy handling.

---

## 4. Per-Module Directory Convention

Every module in `src/modules/<name>/` strictly conforms to:

```
src/modules/<name>/
  ├── index.jsx      // Wiring only: Input -> Solver/Vision -> <ModuleLayout ... />
  ├── working.jsx    // Module's internal logic / interactive grid / canvas
  └── <name>Solver.js / <name>Vision.js // Pure logic, untouched
```

- **`index.jsx`**: Manages state (inputs, results, image blobs) and exports the module definition object:
  ```js
  export const exampleModule = {
    id: 'example',
    tabId: 'tabExample',
    tabLabel: '💡 EXAMPLE',
    eyebrow: 'EXAMPLE SOLVER',
    title: 'Example Vision',
    sub: 'Description of the solver.',
    Component: ExampleModule
  };
  ```
- **`working.jsx`**: Pure presentation of the calculation, board, or waveform. No business logic or state lifting.

---

## 5. Recipe: How to Add a New Module

To add a new puzzle module to Bomb Vision:

1. **Step 1: Write the Solver & Vision logic**
   - Create pure JS logic in `src/modules/<name>/<name>Solver.js` (and `<name>Vision.js` if image-based).
   - Ensure it returns plain data structures (objects, arrays) and performs no DOM manipulation.

2. **Step 2: Create `working.jsx`**
   - Create `src/modules/<name>/working.jsx`.
   - Render the internal grid, canvas, or step breakdown using props passed from `index.jsx`.

3. **Step 3: Create `index.jsx` using `<ModuleLayout />`**
   - Create `src/modules/<name>/index.jsx`.
   - Wire input $\rightarrow$ solver $\rightarrow$ `<ModuleLayout />`:
     - Slots: `input={<ModuleInput ... />}`, `answers={<AnswerPanel ... />}`, `copylines={<CopyLines ... />}`, `working={<WorkingPanel ... />}`.
   - Export `<Name>Module` component and module metadata object.

4. **Step 4: Register the Module in the Router & App**
   - In `src/core/ModeRouter.jsx`: Add module descriptor to `MODULE_REGISTRY`.
   - In `src/App.jsx`: Import the module, add to `moduleMeta`, and add a `case` in `renderCurrentModule()`.
   - In `src/main.jsx`: Import module CSS if applicable (`./styles/modules/<name>.css`).
