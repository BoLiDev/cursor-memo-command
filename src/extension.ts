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

  treeView.onDidChangeSelection(
    async (e: vscode.TreeViewSelectionChangeEvent<any>) => {
      const selectedItems = e.selection;
      if (selectedItems.length > 0) {
        const item = selectedItems[0] as MemoItem;
        await vscode.env.clipboard.writeText(item.command);
        vscode.window.showInformationMessage(
          "Command copied to clipboard, please paste it manually to Cursor Chatbox"
        );
      }
    }
  );

  context.subscriptions.push(
    saveCommandDisposable,
    removeCommandDisposable,
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
