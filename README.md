# MiniProb Language Support

[![Version](https://img.shields.io/badge/version-0.0.7-blue.svg)](https://github.com/e12224207/miniprob)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

MiniProb Language Support adds simple syntax highlighting and validation for the MiniProb probabilistic programming language in Visual Studio Code.

---

## Installation

To install from a local VSIX:

```bash
code --install-extension path/to/mini-prob-<version>.vsix
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

### Creating a .vsix Package

To create a .vsix extension file that can be installed in VS Code:

```bash
npx vsce package
```

This will generate a `mini-prob-<version>.vsix` file in the root directory.

### Installing the Local Extension

Install the generated .vsix file using:

```bash
code --install-extension mini-prob-<version>.vsix
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
