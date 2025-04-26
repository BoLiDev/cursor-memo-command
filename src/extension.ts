/** @format */

import * as vscode from "vscode";
import { MemoTreeDataProvider, CategoryTreeItem } from "./memoTreeDataProvider";
import { MemoDataService, MemoItem } from "./memoDataService";

/**
 * 创建多行输入界面
 * @param title 输入框标题
 * @param placeholder 占位符文本
 * @param initialValue 初始值
 * @returns Promise<string | undefined> 用户输入的内容或undefined（如果取消）
 */
async function createMultilineInputBox(
  title: string,
  placeholder: string,
  initialValue: string = ""
): Promise<string | undefined> {
  return new Promise((resolve) => {
    // 创建WebviewPanel
    const panel = vscode.window.createWebviewPanel(
      "multilineInput",
      title,
      {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // 设置初始尺寸
    const initialWidth = 600;
    const initialHeight = 400;
    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body, html {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: hidden;
          }
          .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            max-height: 400px;
            padding: 10px;
            box-sizing: border-box;
          }
          textarea {
            flex: 1;
            resize: none;
            padding: 8px;
            min-height: 100px;
            max-height: 300px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            line-height: 1.5;
            margin-bottom: 10px;
          }
          .buttons {
            margin-top: 5px;
            text-align: right;
            flex-shrink: 0;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            margin-left: 8px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .placeholder {
            color: var(--vscode-input-placeholderForeground);
            position: absolute;
            pointer-events: none;
            padding: 8px;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="placeholder" id="placeholder">${placeholder}</div>
          <textarea id="input" placeholder="${placeholder}" autofocus>${initialValue}</textarea>
          <div class="buttons">
            <button id="cancel">Cancel</button>
            <button id="save">Save</button>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const textarea = document.getElementById('input');

          document.getElementById('save').addEventListener('click', () => {
            vscode.postMessage({
              type: 'save',
              value: textarea.value
            });
          });

          document.getElementById('cancel').addEventListener('click', () => {
            vscode.postMessage({
              type: 'cancel'
            });
          });

          // 支持Ctrl+Enter或Cmd+Enter提交
          textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              vscode.postMessage({
                type: 'save',
                value: textarea.value
              });
            }

            if (e.key === 'Escape') {
              vscode.postMessage({
                type: 'cancel'
              });
            }
          });

          // 自动聚焦并将光标放到末尾
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        </script>
      </body>
      </html>
    `;

    // 处理消息
    panel.webview.onDidReceiveMessage((message) => {
      if (message.type === "save") {
        resolve(message.value);
        panel.dispose();
      } else if (message.type === "cancel") {
        resolve(undefined);
        panel.dispose();
      }
    });

    // 处理面板关闭
    panel.onDidDispose(() => {
      resolve(undefined);
    });
  });
}

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
            } catch (error) {
              // Ignore clipboard errors
            }

            const commandText = await createMultilineInputBox(
              "Save Command",
              "Enter or paste the command content",
              clipboardText
            );

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

            const editedCommand = await createMultilineInputBox(
              "Edit Command Content",
              "Modify command content",
              item.command
            );

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
              placeHolder: "Enter new category name",
              prompt: "Please enter the name for the new category",
            });

            if (categoryName && categoryName.trim()) {
              const success = await dataService.addCategory(
                categoryName.trim()
              );

              if (success) {
                memoTreeProvider.updateView();
                vscode.window.showInformationMessage(
                  `Category "${categoryName}" created`
                );
              } else {
                vscode.window.showInformationMessage(
                  `Category "${categoryName}" already exists`
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
              vscode.window.showInformationMessage(
                `Cannot rename the default category`
              );
              return;
            }

            const newCategoryName = await vscode.window.showInputBox({
              placeHolder: "Enter new category name",
              prompt: "Please enter the new name for the category",
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
                  `Category renamed to "${newCategoryName}"`
                );
              } else {
                vscode.window.showInformationMessage(
                  `Category "${newCategoryName}" already exists or operation failed`
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
              vscode.window.showInformationMessage(
                `Cannot delete the default category`
              );
              return;
            }

            const confirmation = await vscode.window.showWarningMessage(
              `Are you sure you want to delete category "${categoryName}"? Commands in this category will be moved to the default category.`,
              { modal: true },
              "Delete"
            );

            if (confirmation !== "Delete") {
              return;
            }

            const result = await dataService.deleteCategory(categoryName);

            if (result.success) {
              memoTreeProvider.updateView();

              if (result.commandsMoved > 0) {
                vscode.window.showInformationMessage(
                  `Category "${categoryName}" deleted, ${result.commandsMoved} commands moved to the default category`
                );
              } else {
                vscode.window.showInformationMessage(
                  `Category "${categoryName}" deleted`
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
                "No target categories available. Create a new category?",
                "Create"
              );

              if (result === "Create") {
                vscode.commands.executeCommand("cursor-memo.addCategory");
              }

              return;
            }

            const targetCategory = await vscode.window.showQuickPick(
              categoryOptions,
              {
                placeHolder: "Select target category",
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
                  `Command moved to "${targetCategory}"`
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

      const addCommandToCategory = vscode.commands.registerCommand(
        "cursor-memo.addCommandToCategory",
        async (categoryItem: CategoryTreeItem) => {
          try {
            if (!categoryItem) return;

            const categoryName = categoryItem.label;

            let clipboardText = "";
            try {
              clipboardText = await vscode.env.clipboard.readText();
            } catch (error) {
              // Ignore clipboard errors
            }

            const commandText = await createMultilineInputBox(
              `Add Command to ${categoryName}`,
              "Enter the command content",
              clipboardText
            );

            if (commandText) {
              await dataService.addCommand(commandText, categoryName);
              memoTreeProvider.updateView();
              vscode.window.showInformationMessage(
                `Command added to ${categoryName}`
              );
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error adding command to category: ${error instanceof Error ? error.message : String(error)}`
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
        addCommandToCategory,
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
