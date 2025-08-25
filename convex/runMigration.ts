import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Temporary action to run the departments migration
 * This should be called once to fix the schema validation error
 */
export const runDepartmentsMigration = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("Starting departments migration...");
    
    try {
      await ctx.runMutation(internal.migrations.migrateDepartmentsApproverField, {});
      console.log("Departments migration completed successfully!");
    } catch (error) {
      console.error("Migration failed:", error);
      throw error;
    }
    
    return null;
  },
});
