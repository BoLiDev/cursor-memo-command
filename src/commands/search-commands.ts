/** @format */

import * as vscode from "vscode";
import { LocalService } from "../services/local-service";
import { CloudService } from "../services/cloud-service";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";
import { Prompt } from "../models/prompt";
import { Category } from "../models/category";

interface PromptQuickPickItem extends vscode.QuickPickItem {
  promptObject: Prompt;
  source: "Local" | "Cloud";
}

export function createSearchAllPromptsHandler(
  localService: LocalService,
  cloudService: CloudService,
  uiService: VSCodeUserInteractionService
): () => Promise<void> {
  return async () => {
    const localPrompts = localService.getPrompts();
    const localCategories = localService.getCategories();
    const cloudPrompts = cloudService.getCloudPrompts();

    const localCategoryMap = new Map<string, string>();
    localCategories.forEach((cat: Category) => {
      localCategoryMap.set(cat.id, cat.name);
    });

    const quickPickItems: PromptQuickPickItem[] = [];

    // Add local prompts
    localPrompts.forEach((prompt) => {
      const categoryName =
        localCategoryMap.get(prompt.categoryId) || "Unknown Category";
      quickPickItems.push({
        label: `$(library) [${categoryName}] ${prompt.alias || prompt.label}`,
        description:
          prompt.content.substring(0, 100) +
          (prompt.content.length > 100 ? "..." : ""),
        promptObject: prompt,
        source: "Local",
      });
    });

    // Add cloud prompts
    cloudPrompts.forEach((prompt) => {
      // For cloud prompts, categoryId is the category name itself
      const categoryName = prompt.categoryId || "Unknown Category";
      quickPickItems.push({
        label: `$(cloud) [${categoryName}] ${prompt.alias || prompt.label}`,
        description:
          prompt.content.substring(0, 100) +
          (prompt.content.length > 100 ? "..." : ""),
        promptObject: prompt,
        source: "Cloud",
      });
    });

    if (quickPickItems.length === 0) {
      uiService.showInformationMessage("No prompts found to search.");
      return;
    }

    const selectedItem = await uiService.showQuickPick<PromptQuickPickItem>(
      quickPickItems,
      {
        placeHolder:
          "Search and select a prompt to paste (alias, category, local/cloud)",
        matchOnDescription: true,
        matchOnDetail: true,
      }
    );

    if (selectedItem) {
      await uiService.writeCursorChat(selectedItem.promptObject.content);
    }
  };
}
