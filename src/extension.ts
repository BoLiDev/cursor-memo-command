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
  category: string; // Category of the command
}

const STORAGE_KEY = "cursor-memo-commands";
// 默认分类名称
const DEFAULT_CATEGORY = "default";
// 存储分类列表的Key
const CATEGORIES_KEY = "cursor-memo-categories";

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Cursor Memo");
  outputChannel.appendLine("Cursor Memo Plugin activated");

  const storedCommands = context.globalState.get<MemoItem[]>(STORAGE_KEY, []);
  // 确保所有命令都有分类字段，如果没有则设置为默认分类
  let updatedCommands = storedCommands.map((cmd) => {
    if (!cmd.category) {
      return { ...cmd, category: DEFAULT_CATEGORY };
    }
    return cmd;
  });

  // 如果有更新，保存回全局状态
  if (JSON.stringify(storedCommands) !== JSON.stringify(updatedCommands)) {
    context.globalState.update(STORAGE_KEY, updatedCommands);
  }

  // 获取所有分类，确保至少有默认分类
  let categories = context.globalState.get<string[]>(CATEGORIES_KEY, []);
  if (!categories.includes(DEFAULT_CATEGORY)) {
    categories.push(DEFAULT_CATEGORY);
    context.globalState.update(CATEGORIES_KEY, categories);
  }

  const memoTreeProvider = new MemoTreeDataProvider(updatedCommands);

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
          category: DEFAULT_CATEGORY,
        };

        const updatedItems = [...updatedCommands, newItem];

        await context.globalState.update(STORAGE_KEY, updatedItems);

        memoTreeProvider.refresh(updatedItems);

        vscode.window.showInformationMessage("Command saved");
      }
    }
  );

  const removeCommandDisposable = vscode.commands.registerCommand(
    "cursor-memo.removeCommand",
    async (item: MemoItem) => {
      const updatedItems = updatedCommands.filter(
        (cmd: MemoItem) => cmd.id !== item.id
      );

      await context.globalState.update(STORAGE_KEY, updatedItems);

      memoTreeProvider.refresh(updatedItems);
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
        const updatedItems = updatedCommands.map((cmd: MemoItem) => {
          if (cmd.id === item.id) {
            return { ...cmd, alias };
          }
          return cmd;
        });

        await context.globalState.update(STORAGE_KEY, updatedItems);

        memoTreeProvider.refresh(updatedItems);
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
        const updatedItems = updatedCommands.map((cmd: MemoItem) => {
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

        await context.globalState.update(STORAGE_KEY, updatedItems);
        memoTreeProvider.refresh(updatedItems);
        vscode.window.showInformationMessage("Command updated");
      }
    }
  );

  // Update TreeItem view to add command context for paste
  memoTreeProvider.setCommandCallback("cursor-memo.pasteToEditor");

  /**
   * 注册获取分类列表的命令
   */
  const getCategoriesDisposable = vscode.commands.registerCommand(
    "cursor-memo.getCategories",
    () => {
      return categories;
    }
  );

  /**
   * 添加新分类的命令
   */
  const addCategoryDisposable = vscode.commands.registerCommand(
    "cursor-memo.addCategory",
    async () => {
      const categoryName = await vscode.window.showInputBox({
        placeHolder: "输入新分类名称",
        prompt: "请输入新分类的名称",
      });

      if (categoryName && categoryName.trim()) {
        // 检查分类是否已存在
        if (categories.includes(categoryName)) {
          vscode.window.showInformationMessage(`分类 "${categoryName}" 已存在`);
          return;
        }

        // 添加新分类
        categories.push(categoryName);
        await context.globalState.update(CATEGORIES_KEY, categories);

        // 刷新视图 - 这里不需要更新命令，只需要刷新视图
        memoTreeProvider.refresh(updatedCommands);
        vscode.window.showInformationMessage(`分类 "${categoryName}" 已创建`);
      }
    }
  );

  /**
   * 重命名分类的命令
   */
  const renameCategoryDisposable = vscode.commands.registerCommand(
    "cursor-memo.renameCategory",
    async (categoryItem) => {
      if (!categoryItem) return;

      const oldCategoryName = categoryItem.label;

      // 不允许重命名默认分类
      if (oldCategoryName === DEFAULT_CATEGORY) {
        vscode.window.showInformationMessage(`不能重命名默认分类`);
        return;
      }

      const newCategoryName = await vscode.window.showInputBox({
        placeHolder: "输入新分类名称",
        prompt: "请输入新分类的名称",
        value: oldCategoryName,
      });

      if (
        newCategoryName &&
        newCategoryName.trim() &&
        newCategoryName !== oldCategoryName
      ) {
        // 检查新名称是否已存在
        if (categories.includes(newCategoryName)) {
          vscode.window.showInformationMessage(
            `分类 "${newCategoryName}" 已存在`
          );
          return;
        }

        // 更新分类列表
        const index = categories.indexOf(oldCategoryName);
        if (index !== -1) {
          categories[index] = newCategoryName;
          await context.globalState.update(CATEGORIES_KEY, categories);
        }

        // 更新分类下的所有命令
        const updatedItems = updatedCommands.map((cmd) => {
          if (cmd.category === oldCategoryName) {
            return { ...cmd, category: newCategoryName };
          }
          return cmd;
        });

        await context.globalState.update(STORAGE_KEY, updatedItems);

        // 刷新视图
        memoTreeProvider.refresh(updatedItems);
        vscode.window.showInformationMessage(
          `分类已重命名为 "${newCategoryName}"`
        );
      }
    }
  );

  /**
   * 移动命令到指定分类
   */
  const moveToCategory = vscode.commands.registerCommand(
    "cursor-memo.moveToCategory",
    async (item: MemoItem) => {
      if (!item) return;

      // 准备分类列表供选择，排除当前分类
      const categoryOptions = categories.filter((cat) => cat !== item.category);

      // 如果没有其他分类，提示用户先创建分类
      if (categoryOptions.length === 0) {
        const result = await vscode.window.showInformationMessage(
          "没有可用的目标分类。要创建新分类吗？",
          "创建"
        );

        if (result === "创建") {
          vscode.commands.executeCommand("cursor-memo.addCategory");
        }

        return;
      }

      // 让用户选择目标分类
      const targetCategory = await vscode.window.showQuickPick(
        categoryOptions,
        {
          placeHolder: "选择目标分类",
        }
      );

      if (targetCategory) {
        // 更新命令的分类
        const updatedItems = updatedCommands.map((cmd) => {
          if (cmd.id === item.id) {
            return { ...cmd, category: targetCategory };
          }
          return cmd;
        });

        await context.globalState.update(STORAGE_KEY, updatedItems);

        // 刷新视图
        memoTreeProvider.refresh(updatedItems);
        vscode.window.showInformationMessage(
          `命令已移动到 "${targetCategory}"`
        );
      }
    }
  );

  /**
   * 删除分类的命令
   */
  const deleteCategoryDisposable = vscode.commands.registerCommand(
    "cursor-memo.deleteCategory",
    async (categoryItem) => {
      if (!categoryItem) return;

      const categoryName = categoryItem.label;

      // 不允许删除默认分类
      if (categoryName === DEFAULT_CATEGORY) {
        vscode.window.showInformationMessage(`不能删除默认分类`);
        return;
      }

      // 确认是否删除
      const confirmation = await vscode.window.showWarningMessage(
        `确定要删除分类 "${categoryName}" 吗？该分类下的命令将移至默认分类。`,
        { modal: true },
        "删除"
      );

      if (confirmation !== "删除") {
        return;
      }

      // 查找该分类下的所有命令
      const commandsInCategory = updatedCommands.filter(
        (cmd) => cmd.category === categoryName
      );

      // 将这些命令移动到默认分类
      if (commandsInCategory.length > 0) {
        const updatedItems = updatedCommands.map((cmd) => {
          if (cmd.category === categoryName) {
            return { ...cmd, category: DEFAULT_CATEGORY };
          }
          return cmd;
        });

        // 更新命令
        await context.globalState.update(STORAGE_KEY, updatedItems);
        updatedCommands = updatedItems;
      }

      // 从分类列表中删除该分类
      const index = categories.indexOf(categoryName);
      if (index !== -1) {
        categories.splice(index, 1);
        await context.globalState.update(CATEGORIES_KEY, categories);
      }

      // 刷新视图
      memoTreeProvider.refresh(updatedCommands);
      vscode.window.showInformationMessage(`分类 "${categoryName}" 已删除`);
    }
  );

  context.subscriptions.push(
    saveCommandDisposable,
    removeCommandDisposable,
    renameCommandDisposable,
    pasteToEditorDisposable,
    editCommandDisposable,
    addCategoryDisposable,
    renameCategoryDisposable,
    moveToCategory,
    deleteCategoryDisposable,
    treeView,
    outputChannel,
    getCategoriesDisposable
  );
}

/**
 * Extension deactivation
 */
export function deactivate() {
  vscode.window.showInformationMessage("Cursor Memo Plugin deactivated");
}
