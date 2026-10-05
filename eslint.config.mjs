import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  // ── Accessibility ─────────────────────────────────────────────────────────
  // eslint-config-next only enables 6 jsx-a11y rules (ARIA validity + img alt),
  // all at warning level. This block adds the keyboard / label / role rules that
  // actually catch regressions in those areas.
  //
  // Severity is deliberately WARNING so `npm run lint` still exits 0 — these are
  // a signal, not a build gate. Complementary, not overlapping, with
  // scripts/audit-a11y.mjs (npm run audit:a11y), which covers what static lint
  // cannot express: computed contrast ratios, page zoom, landmarks, focus order,
  // aria-current, reduced motion and bottom-bar clearance.
  //
  // The `jsx-a11y` plugin itself is registered by nextCoreWebVitals above and
  // must NOT be registered again here — flat config rejects a second
  // registration with "Cannot redefine plugin". Rules resolve against the merged
  // config for each file instead.
  //
  // `controlComponents` is required because jsx-a11y cannot resolve a custom
  // component to the DOM control it renders (Input, Switch, RadioGroupItem, …);
  // without it every correctly-wrapped label is reported as unassociated.
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "jsx-a11y/click-events-have-key-events": 1,
    "jsx-a11y/mouse-events-have-key-events": 1,
    "jsx-a11y/no-static-element-interactions": 1,
    "jsx-a11y/interactive-supports-focus": 1,
    "jsx-a11y/anchor-is-valid": 1,
    "jsx-a11y/heading-has-content": 1,
    "jsx-a11y/aria-role": 1,
    "jsx-a11y/no-aria-hidden-on-focusable": 1,
    "jsx-a11y/no-noninteractive-tabindex": 1,
    "jsx-a11y/tabindex-no-positive": 1,
    "jsx-a11y/no-redundant-roles": 1,
    "jsx-a11y/html-has-lang": 1,
    "jsx-a11y/lang": 1,
    "jsx-a11y/iframe-has-title": 1,
    "jsx-a11y/no-distracting-elements": 1,
    "jsx-a11y/media-has-caption": 1,
    "jsx-a11y/autocomplete-valid": 1,
    "jsx-a11y/label-has-associated-control": [1, {
      assert: "either",
      controlComponents: [
        "Input", "Textarea", "Select", "Switch", "Checkbox",
        "RadioGroupItem", "InputOtp", "Calendar", "Slider",
      ],
    }],
    // `cell`/`row`/`columnheader` are layout, not controls — a printed count
    // sheet must not be told to label every <td>/<th>. Both spellings are set
    // because jsx-a11y's implicit-role mapping for table cells varies by version.
    "jsx-a11y/control-has-associated-label": [1, {
      ignoreElements: ["td", "th", "tr"],
      ignoreRoles: ["cell", "row", "columnheader", "rowheader", "table"],
    }],
  },
}, {
  ignores: ["node_modules/**", ".next/**", ".kilo/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills/**"]
}];

export default eslintConfig;
