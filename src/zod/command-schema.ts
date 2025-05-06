/** @format */

import { z } from "zod";

export const CommandContentSchema = z.object({
  content: z.string(),
});

export const CategoryCommandsSchema = z.record(
  z.string(),
  CommandContentSchema
);

export const CommandsStructureSchema = z.record(
  z.string(),
  CategoryCommandsSchema
);

/**
 * Serialize command data to JSON string
 * @param data Command data structure
 * @returns Formatted JSON string
 */
export function serializeCommands(
  data: z.infer<typeof CommandsStructureSchema>
): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Parse JSON string to command data structure
 * @param jsonData JSON string
 * @returns Parsed command data structure
 * @throws If parsing fails
 */
export function parseCommands(
  jsonData: string
): z.infer<typeof CommandsStructureSchema> {
  try {
    const data = JSON.parse(jsonData);
    const validationResult = CommandsStructureSchema.safeParse(data);

    if (!validationResult.success) {
      throw new Error(
        `Invalid command data format: ${validationResult.error.message}`
      );
    }
    return validationResult.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}
