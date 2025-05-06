/** @format */

import * as vscode from "vscode";
import * as fs from "fs";
import { LocalService } from "../services/local-service";
import { LocalTransferService } from "../services/local-transfer-service";
import { parseCommands } from "../zod/command-schema";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";
import { QuickPickItem } from "vscode";

/**
 * Creates the export commands handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The export commands handler function
 */
export function createExportCommandsHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const dataTransferService = new LocalTransferService(dataService);
    const commands = dataService.getCommands();
    const categories = dataService.getCategories();

    if (commands.length === 0) {
      await uiService.showInformationMessage("No commands to export");
      return;
    }

    // Provide options to export selected categories or all
    const options: QuickPickItem[] = categories.map((cat) => ({
      label: cat.name,
      description:
        cat.id === dataService.getDefaultCategoryId() ? "(Default)" : "",
    }));

    const selectedQuickPickItems = await uiService.showQuickPick(options, {
      placeHolder: "Select categories to export",
      canPickMany: true,
    });

    if (!selectedQuickPickItems || selectedQuickPickItems.length === 0) {
      return;
    }

    const selectedCategoryIds = selectedQuickPickItems.map(
      (item) => item.label
    );

    let exportData: string;
    // Export only selected categories
    exportData =
      dataTransferService.exportSelectedCategories(selectedCategoryIds);

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
        await uiService.showInformationMessage(
          `Commands exported to ${uri.fsPath}`
        );
      } catch (error) {
        await uiService.showErrorMessage(`Error exporting commands: ${error}`);
      }
    }
  };
}

/**
 * Creates the import commands handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The import commands handler function
 */
export function createImportCommandsHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const dataTransferService = new LocalTransferService(dataService);

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
          const commandsData = parseCommands(fileContents);
          const availableCategories = Object.keys(commandsData);

          if (availableCategories.length === 0) {
            await uiService.showInformationMessage(
              "No commands found in the file to import."
            );
            return;
          }

          const selectedOption = await uiService.showQuickPick(
            availableCategories.map((cat) => ({ label: cat })),
            {
              placeHolder: "Select categories to import",
              canPickMany: true,
            }
          );

          if (!selectedOption || selectedOption.length === 0) {
            return;
          }

          // Extract labels
          const selectedCategoryLabels = selectedOption.map(
            (item) => item.label
          );

          await importSelectedData(
            fileContents,
            selectedCategoryLabels,
            dataTransferService,
            uiService
          );
        } catch (parseError) {
          await uiService.showErrorMessage(
            `Invalid command data format: ${parseError}`
          );
        }
      } catch (error) {
        await uiService.showErrorMessage(`Error reading file: ${error}`);
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
  dataTransferService: LocalTransferService,
  uiService: VSCodeUserInteractionService
): Promise<void> {
  const result = await dataTransferService.importSelectedData(
    jsonData,
    selectedCategories
  );

  if (result.success) {
    await uiService.showInformationMessage(
      `Imported ${result.importedCommands} commands and ${result.importedCategories} categories`
    );
  } else {
    await uiService.showErrorMessage("Failed to import commands");
  }
}
