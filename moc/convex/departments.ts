import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const listDepartments = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("departments").collect();
  },
});

export const createDepartment = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    approverUserIds: v.optional(v.array(v.id("users"))),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");
    if (!user.isAdmin) throw new ConvexError("Only admins can create departments");

    // Check if department already exists
    const existingDepartment = await ctx.db
      .query("departments")
      .filter((q) => q.eq(q.field("name"), args.name))
      .unique();
    
    if (existingDepartment) {
      throw new ConvexError("A department with this name already exists");
    }

    const { requestingUserId, ...departmentData } = args;
    const departmentId = await ctx.db.insert("departments", {
      ...departmentData,
    });

    return { success: true, departmentId };
  },
});

export const updateDepartment = mutation({
  args: {
    departmentId: v.id("departments"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    approverUserIds: v.optional(v.array(v.id("users"))),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");
    if (!user.isAdmin) throw new ConvexError("Only admins can update departments");

    const { departmentId, requestingUserId, ...updateData } = args;
    
    // If name is being updated, check for duplicates
    if (updateData.name) {
      const existingDepartment = await ctx.db
        .query("departments")
        .filter((q) => 
          q.and(
            q.eq(q.field("name"), updateData.name),
            q.neq(q.field("_id"), departmentId)
          )
        )
        .unique();
      
      if (existingDepartment) {
        throw new ConvexError("A department with this name already exists");
      }
    }

    await ctx.db.patch(departmentId, {
      ...updateData,
    });
    return { success: true };
  },
});

export const deleteDepartment = mutation({
  args: {
    departmentId: v.id("departments"),
    requestingUserId: v.id("users"),
    forceDelete: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");
    if (!user.isAdmin) throw new ConvexError("Only admins can delete departments");

    // Check if any users are assigned to this department
    const usersInDepartment = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("departmentId"), args.departmentId))
      .collect();
    
    if (usersInDepartment.length > 0) {
      throw new ConvexError("Cannot delete department with assigned users. Please reassign users first.");
    }

    // If force delete is enabled, remove all references to this department from MOCs
    if (args.forceDelete) {
      // Update MOCs that have this department as requestedByDepartment
      const mocsInDepartment = await ctx.db
        .query("mocRequests")
        .filter((q) => q.eq(q.field("requestedByDepartment"), args.departmentId))
        .collect();
      
      for (const moc of mocsInDepartment) {
        await ctx.db.patch(moc._id, { requestedByDepartment: undefined });
      }
    } else {
      // Check if any MOCs reference this department as requestedByDepartment
      const mocsInDepartment = await ctx.db
        .query("mocRequests")
        .filter((q) => q.eq(q.field("requestedByDepartment"), args.departmentId))
        .collect();
      
      if (mocsInDepartment.length > 0) {
        throw new ConvexError("Cannot delete department with associated MOCs. Use forceDelete option to remove references automatically.");
      }
    }

    await ctx.db.delete(args.departmentId);
    return { success: true };
  },
});

export const assignUserToDepartment = mutation({
  args: {
    userId: v.id("users"),
    departmentId: v.optional(v.id("departments")),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await ctx.db.get(args.requestingUserId);
    if (!currentUser) throw new ConvexError("User not found");
    if (!currentUser.isAdmin) throw new ConvexError("Only admins can assign users to departments");

    await ctx.db.patch(args.userId, {
      departmentId: args.departmentId,
    });

    return { success: true };
  },
});
