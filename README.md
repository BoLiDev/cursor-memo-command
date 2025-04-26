<!-- @format -->

# Cursor Memo Plugin

A plugin for saving and reusing Cursor chat commands.

## Features

- Save frequently used Cursor chat commands
- Display command list in the sidebar
- Click on a command to copy it to clipboard for pasting into Cursor Chatbox

## Usage

1. Open Cursor editor
2. Execute the `Cursor Memo: Save Current Command` command via the command palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Enter or paste the command you want to save (input box will show clipboard content by default)
4. View saved commands in the "Command Memo" view in the sidebar
5. Click on a command to copy it to clipboard, then paste it into the Cursor Chatbox

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
vsce package
```

## License

MIT
