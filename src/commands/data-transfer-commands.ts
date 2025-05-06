/** @format */

import * as vscode from "vscode";
import * as fs from "fs";
import { LocalMemoService } from "../services/local-data-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { DataTransferService } from "../services/data-transfer-service";
import { parseCommands } from "../zod/command-schema";

/**
 * Creates the export commands handler
 * @param dataService The local memo data service
 * @returns The export commands handler function
 */
export function createExportCommandsHandler(
  dataService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async () => {
    const dataTransferService = new DataTransferService(dataService);
    const commands = dataService.getCommands();
    const categories = dataService.getCategories();

    if (commands.length === 0) {
      vscode.window.showInformationMessage("No commands to export");
      return;
    }

    // Provide options to export selected categories or all
    const options = categories;

    const selectedOption = await vscode.window.showQuickPick(options, {
      placeHolder: "Select categories to export",
      canPickMany: true,
    });

    if (!selectedOption || selectedOption.length === 0) {
      return;
    }

    let exportData: string;
    // Export only selected categories
    exportData = dataTransferService.exportSelectedCategories(selectedOption);

    const saveDialogOptions: vscode.SaveDialogOptions = {
      defaultUri: vscode.Uri.file("cursor_commands.json"),
      filters: {
        JSON: ["json"],
      },
      title: "Export Commands",
    };

    const uri = await vscode.window.showSaveDialog(saveDialogOptions);
    if (uri) {
      try {
        fs.writeFileSync(uri.fsPath, exportData);
        vscode.window.showInformationMessage(
          `Commands exported to ${uri.fsPath}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error exporting commands: ${error}`);
      }
    }
  };
}

/**
 * Creates the import commands handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The import commands handler function
 */
export function createImportCommandsHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async () => {
    const dataTransferService = new DataTransferService(dataService);

    const openDialogOptions: vscode.OpenDialogOptions = {
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        JSON: ["json"],
      },
      title: "Import Commands",
    };

    const uris = await vscode.window.showOpenDialog(openDialogOptions);
    if (uris && uris.length > 0) {
      try {
        const fileContents = fs.readFileSync(uris[0].fsPath, "utf8");

        try {
          // 使用新的解析方式
          const commandsData = parseCommands(fileContents);

          // 从解析后的数据中获取分类
          const availableCategories = Object.keys(commandsData);

          if (availableCategories.length === 0) {
            vscode.window.showInformationMessage(
              "No commands found in the file to import."
            );
            return;
          }

          // 提供选项来导入选定的分类
          const selectedOption = await vscode.window.showQuickPick(
            availableCategories,
            {
              placeHolder: "Select categories to import",
              canPickMany: true,
            }
          );

          if (!selectedOption || selectedOption.length === 0) {
            return;
          }

          // 导入选定的分类
          await importSelectedData(
            fileContents, // 仍然传递原始 JSON 字符串
            selectedOption,
            dataTransferService,
            memoTreeProvider
          );
        } catch (parseError) {
          vscode.window.showErrorMessage(
            `Invalid command data format: ${parseError}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error reading file: ${error}`);
      }
    }
  };
}

/**
 * Helper function to import selected categories
 */
async function importSelectedData(
  jsonData: string,
  selectedCategories: string[],
  dataTransferService: DataTransferService,
  memoTreeProvider: MemoTreeDataProvider
): Promise<void> {
  const result = await dataTransferService.importSelectedData(
    jsonData,
    selectedCategories
  );

  if (result.success) {
    memoTreeProvider.updateView();
    vscode.window.showInformationMessage(
      `Imported ${result.importedCommands} commands and ${result.importedCategories} categories`
    );
  } else {
    vscode.window.showErrorMessage("Failed to import commands");
  }
}
