/** @format */

import * as vscode from "vscode";
import { MemoTreeDataProvider } from "./memoTreeDataProvider";

/**
 * Data structure for command memo items
 */
export interface MemoItem {
  id: string;
  label: string;
  command: string;
  timestamp: number;
  alias?: string; // Optional alias for the command
}

const STORAGE_KEY = "cursor-memo-commands";

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Cursor Memo");
  outputChannel.appendLine("Cursor Memo Plugin activated");

  const storedCommands = context.globalState.get<MemoItem[]>(STORAGE_KEY, []);

  const memoTreeProvider = new MemoTreeDataProvider(storedCommands);

  const treeView = vscode.window.createTreeView("cursorMemoPanel", {
    treeDataProvider: memoTreeProvider,
    showCollapseAll: false,
  });

  const saveCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.saveCommand",
    async () => {
      let clipboardText = "";
      try {
        clipboardText = await vscode.env.clipboard.readText();
      } catch (error) {}

      const commandText = await vscode.window.showInputBox({
        placeHolder: "Enter command to save",
        prompt: "Enter or paste the command content",
        value: clipboardText,
      });

      if (commandText) {
        const newItem: MemoItem = {
          id: Date.now().toString(),
          label:
            commandText.length > 30
              ? `${commandText.slice(0, 30)}...`
              : commandText,
          command: commandText,
          timestamp: Date.now(),
        };

        const updatedCommands = [...storedCommands, newItem];

        await context.globalState.update(STORAGE_KEY, updatedCommands);

        memoTreeProvider.refresh(updatedCommands);

        vscode.window.showInformationMessage("Command saved");
      }
    }
  );

  const removeCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.removeCommand",
    async (item: MemoItem) => {
      const updatedCommands = storedCommands.filter(
        (cmd: MemoItem) => cmd.id !== item.id
      );

      await context.globalState.update(STORAGE_KEY, updatedCommands);

      memoTreeProvider.refresh(updatedCommands);
      vscode.window.showInformationMessage("Command deleted");
    }
  );

  /**
   * Register command to rename a command (set alias)
   */
  const renameCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.renameCommand",
    async (item: MemoItem) => {
      if (!item) return;

      const alias = await vscode.window.showInputBox({
        placeHolder: "Enter new alias for the command",
        prompt: "This will change how the command appears in the list",
        value: item.alias || item.label,
      });

      if (alias !== undefined) {
        const updatedCommands = storedCommands.map((cmd: MemoItem) => {
          if (cmd.id === item.id) {
            return { ...cmd, alias };
          }
          return cmd;
        });

        await context.globalState.update(STORAGE_KEY, updatedCommands);

        memoTreeProvider.refresh(updatedCommands);
        vscode.window.showInformationMessage("Command renamed");
      }
    }
  );

  /**
   * Register command to paste directly to editor
   */
  const pasteToEditorDisposable = vscode.commands.registerCommand(
    "cursor-memo.pasteToEditor",
    async (item: MemoItem) => {
      if (!item) return;

      // Copy to clipboard
      await vscode.env.clipboard.writeText(item.command);

      // Try to focus and paste without confirmation
      await directPaste();
    }
  );

  /**
   * Focus to active editor and paste directly
   */
  async function directPaste(): Promise<void> {
    // Try to activate editor first
    await vscode.commands.executeCommand("composer.startComposerPrompt");

    // Wait a bit for the focus to happen
    setTimeout(async () => {
      // Execute paste command
      await vscode.commands.executeCommand(
        "editor.action.clipboardPasteAction"
      );
    }, 100);
  }

  /**
   * Register command to edit command content
   */
  const editCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.editCommand",
    async (item: MemoItem) => {
      if (!item) return;

      // 显示输入框让用户编辑命令内容
      const editedCommand = await vscode.window.showInputBox({
        placeHolder: "Edit command content",
        prompt: "Modify the command content",
        value: item.command,
      });

      if (editedCommand !== undefined && editedCommand !== item.command) {
        // 更新命令内容，保留其他属性
        const updatedCommands = storedCommands.map((cmd: MemoItem) => {
          if (cmd.id === item.id) {
            // 如果命令内容很长，可能需要更新标签
            const newLabel =
              editedCommand.length > 30
                ? `${editedCommand.slice(0, 30)}...`
                : editedCommand;

            return {
              ...cmd,
              command: editedCommand,
              // 如果没有自定义别名，才更新标签
              label: cmd.alias ? cmd.label : newLabel,
            };
          }
          return cmd;
        });

        await context.globalState.update(STORAGE_KEY, updatedCommands);
        memoTreeProvider.refresh(updatedCommands);
        vscode.window.showInformationMessage("Command updated");
      }
    }
  );

  // Update TreeItem view to add command context for paste
  memoTreeProvider.setCommandCallback("cursor-memo.pasteToEditor");

  context.subscriptions.push(
    saveCommandDisposable,
    removeCommandDisposable,
    renameCommandDisposable,
    pasteToEditorDisposable,
    editCommandDisposable,
    treeView,
    outputChannel
  );
}

/**
 * Extension deactivation
 */
export function deactivate() {
  vscode.window.showInformationMessage("Cursor Memo Plugin deactivated");
}
