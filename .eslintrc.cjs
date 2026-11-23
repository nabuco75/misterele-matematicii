module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react/jsx-runtime", "plugin:react-hooks/recommended"],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "18.2" } },
  plugins: ["react-refresh"],
  rules: {
    "react/jsx-no-target-blank": "off",
    // câteva fișiere exportă și un hook lângă componentă (useAuth, useStageStatus);
    // afectează doar reîncărcarea rapidă în timpul dezvoltării
    "react-refresh/only-export-components": "off",
    "max-len": "off", // Disable max-len rule
    // aplicația nu folosește PropTypes
    "react/prop-types": "off",
    // `import React` rămâne în fișierele vechi; nu e o eroare
    "no-unused-vars": ["error", { varsIgnorePattern: "^React$" }],
  },
};
