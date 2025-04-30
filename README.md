<!-- @format -->

# Cursor Memo Plugin

A plugin for saving and reusing Cursor chat commands.

## Features

- Save frequently used Cursor chat commands
- Display command list in the sidebar
- Click on a command to directly copy and paste it into Cursor Chatbox
- Right-click menu options for managing commands:
  - Rename commands (set custom aliases for better readability)
  - Delete commands
  - Move commands between categories
- Import and export commands:
  - Export all your commands and categories to a JSON file
  - Import commands and categories from a JSON file
  - Automatic deduplication during import

## Usage

1. Open Cursor editor
2. Execute the `Cursor Memo: Save Current Command` command via the command palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Enter or paste the command you want to save (input box will show clipboard content by default)
4. View saved commands in the "Command Memo" view in the sidebar
5. **Single-click** on a command to:
   - Automatically copy it into Cursor Chatbox
6. **Right-click** on a command to access additional options:
   - Rename (set a custom alias/display name)
   - Delete

### Import and Export

1. To export your commands, click the export icon in the Command Memo view title bar
   - A file save dialog will open allowing you to choose where to save the JSON file
   - Choose a location and filename, then click "Export"
2. To import commands, click the import icon in the Command Memo view title bar
   - A file open dialog will appear - select a previously exported JSON file
   - Commands and categories will be imported with automatic deduplication

## Development

### Setup

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch
```

### Testing the Extension

Press F5 to start a debugging session, which will open a new VS Code window with the extension loaded.

### Packaging the Extension

```bash
# Install vsce tool
npm install -g vsce

# Package the extension
npm run package
```

Once packaged, the extension will be located in root directory, right click on the extension file and select `Install Extension VSIX` to install it.

## License

MIT
