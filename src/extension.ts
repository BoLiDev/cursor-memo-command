/** @format */

import * as vscode from "vscode";
import { MemoTreeDataProvider } from "./memoTreeDataProvider";
import { MemoDataService, MemoItem } from "./memoDataService";

/**
 * Extension activation function
 * Called by VSCode when the extension is activated
 * Initializes data service, tree view, and various commands
 * @param context VSCode extension context for registering commands and storing state
 */
export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Cursor Memo");
  outputChannel.appendLine("Cursor Memo Plugin activated");

  const dataService = new MemoDataService(context);
  dataService
    .initialize()
    .then(() => {
      const memoTreeProvider = new MemoTreeDataProvider(dataService);

      const treeView = vscode.window.createTreeView("cursorMemoPanel", {
        treeDataProvider: memoTreeProvider,
        showCollapseAll: false,
      });

      const saveCommandDisposable = vscode.commands.registerCommand(
        "cursor-memo.saveCommand",
        async () => {
          try {
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
              await dataService.addCommand(commandText);
              memoTreeProvider.updateView();
              vscode.window.showInformationMessage("Command saved");
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error saving command: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      const removeCommandDisposable = vscode.commands.registerCommand(
        "cursor-memo.removeCommand",
        async (item: MemoItem) => {
          try {
            if (!item) return;

            const success = await dataService.removeCommand(item.id);

            if (success) {
              memoTreeProvider.updateView();
              vscode.window.showInformationMessage("Command deleted");
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error removing command: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      const renameCommandDisposable = vscode.commands.registerCommand(
        "cursor-memo.renameCommand",
        async (item: MemoItem) => {
          try {
            if (!item) return;

            const alias = await vscode.window.showInputBox({
              placeHolder: "Enter new alias for the command",
              prompt: "This will change how the command appears in the list",
              value: item.alias || item.label,
            });

            if (alias !== undefined) {
              const success = await dataService.renameCommand(item.id, alias);

              if (success) {
                memoTreeProvider.updateView();
                vscode.window.showInformationMessage("Command renamed");
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error renaming command: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      const pasteToEditorDisposable = vscode.commands.registerCommand(
        "cursor-memo.pasteToEditor",
        async (item: MemoItem) => {
          try {
            if (!item) return;

            await vscode.env.clipboard.writeText(item.command);

            await directPaste();
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error pasting command: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      async function directPaste(): Promise<void> {
        try {
          await vscode.commands.executeCommand("composer.startComposerPrompt");

          setTimeout(async () => {
            await vscode.commands.executeCommand(
              "editor.action.clipboardPasteAction"
            );
          }, 100);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error during paste: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const editCommandDisposable = vscode.commands.registerCommand(
        "cursor-memo.editCommand",
        async (item: MemoItem) => {
          try {
            if (!item) return;

            const editedCommand = await vscode.window.showInputBox({
              placeHolder: "Edit command content",
              prompt: "Modify the command content",
              value: item.command,
            });

            if (editedCommand !== undefined && editedCommand !== item.command) {
              const success = await dataService.editCommand(
                item.id,
                editedCommand
              );

              if (success) {
                memoTreeProvider.updateView();
                vscode.window.showInformationMessage("Command updated");
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error editing command: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      const addCategoryDisposable = vscode.commands.registerCommand(
        "cursor-memo.addCategory",
        async () => {
          try {
            const categoryName = await vscode.window.showInputBox({
              placeHolder: "输入新分类名称",
              prompt: "请输入新分类的名称",
            });

            if (categoryName && categoryName.trim()) {
              const success = await dataService.addCategory(
                categoryName.trim()
              );

              if (success) {
                memoTreeProvider.updateView();
                vscode.window.showInformationMessage(
                  `分类 "${categoryName}" 已创建`
                );
              } else {
                vscode.window.showInformationMessage(
                  `分类 "${categoryName}" 已存在`
                );
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error adding category: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      const renameCategoryDisposable = vscode.commands.registerCommand(
        "cursor-memo.renameCategory",
        async (categoryItem) => {
          try {
            if (!categoryItem) return;

            const oldCategoryName = categoryItem.label;
            const defaultCategory = dataService.getDefaultCategory();

            if (oldCategoryName === defaultCategory) {
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
              const success = await dataService.renameCategory(
                oldCategoryName,
                newCategoryName.trim()
              );

              if (success) {
                memoTreeProvider.updateView();
                vscode.window.showInformationMessage(
                  `分类已重命名为 "${newCategoryName}"`
                );
              } else {
                vscode.window.showInformationMessage(
                  `分类 "${newCategoryName}" 已存在或操作失败`
                );
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error renaming category: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      const deleteCategoryDisposable = vscode.commands.registerCommand(
        "cursor-memo.deleteCategory",
        async (categoryItem) => {
          try {
            if (!categoryItem) return;

            const categoryName = categoryItem.label;
            const defaultCategory = dataService.getDefaultCategory();

            if (categoryName === defaultCategory) {
              vscode.window.showInformationMessage(`不能删除默认分类`);
              return;
            }

            const confirmation = await vscode.window.showWarningMessage(
              `确定要删除分类 "${categoryName}" 吗？该分类下的命令将移至默认分类。`,
              { modal: true },
              "删除"
            );

            if (confirmation !== "删除") {
              return;
            }

            const result = await dataService.deleteCategory(categoryName);

            if (result.success) {
              memoTreeProvider.updateView();

              if (result.commandsMoved > 0) {
                vscode.window.showInformationMessage(
                  `分类 "${categoryName}" 已删除，${result.commandsMoved} 个命令已移至默认分类`
                );
              } else {
                vscode.window.showInformationMessage(
                  `分类 "${categoryName}" 已删除`
                );
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error deleting category: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      const moveToCategory = vscode.commands.registerCommand(
        "cursor-memo.moveToCategory",
        async (item: MemoItem) => {
          try {
            if (!item) return;

            const allCategories = dataService.getCategories();

            const categoryOptions = allCategories.filter(
              (cat) => cat !== item.category
            );

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

            const targetCategory = await vscode.window.showQuickPick(
              categoryOptions,
              {
                placeHolder: "选择目标分类",
              }
            );

            if (targetCategory) {
              const success = await dataService.moveCommandToCategory(
                item.id,
                targetCategory
              );

              if (success) {
                memoTreeProvider.updateView();
                vscode.window.showInformationMessage(
                  `命令已移动到 "${targetCategory}"`
                );
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error moving command: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      );

      memoTreeProvider.setCommandCallback("cursor-memo.pasteToEditor");

      context.subscriptions.push(
        saveCommandDisposable,
        removeCommandDisposable,
        renameCommandDisposable,
        pasteToEditorDisposable,
        editCommandDisposable,
        addCategoryDisposable,
        renameCategoryDisposable,
        deleteCategoryDisposable,
        moveToCategory,
        treeView,
        outputChannel
      );

      outputChannel.appendLine("Cursor Memo Plugin fully initialized");
    })
    .catch((error) => {
      vscode.window.showErrorMessage(
        `Failed to initialize Cursor Memo: ${error instanceof Error ? error.message : String(error)}`
      );
    });
}

/**
 * Extension deactivation function
 * Called by VSCode when the extension is deactivated
 * Used to clean up resources and display deactivation message
 */
export function deactivate() {
  vscode.window.showInformationMessage("Cursor Memo Plugin deactivated");
}
