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

// 存储键，用于在 globalState 中保存数据
const STORAGE_KEY = "cursor-memo-commands";

/**
 * 扩展激活时执行
 */
export function activate(context: vscode.ExtensionContext) {
  // 使用 VS Code 输出通道记录日志，而不是 console
  const outputChannel = vscode.window.createOutputChannel("Cursor Memo");
  outputChannel.appendLine("Cursor Memo Plugin 已激活");

  // 从存储中获取指令列表，如果没有则初始化为空数组
  const storedCommands = context.globalState.get<MemoItem[]>(STORAGE_KEY, []);

  // 创建 TreeView 数据提供者
  const memoTreeProvider = new MemoTreeDataProvider(storedCommands);

  // 注册 TreeView
  const treeView = vscode.window.createTreeView("cursorMemoPanel", {
    treeDataProvider: memoTreeProvider,
    showCollapseAll: false,
  });

  // 注册保存当前指令的命令
  const saveCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.saveCommand",
    async () => {
      // 由于无 API 直接获取 Chatbox 内容，我们需要用户手动输入或从剪贴板获取
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

        // 添加到列表
        const updatedCommands = [...storedCommands, newItem];

        // 保存到存储
        await context.globalState.update(STORAGE_KEY, updatedCommands);

        // 刷新 TreeView
        memoTreeProvider.refresh(updatedCommands);

        vscode.window.showInformationMessage("指令已保存");
      }
    }
  );

  // 注册删除指令的命令
  const removeCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.removeCommand",
    async (item: MemoItem) => {
      const updatedCommands = storedCommands.filter(
        (cmd: MemoItem) => cmd.id !== item.id
      );

      // 保存到存储
      await context.globalState.update(STORAGE_KEY, updatedCommands);

      // 刷新 TreeView
      memoTreeProvider.refresh(updatedCommands);

      vscode.window.showInformationMessage("指令已删除");
    }
  );

  // 注册点击树项的事件处理
  treeView.onDidChangeSelection(
    async (e: vscode.TreeViewSelectionChangeEvent<any>) => {
      const selectedItems = e.selection;
      if (selectedItems.length > 0) {
        const item = selectedItems[0] as MemoItem;

        // 复制到剪贴板
        await vscode.env.clipboard.writeText(item.command);

        vscode.window.showInformationMessage(
          "指令已复制到剪贴板，请手动粘贴到 Cursor Chatbox"
        );
      }
    }
  );

  // 将命令和视图注册到扩展上下文
  context.subscriptions.push(
    saveCommandDisposable,
    removeCommandDisposable,
    treeView,
    outputChannel
  );
}

// 扩展停用时执行
export function deactivate() {
  // 使用 VS Code 信息提示，而不是 console
  vscode.window.showInformationMessage("Cursor Memo Plugin 已停用");
}
