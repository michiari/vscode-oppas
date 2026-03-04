# OPPAS Language Support

[![Version](https://img.shields.io/badge/version-0.0.8-blue.svg)](https://github.com/michiari/vscode-oppas)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

OPPAS Language Support adds simple syntax highlighting and validation for the MiniProb probabilistic programming language in Visual Studio Code.

---

## Installation

To install from a local VSIX:

```bash
code --install-extension path/to/oppas-<version>.vsix
```

Reload VS Code to activate the extension.

---

## File Extension

This extension recognizes files with the `.pomc` extension as MiniProb programs.

---

## Validation

Open a `.pomc` file; the extension underlines syntax errors and shows validation messages in the **Problems** panel (`Ctrl+Shift+M` / `⇧⌘M`).

---

## Development

### Building the Extension

To build the extension from source:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run production
   ```
   This will generate the Langium grammar, compile TypeScript, run linting, and patch the TextMate grammar.

### Debugging the Extension

When developing and debugging the extension:

If you changed `src/language/mini-prob.langium`, regenerate artifacts before building:

```bash
npm run langium:generate
```

1. **Build for development:**
   ```bash
   npm run build
   ```

2. **Or use watch mode** (recommended for active development):
   ```bash
   npm run watch
   ```
   Watch mode automatically recompiles changes whenever you save a file.

3. **Run the extension:**
   - Press `F5` or use the "Run Extension" debug configuration
   - A new VS Code window will launch with your extension loaded
   - If already running, reload the extension host window (`Ctrl+R` / `Cmd+R`)

**Note:** The debug configuration runs from the compiled `out/` directory, not from the .vsix package. Always build or use watch mode before debugging to see your latest changes.

### Creating a .vsix Package

To create a .vsix extension file that can be installed in VS Code:

```bash
npx vsce package
```

This will generate a `oppas-<version>.vsix` file in the root directory.

### Installing the Local Extension

Install the generated .vsix file using:

```bash
code --install-extension oppas-<version>.vsix
```

Alternatively, in VS Code:
1. Open the Extensions view (`Ctrl+Shift+X`)
2. Click the "..." menu at the top
3. Select "Install from VSIX..."
4. Choose the generated `.vsix` file

---

## Contributing

Contributions are welcome! Please open issues for bug reports or pull requests against the `main` branch.

---

## License

This project is licensed under the [MIT License](LICENSE).
