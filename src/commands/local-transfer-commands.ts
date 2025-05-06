/** @format */

import * as vscode from "vscode";
import * as fs from "fs";
import { LocalService } from "../services/local-service";
import { LocalTransferService } from "../services/local-transfer-service";
import { parsePrompts } from "../zod/prompt-schema";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";
import { QuickPickItem } from "vscode";

/**
 * Creates the export prompts handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The export prompts handler function
 */
export function createExportPromptsHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const dataTransferService = new LocalTransferService(dataService);
    const prompts = dataService.getPrompts();
    const categories = dataService.getCategories();

    if (prompts.length === 0) {
      await uiService.showInformationMessage("No prompts to export");
      return;
    }

    // Filter out categories that have no prompts
    const nonEmtpyCategories = categories.filter((category) =>
      prompts.some((prompt) => prompt.categoryId === category.id)
    );

    // Provide options to export selected categories or all
    const options: QuickPickItem[] = nonEmtpyCategories.map((cat) => ({
      label: cat.name,
      description:
        cat.id === dataService.getDefaultCategoryId()
          ? `(${LocalService.DEFAULT_CATEGORY})`
          : "",
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
      defaultUri: vscode.Uri.file("cursor_prompts.json"),
      filters: {
        JSON: ["json"],
      },
      title: "Export Prompts",
    };

    const uri = await vscode.window.showSaveDialog(saveDialogOptions);
    if (uri) {
      try {
        fs.writeFileSync(uri.fsPath, exportData);
        await uiService.showInformationMessage(
          `Prompts exported to ${uri.fsPath}`
        );
      } catch (error) {
        await uiService.showErrorMessage(`Error exporting prompts: ${error}`);
      }
    }
  };
}

/**
 * Creates the import prompts handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The import prompts handler function
 */
export function createImportPromptsHandler(
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
      title: "Import Prompts",
    };

    const uris = await vscode.window.showOpenDialog(openDialogOptions);
    if (uris && uris.length > 0) {
      try {
        const fileContents = fs.readFileSync(uris[0].fsPath, "utf8");

        try {
          const promptsData = parsePrompts(fileContents);
          const availableCategories = Object.keys(promptsData);

          if (availableCategories.length === 0) {
            await uiService.showInformationMessage(
              "No prompts found in the file to import."
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
            `Invalid prompt data format: ${parseError}`
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
    const message =
      result.duplicatePrompts > 0
        ? `Imported ${result.importedPrompts} prompts and ${result.importedCategories} categories. Skipped ${result.duplicatePrompts} duplicate prompts.`
        : `Imported ${result.importedPrompts} prompts and ${result.importedCategories} categories.`;

    await uiService.showInformationMessage(message);
  } else {
    await uiService.showErrorMessage("Failed to import prompts");
  }
}
