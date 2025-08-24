import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// Types for MOC Status
type MocStatus =
  | "draft"
  | "pending_department_approval"
  | "pending_final_review"
  | "approved"
  | "rejected"
  | "in_progress"
  | "pending_closeout"
  | "completed"
  | "cancelled";

// Helper to check user permissions
async function checkUserPermission(
  ctx: QueryCtx | MutationCtx,
  permissionCheck: (profile: Doc<"users"> | null) => boolean
): Promise<{ userId: Id<"users">; userProfile: Doc<"users"> | null }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not authenticated.");
  const userProfile: Doc<"users"> | null = await ctx.runQuery(internal.userInternal.getUserProfileByUserId, { userId });
  if (!userProfile?.isAdmin && !permissionCheck(userProfile)) {
    throw new ConvexError("Permission denied.");
  }
  return { userId, userProfile };
}

// Helper to get next MOC number - Reset to start from 1
async function getNextMocNumber(ctx: MutationCtx): Promise<number> {
  // Find the max mocNumber in the table
  const mocs = await ctx.db.query("mocRequests")
    .filter((q) => q.neq(q.field("mocNumber"), undefined))
    .collect();
  
  if (mocs.length === 0) return 1;
  
  const maxMocNumber = Math.max(...mocs.map(moc => moc.mocNumber || 0));
  return maxMocNumber + 1;
}

// Create MOC Request
export const createMocRequest = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    assignedToId: v.optional(v.id("users")),
    requestedByDepartment: v.optional(v.id("departments")),
    reasonForChange: v.optional(v.string()),
    changeType: v.optional(v.union(v.literal("temporary"), v.literal("permanent"), v.literal("emergency"))),
    changeCategory: v.optional(v.string()),
    changeCategoryOther: v.optional(v.string()),
    departmentsAffected: v.optional(v.array(v.id("departments"))),
    riskAssessmentRequired: v.optional(v.boolean()),
    impactAssessment: v.optional(v.string()),
    hseImpactAssessment: v.optional(v.string()),
    riskEvaluation: v.optional(v.string()),
    riskLevelPreMitigation: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    riskMatrixPreMitigation: v.optional(v.string()),
    riskLevelPostMitigation: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    riskMatrixPostMitigation: v.optional(v.string()),
    preChangeCondition: v.optional(v.string()),
    postChangeCondition: v.optional(v.string()),
    supportingDocumentsNotes: v.optional(v.string()),
    stakeholderReviewApprovalsText: v.optional(v.string()),
    trainingRequired: v.optional(v.boolean()),
    trainingDetails: v.optional(v.string()),
    startDateOfChange: v.optional(v.number()),
    expectedCompletionDate: v.optional(v.number()),
    deadline: v.optional(v.number()),
    implementationOwner: v.optional(v.string()),
    verificationOfCompletionText: v.optional(v.string()),
    postImplementationReviewText: v.optional(v.string()),
    closeoutApprovedByText: v.optional(v.string()),
    technicalAuthorityApproverUserIds: v.optional(v.array(v.id("users"))),
    closeOutApproverUserIds: v.optional(v.array(v.id("users"))),
    viewerIds: v.optional(v.array(v.id("users"))),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Id<"mocRequests">> => {
    const currentUser = await ctx.db.get(args.requestingUserId);
    if (!currentUser?.canCreateMocs && !currentUser?.isAdmin) {
      throw new ConvexError("Permission denied. You don't have permission to create MOCs.");
    }
    const userId = args.requestingUserId;

    // MOC number logic - ensure consistent numbering
    const mocNumber = await getNextMocNumber(ctx);
    const mocIdString = `MOC-${mocNumber}`;

    // Create department approvals with proper error handling
    const departmentApprovals = args.departmentsAffected && args.departmentsAffected.length > 0
      ? await Promise.all(args.departmentsAffected.map(async (deptId) => {
        try {
          const department = await ctx.db.get(deptId);
          if (!department) {
            console.warn(`Department not found: ${deptId}`);
            return {
              departmentId: deptId,
              status: "pending" as const,
              approverId: undefined,
            };
          }
          return {
            departmentId: deptId,
            status: "pending" as const,
            approverId: department.approverUserIds?.[0],
          };
        } catch (error) {
          console.error(`Error fetching department ${deptId}:`, error);
          return {
            departmentId: deptId,
            status: "pending" as const,
            approverId: undefined,
          };
        }
      }))
      : [];

    const { requestingUserId, ...mocData } = args;
    const mocRequestId: Id<"mocRequests"> = await ctx.db.insert("mocRequests", {
      ...mocData,
      submitterId: userId,
      status: "draft",
      mocIdString,
      mocNumber,
      departmentApprovals: departmentApprovals,
      dateRaised: Date.now(),
    });

    // Only send notifications on submission, not draft
    // (handled in status change mutation)

    return mocRequestId;
  },
});

export const updateMocRequest = mutation({
  args: {
    id: v.id("mocRequests"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    assignedToId: v.optional(v.id("users")),
    requestedByDepartment: v.optional(v.id("departments")),
    reasonForChange: v.optional(v.string()),
    changeType: v.optional(v.union(v.literal("temporary"), v.literal("permanent"), v.literal("emergency"))),
    changeCategory: v.optional(v.string()),
    changeCategoryOther: v.optional(v.string()),
    departmentsAffected: v.optional(v.array(v.id("departments"))),
    riskAssessmentRequired: v.optional(v.boolean()),
    impactAssessment: v.optional(v.string()),
    hseImpactAssessment: v.optional(v.string()),
    riskEvaluation: v.optional(v.string()),
    riskLevelPreMitigation: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    riskMatrixPreMitigation: v.optional(v.string()),
    riskLevelPostMitigation: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    riskMatrixPostMitigation: v.optional(v.string()),
    preChangeCondition: v.optional(v.string()),
    postChangeCondition: v.optional(v.string()),
    supportingDocumentsNotes: v.optional(v.string()),
    stakeholderReviewApprovalsText: v.optional(v.string()),
    trainingRequired: v.optional(v.boolean()),
    trainingDetails: v.optional(v.string()),
    startDateOfChange: v.optional(v.number()),
    expectedCompletionDate: v.optional(v.number()),
    deadline: v.optional(v.number()),
    implementationOwner: v.optional(v.string()),
    verificationOfCompletionText: v.optional(v.string()),
    postImplementationReviewText: v.optional(v.string()),
    closeoutApprovedByText: v.optional(v.string()),
    technicalAuthorityApproverUserIds: v.optional(v.array(v.id("users"))),
    closeOutApproverUserIds: v.optional(v.array(v.id("users"))),
    viewerIds: v.optional(v.array(v.id("users"))),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const authUserId = args.requestingUserId;
    const moc = await ctx.db.get(args.id);
    if (!moc) throw new ConvexError("MOC not found.");

    const profile = await ctx.runQuery(internal.userInternal.getUserProfileByUserId, { userId: authUserId });

    // Allow editing by submitter, assigned user, or any technical authority approver, or admin
    const isSubmitter = moc.submitterId === authUserId;
    const isAssigned = moc.assignedToId === authUserId;
    const isTechApprover = moc.technicalAuthorityApproverUserIds?.includes(authUserId);
    const canEditThisMoc = profile?.isAdmin ||
      isSubmitter ||
      isAssigned ||
      isTechApprover;

    if (!canEditThisMoc) {
      throw new ConvexError("Permission denied to edit this MOC.");
    }

    const { id, requestingUserId, ...updateData } = args;

    // Check for actual changes
    const hasChanges = Object.keys(updateData).some(key => {
      const oldValue = moc[key as keyof typeof moc];
      const newValue = updateData[key as keyof typeof updateData];
      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        return JSON.stringify(oldValue.sort()) !== JSON.stringify(newValue.sort());
      }
      return oldValue !== newValue;
    });

    if (!hasChanges) {
      return { success: true };
    }

    // If editing during approval stages, reset approvals and status
    let statusUpdate: Partial<Doc<"mocRequests">> = {};
    if (moc.status === "pending_department_approval" || moc.status === "pending_final_review") {
      statusUpdate.status = "draft";
      // Reset department approvals to pending
      if (updateData.departmentsAffected || moc.departmentsAffected) {
        const depts = updateData.departmentsAffected || moc.departmentsAffected || [];
        statusUpdate.departmentApprovals = await Promise.all(depts.map(async (deptId) => {
          try {
            const department = await ctx.db.get(deptId);
            return {
              departmentId: deptId,
              status: "pending" as const,
              approverId: department?.approverUserIds?.[0],
            };
          } catch (error) {
            console.error(`Error fetching department ${deptId}:`, error);
            return {
              departmentId: deptId,
              status: "pending" as const,
              approverId: undefined,
            };
          }
        }));
      }
      // Clear review data
      statusUpdate.reviewedAt = undefined;
      statusUpdate.reviewerId = undefined;
      statusUpdate.reviewComments = undefined;
      // Clear technical authority approvals
      statusUpdate.technicalAuthorityApprovals = {};
    }

    if (updateData.departmentsAffected) {
      const departmentApprovals = updateData.departmentsAffected && updateData.departmentsAffected.length > 0
        ? await Promise.all(updateData.departmentsAffected.map(async (deptId) => {
          try {
            const department = await ctx.db.get(deptId);
            const existingApproval = moc.departmentApprovals?.find(da => da.departmentId === deptId);
            return {
              departmentId: deptId,
              status: existingApproval?.status || "pending" as const,
              approverId: department?.approverUserIds?.[0],
              approvedAt: existingApproval?.approvedAt,
              comments: existingApproval?.comments,
            };
          } catch (error) {
            console.error(`Error fetching department ${deptId}:`, error);
            const existingApproval = moc.departmentApprovals?.find(da => da.departmentId === deptId);
            return {
              departmentId: deptId,
              status: existingApproval?.status || "pending" as const,
              approverId: undefined,
              approvedAt: existingApproval?.approvedAt,
              comments: existingApproval?.comments,
            };
          }
        }))
        : [];
      await ctx.db.patch(id, { ...updateData, ...statusUpdate, departmentApprovals });
    } else {
      await ctx.db.patch(id, { ...updateData, ...statusUpdate });
    }

    // Log the edit in history
    await ctx.runMutation(internal.moc.logEditHistory, {
      mocRequestId: id,
      editedById: authUserId,
      changesDescription: "MOC updated",
    });

    return { success: true };
  },
});

// List RFCs: Only show to viewers if set, otherwise to all (except drafts)
export const listRequests = query({
  args: {
    statusFilter: v.optional(v.string()),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await ctx.db.get(args.requestingUserId);
    if (!currentUser) throw new ConvexError("User not found");
    
    let requests;
    if (args.statusFilter && args.statusFilter !== "all") {
      const validStatuses: MocStatus[] = ["draft", "pending_department_approval", "pending_final_review", "approved", "rejected", "in_progress", "pending_closeout", "completed", "cancelled"];
      if (validStatuses.includes(args.statusFilter as MocStatus)) {
        requests = await ctx.db
          .query("mocRequests")
          .withIndex("by_status", (q) => q.eq("status", args.statusFilter as MocStatus))
          .order("desc")
          .collect();
      } else {
        requests = await ctx.db.query("mocRequests").order("desc").collect();
      }
    } else {
      requests = await ctx.db.query("mocRequests").order("desc").collect();
    }

    // Filter based on visibility rules
    const filteredRequests = requests.filter(moc => {
      // Always show drafts to the submitter only
      if (moc.status === "draft") {
        return moc.submitterId === args.requestingUserId;
      }
      
      // If viewers are set, restrict to viewers only (after submission)
      if (moc.viewerIds && moc.viewerIds.length > 0) {
        return moc.viewerIds.includes(args.requestingUserId) ||
               moc.submitterId === args.requestingUserId ||
               moc.assignedToId === args.requestingUserId ||
               moc.technicalAuthorityApproverUserIds?.includes(args.requestingUserId) ||
               currentUser.isAdmin;
      }
      
      // If no viewers set, show to everyone (except drafts)
      return true;
    });

    return Promise.all(filteredRequests.map(async (moc) => {
      const submitter = moc.submitterId ? await ctx.db.get(moc.submitterId) : null;
      const assignedTo = moc.assignedToId ? await ctx.db.get(moc.assignedToId) : null;
      
      // Enhanced department approvals with better error handling
      const departmentApprovalsWithNames = moc.departmentApprovals ? await Promise.all(
        moc.departmentApprovals.map(async da => {
          try {
            const department = await ctx.db.get(da.departmentId);
            let approverDisplayName = "N/A";
            let approverEmail = undefined;
            
            if (da.approverId) {
              try {
                const approverUser = await ctx.db.get(da.approverId);
                if (approverUser) {
                  approverDisplayName = approverUser.name || approverUser.email || "Unknown";
                  approverEmail = approverUser.email;
                }
              } catch (error) {
                console.error(`Error fetching approver ${da.approverId}:`, error);
              }
            }
            
            return {
              ...da,
              departmentName: department?.name || "Unknown Department",
              approverDisplayName,
              approverEmail,
            };
          } catch (error) {
            console.error(`Error processing department approval for ${da.departmentId}:`, error);
            return {
              ...da,
              departmentName: "Unknown Department",
              approverDisplayName: "N/A",
              approverEmail: undefined,
            };
          }
        })
      ) : [];
      
      return {
        ...moc,
        submitterName: submitter?.name || submitter?.email || "Unknown",
        assignedToName: assignedTo?.name || assignedTo?.email || "N/A",
        departmentApprovals: departmentApprovalsWithNames,
      };
    }));
  },
});

// Status change: Handle department approvals and technical authority approvals
export const changeStatus = mutation({
  args: {
    id: v.id("mocRequests"),
    newStatus: v.string(),
    comments: v.optional(v.string()),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const authUserId = args.requestingUserId;
    const userProfile = await ctx.runQuery(internal.userInternal.getUserProfileByUserId, { userId: authUserId });

    const moc = await ctx.db.get(args.id);
    if (!moc) throw new ConvexError("MOC not found.");

    const validStatuses: MocStatus[] = ["draft", "pending_department_approval", "pending_final_review", "approved", "rejected", "in_progress", "pending_closeout", "completed", "cancelled"];
    if (!validStatuses.includes(args.newStatus as MocStatus)) {
      throw new ConvexError("Invalid status provided.");
    }
    const newStatus = args.newStatus as MocStatus;

    const isSubmitter = moc.submitterId === authUserId;
    const isAssigned = moc.assignedToId === authUserId;
    const isTechApprover = moc.technicalAuthorityApproverUserIds?.includes(authUserId);

    // Enhanced permission logic
    let canChange = false;
    
    // Admin can always change status
    if (userProfile?.isAdmin) {
      canChange = true;
    } else {
      // Check specific transitions based on current status and user role
      const currentStatus = moc.status;
      
      // Draft to pending_department_approval - only submitter
      if (currentStatus === "draft" && newStatus === "pending_department_approval" && isSubmitter) {
        canChange = true;
      }
      
      // Cancel from various states - submitter can cancel
      if (newStatus === "cancelled" && isSubmitter) {
        // Submitter can cancel from most states except in_progress/completed (admin only)
        if (!["in_progress", "completed"].includes(currentStatus)) {
          canChange = true;
        }
      }
      
      // Technical authority approvals during final review
      if (currentStatus === "pending_final_review" && (newStatus === "approved" || newStatus === "rejected")) {
        if (moc.technicalAuthorityApproverUserIds && moc.technicalAuthorityApproverUserIds.length > 0) {
          canChange = Boolean(isTechApprover);
        } else {
          // No technical approvers assigned, allow submitter or assigned user
          canChange = isSubmitter || isAssigned;
        }
      }
      
      // Start implementation - assigned user or submitter
      if (currentStatus === "approved" && newStatus === "in_progress") {
        canChange = isAssigned || isSubmitter;
      }
      
      // Request closeout - assigned user can request closeout
      if (currentStatus === "in_progress" && newStatus === "pending_closeout") {
        canChange = isAssigned || isSubmitter;
      }
      
      // Complete implementation - closeout approvers can approve completion
      if (currentStatus === "pending_closeout" && newStatus === "completed") {
        if (moc.closeOutApproverUserIds && moc.closeOutApproverUserIds.length > 0) {
          canChange = moc.closeOutApproverUserIds.includes(authUserId);
        } else {
          // No closeout approvers assigned, allow assigned user or submitter
          canChange = isAssigned || isSubmitter;
        }
      }
    }

    if (!canChange) {
      throw new ConvexError("Permission denied to change status.");
    }

    // Technical authority approval logic: track approvals
    let technicalApprovals = moc.technicalAuthorityApprovals || {};
    if (moc.status === "pending_final_review" && moc.technicalAuthorityApproverUserIds && moc.technicalAuthorityApproverUserIds.length > 0) {
      if (isTechApprover) {
        technicalApprovals = { ...technicalApprovals, [authUserId]: newStatus };
        // Only approve if all technical approvers have approved
        const allApproved = moc.technicalAuthorityApproverUserIds.every(uid => technicalApprovals[uid] === "approved");
        if (allApproved && newStatus === "approved") {
          // All technical approvers approved, move to approved
        } else if (newStatus === "rejected") {
          // Any rejection, move to rejected
        } else {
          // Wait for all approvals
          await ctx.db.patch(moc._id, { technicalAuthorityApprovals: technicalApprovals });
          return { success: true };
        }
      }
    }

    const updatePayload: Partial<Doc<"mocRequests">> = { status: newStatus };
    
    // Handle submission - check if technical approvers are selected
    if (newStatus === "pending_department_approval") {
      updatePayload.submittedAt = Date.now();
      if (moc.status === "rejected" || moc.status === "draft") {
        if (moc.departmentsAffected) {
          updatePayload.departmentApprovals = await Promise.all(moc.departmentsAffected.map(async (deptId) => {
            try {
              const department = await ctx.db.get(deptId);
              const existingApproval = moc.departmentApprovals?.find(da => da.departmentId === deptId);
              return {
                departmentId: deptId,
                status: "pending" as const,
                approverId: existingApproval?.approverId || department?.approverUserIds?.[0],
              };
            } catch (error) {
              console.error(`Error fetching department ${deptId}:`, error);
              const existingApproval = moc.departmentApprovals?.find(da => da.departmentId === deptId);
              return {
                departmentId: deptId,
                status: "pending" as const,
                approverId: existingApproval?.approverId,
              };
            }
          }));
        } else {
          updatePayload.departmentApprovals = [];
        }
      }
    }
    
    // Save comments for approval/rejection
    if (newStatus === "approved" || newStatus === "rejected") {
      updatePayload.reviewedAt = Date.now();
      updatePayload.reviewerId = authUserId;
      updatePayload.reviewComments = args.comments;
    }
    
    if (technicalApprovals) {
      updatePayload.technicalAuthorityApprovals = technicalApprovals;
    }

    await ctx.db.patch(moc._id, updatePayload);

    // Send notifications for various status changes
    const usersToNotify: Set<Id<"users">> = new Set();
    let notificationMessage = "";
    
    // Get actor name for notifications
    const actorUser = await ctx.db.get(authUserId);
    const actorName = actorUser?.name || actorUser?.email || "Someone";
    
    if (newStatus === "pending_department_approval") {
      // Notify department approvers, assigned, technical authority approvers, viewers
      if (moc.departmentApprovals) {
        moc.departmentApprovals.forEach(approval => {
          if (approval.approverId) usersToNotify.add(approval.approverId);
        });
      }
      if (moc.assignedToId) usersToNotify.add(moc.assignedToId);
      if (moc.technicalAuthorityApproverUserIds) moc.technicalAuthorityApproverUserIds.forEach(id => usersToNotify.add(id));
      if (moc.viewerIds && moc.viewerIds.length > 0) {
        moc.viewerIds.forEach(id => usersToNotify.add(id));
      }
      notificationMessage = `${actorName} submitted MOC "${moc.title}" for review.`;
    } else if (newStatus === "pending_final_review") {
      if (moc.technicalAuthorityApproverUserIds) {
        moc.technicalAuthorityApproverUserIds.forEach(id => usersToNotify.add(id));
      }
      notificationMessage = `MOC "${moc.title}" requires your technical authority approval.`;
    } else if (newStatus === "approved") {
      if (moc.submitterId) usersToNotify.add(moc.submitterId);
      if (moc.assignedToId) usersToNotify.add(moc.assignedToId);
      if (moc.viewerIds && moc.viewerIds.length > 0) {
        moc.viewerIds.forEach(id => usersToNotify.add(id));
      }
      notificationMessage = `${actorName} approved MOC "${moc.title}".`;
    } else if (newStatus === "rejected") {
      if (moc.submitterId) usersToNotify.add(moc.submitterId);
      if (moc.assignedToId) usersToNotify.add(moc.assignedToId);
      if (moc.viewerIds && moc.viewerIds.length > 0) {
        moc.viewerIds.forEach(id => usersToNotify.add(id));
      }
      notificationMessage = `${actorName} rejected MOC "${moc.title}".`;
    }
    
    // Send notifications
    if (notificationMessage && usersToNotify.size > 0) {
      for (const notifyUserId of Array.from(usersToNotify)) {
        if (notifyUserId !== authUserId) {
          await ctx.runMutation(internal.notifications.createNotification, {
            userId: notifyUserId,
            actorUserId: authUserId,
            mocRequestId: moc._id,
            relatedMocTitle: moc.title,
            type: "status_change",
            message: notificationMessage + (args.comments ? ` Comments: ${args.comments}` : "")
          });
        }
      }
    }

    return { success: true };
  },
});

// Department approval function
export const approveOrRejectDepartmentStep = mutation({
  args: {
    mocRequestId: v.id("mocRequests"),
    departmentId: v.id("departments"),
    action: v.union(v.literal("approved"), v.literal("rejected")),
    comments: v.optional(v.string()),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const moc = await ctx.db.get(args.mocRequestId);
    if (!moc) throw new ConvexError("MOC not found");

    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");

    // Check if user can approve for this department
    const department = await ctx.db.get(args.departmentId);
    if (!department) throw new ConvexError("Department not found");

          const canApprove = user.isAdmin || department.approverUserIds?.includes(args.requestingUserId);
    if (!canApprove) {
      throw new ConvexError("You don't have permission to approve for this department");
    }

    // Update department approval with comments
    const updatedApprovals = moc.departmentApprovals?.map(approval => {
      if (approval.departmentId === args.departmentId) {
        return {
          ...approval,
          status: args.action,
          approverId: args.requestingUserId,
          approvedAt: Date.now(),
          comments: args.comments, // Save comments here
        };
      }
      return approval;
    }) || [];

    await ctx.db.patch(args.mocRequestId, {
      departmentApprovals: updatedApprovals,
    });

    // Check if all departments have approved
    const allApproved = updatedApprovals.every(approval => approval.status === "approved");
    const anyRejected = updatedApprovals.some(approval => approval.status === "rejected");

    if (anyRejected) {
      // If any department rejected, reject the MOC
      await ctx.db.patch(args.mocRequestId, {
        status: "rejected",
        reviewedAt: Date.now(),
        reviewerId: args.requestingUserId,
        reviewComments: args.comments,
      });
    } else if (allApproved) {
      // If all departments approved, check if technical approvers are set
      if (moc.technicalAuthorityApproverUserIds && moc.technicalAuthorityApproverUserIds.length > 0) {
        // Move to pending final review for technical authority approval
        await ctx.db.patch(args.mocRequestId, {
          status: "pending_final_review",
        });
      } else {
        // No technical approvers, approve directly
        await ctx.db.patch(args.mocRequestId, {
          status: "approved",
          reviewedAt: Date.now(),
          reviewerId: args.requestingUserId,
          reviewComments: "All departments approved",
        });
      }
    }
    
    // Notify submitter and assigned user
    if (moc.submitterId && moc.submitterId !== args.requestingUserId) {
      const approverUser = await ctx.db.get(args.requestingUserId);
      const approverName = approverUser?.name || approverUser?.email || "Someone";
      await ctx.runMutation(internal.notifications.createNotification, {
        userId: moc.submitterId,
        actorUserId: args.requestingUserId,
        mocRequestId: moc._id,
        relatedMocTitle: moc.title,
        type: "status_change",
        message: `${approverName} ${args.action} MOC "${moc.title}" for their department.` + (args.comments ? ` Comments: ${args.comments}` : "")
      });
    }

    return { success: true };
  },
});

// Closeout approval function
export const approveCloseout = mutation({
  args: {
    mocRequestId: v.id("mocRequests"),
    action: v.union(v.literal("approved"), v.literal("rejected")),
    comments: v.optional(v.string()),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const moc = await ctx.db.get(args.mocRequestId);
    if (!moc) throw new ConvexError("MOC not found");

    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");

    // Check if user can approve closeout
    const canApprove = user.isAdmin || 
      (moc.closeOutApproverUserIds && moc.closeOutApproverUserIds.includes(args.requestingUserId));
    
    if (!canApprove) {
      throw new ConvexError("You don't have permission to approve closeout for this MOC");
    }

    if (moc.status !== "pending_closeout") {
      throw new ConvexError("MOC is not pending closeout approval");
    }

    if (args.action === "approved") {
      // Approve and complete the MOC
      await ctx.db.patch(args.mocRequestId, {
        status: "completed",
        reviewedAt: Date.now(),
        reviewerId: args.requestingUserId,
        reviewComments: args.comments || "Closeout approved",
      });
    } else {
      // Reject closeout - send back to in_progress
      await ctx.db.patch(args.mocRequestId, {
        status: "in_progress",
        reviewComments: args.comments || "Closeout rejected",
      });
    }

    return { success: true };
  },
});

// Get MOC details
export const getRequestDetails = query({
  args: {
    id: v.id("mocRequests"),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const moc = await ctx.db.get(args.id);
    if (!moc) return null;

    const currentUser = await ctx.db.get(args.requestingUserId);
    if (!currentUser) throw new ConvexError("User not found");

    // Check if user can view this MOC
    const canView = currentUser.isAdmin ||
      moc.submitterId === args.requestingUserId ||
      moc.assignedToId === args.requestingUserId ||
      moc.technicalAuthorityApproverUserIds?.includes(args.requestingUserId) ||
      (moc.viewerIds && moc.viewerIds.length > 0 ? moc.viewerIds.includes(args.requestingUserId) : true);

    if (!canView) {
      throw new ConvexError("Permission denied to view this MOC");
    }

    // Get related data
    const submitter = moc.submitterId ? await ctx.db.get(moc.submitterId) : null;
    const assignedTo = moc.assignedToId ? await ctx.db.get(moc.assignedToId) : null;
    const reviewer = moc.reviewerId ? await ctx.db.get(moc.reviewerId) : null;
    const requestedByDepartment = moc.requestedByDepartment ? await ctx.db.get(moc.requestedByDepartment) : null;

    // Get attachments
    const attachments = await ctx.db
      .query("mocAttachments")
      .withIndex("by_moc", (q) => q.eq("mocRequestId", args.id))
      .collect();

    const attachmentsWithUrls = await Promise.all(
      attachments.map(async (attachment) => {
        const url = await ctx.storage.getUrl(attachment.storageId);
        const uploadedBy = await ctx.db.get(attachment.uploadedById);
        return {
          ...attachment,
          url,
          uploadedByName: uploadedBy?.name || uploadedBy?.email || "Unknown",
        };
      })
    );

    // Get departments affected names with better error handling
    const departmentsAffectedNames = moc.departmentsAffected
      ? await Promise.all(
          moc.departmentsAffected.map(async (deptId) => {
            try {
              const dept = await ctx.db.get(deptId);
              return dept?.name || "Unknown Department";
            } catch (error) {
              console.error(`Error fetching department ${deptId}:`, error);
              return "Unknown Department";
            }
          })
        )
      : [];

    // Enhanced department approvals with better error handling
    const departmentApprovalsWithNames = moc.departmentApprovals ? await Promise.all(
      moc.departmentApprovals.map(async da => {
        try {
          const department = await ctx.db.get(da.departmentId);
          let approverDisplayName = "N/A";
          let approverEmail = undefined;
          
          if (da.approverId) {
            try {
              const approverUser = await ctx.db.get(da.approverId);
              if (approverUser) {
                approverDisplayName = approverUser.name || approverUser.email || "Unknown";
                approverEmail = approverUser.email;
              }
            } catch (error) {
              console.error(`Error fetching approver ${da.approverId}:`, error);
            }
          }
          
          return {
            ...da,
            departmentName: department?.name || "Unknown Department",
            approverDisplayName,
            approverEmail,
          };
        } catch (error) {
          console.error(`Error processing department approval for ${da.departmentId}:`, error);
          return {
            ...da,
            departmentName: "Unknown Department",
            approverDisplayName: "N/A",
            approverEmail: undefined,
          };
        }
      })
    ) : [];

    // Get technical authority approver names
    const technicalAuthorityApproverNames = moc.technicalAuthorityApproverUserIds 
      ? await Promise.all(moc.technicalAuthorityApproverUserIds.map(async (userId) => {
          try {
            const user = await ctx.db.get(userId);
            return user?.name || user?.email || "Unknown";
          } catch (error) {
            console.error(`Error fetching technical approver ${userId}:`, error);
            return "Unknown";
          }
        }))
      : [];

    // Get closeout approver names
    const closeOutApproverNames = moc.closeOutApproverUserIds 
      ? await Promise.all(moc.closeOutApproverUserIds.map(async (userId) => {
          try {
            const user = await ctx.db.get(userId);
            return user?.name || user?.email || "Unknown";
          } catch (error) {
            console.error(`Error fetching closeout approver ${userId}:`, error);
            return "Unknown";
          }
        }))
      : [];

    // Get viewer names
    const viewerNames = moc.viewerIds 
      ? await Promise.all(moc.viewerIds.map(async (userId) => {
          try {
            const user = await ctx.db.get(userId);
            return user?.name || user?.email || "Unknown";
          } catch (error) {
            console.error(`Error fetching viewer ${userId}:`, error);
            return "Unknown";
          }
        }))
      : [];

    return {
      ...moc,
      submitterName: submitter?.name || submitter?.email || "Unknown",
      assignedToName: assignedTo?.name || assignedTo?.email || "N/A",
      reviewerName: reviewer?.name || reviewer?.email || "N/A",
      requestedByDepartmentName: requestedByDepartment?.name || "N/A",
      departmentsAffectedNames,
      departmentApprovals: departmentApprovalsWithNames,
      attachments: attachmentsWithUrls,
      technicalAuthorityApproverNames,
      closeOutApproverNames,
      viewerNames,
    };
  },
});

// Get attachments for a MOC
export const getMocAttachments = query({
  args: {
    mocRequestId: v.id("mocRequests"),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const moc = await ctx.db.get(args.mocRequestId);
    if (!moc) throw new ConvexError("MOC not found");

    const currentUser = await ctx.db.get(args.requestingUserId);
    if (!currentUser) throw new ConvexError("User not found");

    // Check if user can view this MOC
    const canView = currentUser.isAdmin ||
      moc.submitterId === args.requestingUserId ||
      moc.assignedToId === args.requestingUserId ||
      moc.technicalAuthorityApproverUserIds?.includes(args.requestingUserId) ||
      (moc.viewerIds && moc.viewerIds.length > 0 ? moc.viewerIds.includes(args.requestingUserId) : true);

    if (!canView) {
      throw new ConvexError("Permission denied to view this MOC");
    }

    // Get attachments
    const attachments = await ctx.db
      .query("mocAttachments")
      .withIndex("by_moc", (q) => q.eq("mocRequestId", args.mocRequestId))
      .collect();

    const attachmentsWithUrls = await Promise.all(
      attachments.map(async (attachment) => {
        const url = await ctx.storage.getUrl(attachment.storageId);
        const uploadedBy = await ctx.db.get(attachment.uploadedById);
        return {
          ...attachment,
          url,
          uploadedByName: uploadedBy?.name || uploadedBy?.email || "Unknown",
        };
      })
    );

    return attachmentsWithUrls;
  },
});

// Generate upload URL for attachments
export const generateUploadUrl = mutation({
  args: {
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");
    
    return await ctx.storage.generateUploadUrl();
  },
});

// Add attachment to MOC
export const addAttachment = mutation({
  args: {
    mocRequestId: v.id("mocRequests"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");

    const moc = await ctx.db.get(args.mocRequestId);
    if (!moc) throw new ConvexError("MOC not found");

    // Check if user can add attachments
    const canAddAttachment = user.isAdmin ||
      moc.submitterId === args.requestingUserId ||
      moc.assignedToId === args.requestingUserId;

    if (!canAddAttachment) {
      throw new ConvexError("Permission denied to add attachments");
    }

    await ctx.db.insert("mocAttachments", {
      mocRequestId: args.mocRequestId,
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      uploadedById: args.requestingUserId,
    });

    return { success: true };
  },
});

// Delete MOC
export const deleteMocRequest = mutation({
  args: {
    id: v.id("mocRequests"),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const moc = await ctx.db.get(args.id);
    if (!moc) throw new ConvexError("MOC not found");

    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");

    // Check permissions
    const canDelete = user.isAdmin ||
      user.canDeleteAnyMoc ||
      (moc.submitterId === args.requestingUserId && 
       (moc.status === "draft" || moc.status === "rejected" || moc.status === "cancelled"));

    if (!canDelete) {
      throw new ConvexError("Permission denied to delete this MOC");
    }

    // Delete attachments first
    const attachments = await ctx.db
      .query("mocAttachments")
      .withIndex("by_moc", (q) => q.eq("mocRequestId", args.id))
      .collect();

    for (const attachment of attachments) {
      await ctx.storage.delete(attachment.storageId);
      await ctx.db.delete(attachment._id);
    }

    // Delete notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_moc", (q) => q.eq("mocRequestId", args.id))
      .collect();

    for (const notification of notifications) {
      await ctx.db.delete(notification._id);
    }

    // Delete edit history
    const editHistory = await ctx.db
      .query("editHistory")
      .withIndex("by_moc", (q) => q.eq("mocRequestId", args.id))
      .collect();

    for (const edit of editHistory) {
      await ctx.db.delete(edit._id);
    }

    // Delete the MOC
    await ctx.db.delete(args.id);

    return { success: true };
  },
});

// Resubmit MOC (for rejected MOCs)
export const resubmitMocRequest = mutation({
  args: {
    id: v.id("mocRequests"),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const moc = await ctx.db.get(args.id);
    if (!moc) throw new ConvexError("MOC not found");

    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");

    // Check permissions
    const canResubmit = user.isAdmin || moc.submitterId === args.requestingUserId;
    if (!canResubmit) {
      throw new ConvexError("Permission denied to resubmit this MOC");
    }

    if (moc.status !== "rejected") {
      throw new ConvexError("Only rejected MOCs can be resubmitted");
    }

    // Reset department approvals
    const departmentApprovals = moc.departmentsAffected
      ? await Promise.all(moc.departmentsAffected.map(async (deptId) => {
          try {
            const department = await ctx.db.get(deptId);
            return {
              departmentId: deptId,
              status: "pending" as const,
              approverId: department?.approverUserIds?.[0],
            };
          } catch (error) {
            console.error(`Error fetching department ${deptId}:`, error);
            return {
              departmentId: deptId,
              status: "pending" as const,
              approverId: undefined,
            };
          }
        }))
      : [];

    await ctx.db.patch(args.id, {
      status: "pending_department_approval",
      submittedAt: Date.now(),
      departmentApprovals,
      reviewedAt: undefined,
      reviewerId: undefined,
      reviewComments: undefined,
      technicalAuthorityApprovals: {},
    });

    return { success: true };
  },
});

// Internal function to log edit history
export const logEditHistory = internalMutation({
  args: {
    mocRequestId: v.id("mocRequests"),
    editedById: v.id("users"),
    changesDescription: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.editedById);
    if (!user) return;

    await ctx.db.insert("editHistory", {
      mocRequestId: args.mocRequestId,
      editedById: args.editedById,
      editedByName: user.name || user.email || "Unknown",
      changesDescription: args.changesDescription,
      editedAt: Date.now(),
    });
  },
});

// Reset MOC numbering
export const resetMocNumbering = mutation({
  args: { requestingUserId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.requestingUserId);
    if (!user?.isAdmin) throw new ConvexError("Only admins can reset MOC numbering");
    const allMocs = await ctx.db.query("mocRequests").order("asc").collect();
    for (let i = 0; i < allMocs.length; i++) {
      await ctx.db.patch(allMocs[i]._id, {
        mocNumber: i + 1,
        mocIdString: `MOC-${i + 1}`,
      });
    }
    return { success: true, updatedCount: allMocs.length };
  },
});

// Get edit logs summary
export const getEditLogsSummary = query({
  args: {
    mocRequestId: v.id("mocRequests"),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.requestingUserId);
    if (!user) throw new ConvexError("User not found");

    const editHistory = await ctx.db
      .query("editHistory")
      .withIndex("by_moc", (q) => q.eq("mocRequestId", args.mocRequestId))
      .order("desc")
      .collect();

    return editHistory;
  },
});
