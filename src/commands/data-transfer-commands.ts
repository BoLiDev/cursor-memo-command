/** @format */

import * as vscode from "vscode";
import * as fs from "fs";
import { LocalMemoService } from "../services/local-data-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { DataTransferService } from "../services/data-transfer-service";

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
    const allOption = "All categories";
    const options = [allOption, ...categories];

    const selectedOption = await vscode.window.showQuickPick(options, {
      placeHolder: "Select categories to export",
      canPickMany: true,
    });

    if (!selectedOption || selectedOption.length === 0) {
      return;
    }

    let exportData: string;
    if (selectedOption.includes(allOption)) {
      // Export all categories
      exportData = dataTransferService.exportData();
    } else {
      // Export only selected categories
      exportData = dataTransferService.exportSelectedCategories(selectedOption);
    }

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
          // Parse categories from the imported file to allow user selection
          const importData = JSON.parse(fileContents);
          const availableCategories = new Set<string>();
          const defaultCategory = dataService.getDefaultCategory();

          if (importData.commands && Array.isArray(importData.commands)) {
            importData.commands.forEach((cmd: any) => {
              const category = cmd.category || defaultCategory;
              availableCategories.add(category);
            });
          }

          const categories = Array.from(availableCategories);

          if (categories.length === 0 && importData.commands?.length > 0) {
            await importAllData(
              fileContents,
              dataTransferService,
              memoTreeProvider
            );
            return;
          } else if (categories.length === 0) {
            vscode.window.showInformationMessage(
              "No categories or commands found in the file to import."
            );
            return;
          }

          // Provide options to import selected categories or all
          const allOption = "All categories";
          const options = [allOption, ...categories];

          const selectedOption = await vscode.window.showQuickPick(options, {
            placeHolder: "Select categories to import",
            canPickMany: true,
          });

          if (!selectedOption || selectedOption.length === 0) {
            return;
          }

          if (selectedOption.includes(allOption)) {
            // Import all categories
            await importAllData(
              fileContents,
              dataTransferService,
              memoTreeProvider
            );
          } else {
            // Import only selected categories
            await importSelectedData(
              fileContents,
              selectedOption,
              dataTransferService,
              memoTreeProvider
            );
          }
        } catch (parseError) {
          vscode.window.showErrorMessage(`Invalid JSON file: ${parseError}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error reading file: ${error}`);
      }
    }
  };
}

/**
 * Helper function to import all data
 */
async function importAllData(
  jsonData: string,
  dataTransferService: DataTransferService,
  memoTreeProvider: MemoTreeDataProvider
): Promise<void> {
  const result = await dataTransferService.importData(jsonData);

  if (result.success) {
    memoTreeProvider.updateView();
    vscode.window.showInformationMessage(
      `Imported ${result.importedCommands} commands and ${result.importedCategories} categories`
    );
  } else {
    vscode.window.showErrorMessage("Failed to import commands");
  }
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
