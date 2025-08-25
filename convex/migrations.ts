import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Migration to clean up departments table by moving approverUserId to approverUserIds
 * This should be run once to fix the schema validation error
 */
export const migrateDepartmentsApproverField = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Get all departments that have the legacy approverUserId field
    const departments = await ctx.db.query("departments").collect();
    
    for (const dept of departments) {
      const updates: any = {};
      
      // If department has approverUserId but no approverUserIds, migrate the data
      if (dept.approverUserId && (!dept.approverUserIds || dept.approverUserIds.length === 0)) {
        updates.approverUserIds = [dept.approverUserId];
      }
      
      // Remove the legacy approverUserId field
      updates.approverUserId = undefined;
      
      // Only update if there are changes to make
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(dept._id, updates);
      }
    }
    
    return null;
  },
});

