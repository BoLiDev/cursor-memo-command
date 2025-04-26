/** @format */

import * as vscode from "vscode";
import { MemoTreeDataProvider } from "./memoTreeDataProvider";

/**
 * 指令备忘录项目的数据结构
 */
export interface MemoItem {
  id: string;
  label: string;
  command: string;
  timestamp: number;
}

const STORAGE_KEY = "cursor-memo-commands";

/**
 * 扩展激活时执行
 */
export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Cursor Memo");
  outputChannel.appendLine("Cursor Memo Plugin 已激活");

  const storedCommands = context.globalState.get<MemoItem[]>(STORAGE_KEY, []);
  const memoTreeProvider = new MemoTreeDataProvider(storedCommands);
  const treeView = vscode.window.createTreeView("cursorMemoPanel", {
    treeDataProvider: memoTreeProvider,
    showCollapseAll: false,
  });

  const saveCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.saveCommand",
    async () => {
      const commandText = await vscode.window.showInputBox({
        placeHolder: "输入要保存的指令",
        prompt: "输入或粘贴要保存的指令内容",
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
        vscode.window.showInformationMessage("指令已保存");
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
      vscode.window.showInformationMessage("指令已删除");
    }
  );

  treeView.onDidChangeSelection(
    async (e: vscode.TreeViewSelectionChangeEvent<any>) => {
      const selectedItems = e.selection;
      if (selectedItems.length > 0) {
        const item = selectedItems[0] as MemoItem;
        await vscode.env.clipboard.writeText(item.command);
        vscode.window.showInformationMessage(
          "指令已复制到剪贴板，请手动粘贴到 Cursor Chatbox"
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

export function deactivate() {
  vscode.window.showInformationMessage("Cursor Memo Plugin 已停用");
}
