"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import * as XLSX from 'xlsx';

export const exportMocsToExcel = action({
  args: {
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    downloadUrl: string | null;
    fileName: string;
    recordCount: number;
  }> => {
    // Verify the user exists
    const user = await ctx.runQuery(internal.userInternal.getUserProfileByUserId, { 
      userId: args.requestingUserId 
    });
    if (!user) throw new ConvexError("User not found.");

    // All authenticated users can export MOCs
    // No permission check needed - any logged-in user can export

    // Fetch all MOC requests with detailed information
    const mocRequests: any[] = await ctx.runQuery(api.mocExport.getAllMocRequestsForExport, {
      requestingUserId: args.requestingUserId
    });

    // Prepare data for Excel export
    const excelData = mocRequests.map((moc: any, index: number) => ({
      'Row #': index + 1,
      'MOC ID': moc.mocIdString || 'N/A',
      'Title': moc.title || '',
      'Description': moc.description || '',
      'Status': moc.status || '',
      'Submitter': moc.submitterName || 'Unknown',
      'Assigned To': moc.assignedToName || 'N/A',
      'Requested By Department': moc.requestedByDepartmentName || 'N/A',
      'Date Raised': moc.dateRaised ? new Date(moc.dateRaised).toLocaleDateString() : 'N/A',
      'Date Submitted': moc.submittedAt ? new Date(moc.submittedAt).toLocaleDateString() : 'N/A',
      'Date Reviewed': moc.reviewedAt ? new Date(moc.reviewedAt).toLocaleDateString() : 'N/A',
      'Reviewer': moc.reviewerName || 'N/A',
      'Review Comments': moc.reviewComments || '',
      'Reason for Change': moc.reasonForChange || '',
      'Change Type': moc.changeType || '',
      'Change Category': moc.changeCategory || '',
      'Change Category Other': moc.changeCategoryOther || '',
      'Departments Affected': moc.departmentsAffectedNames?.join(', ') || '',
      'Risk Assessment Required': moc.riskAssessmentRequired ? 'Yes' : 'No',
      'Impact Assessment': moc.impactAssessment || '',
      'HSE Impact Assessment': moc.hseImpactAssessment || '',
      'Risk Evaluation': moc.riskEvaluation || '',
      'Risk Level (Post-Mitigation)': moc.riskLevelPostMitigation || '',
      'Pre-Change Condition': moc.preChangeCondition || '',
      'Post-Change Condition': moc.postChangeCondition || '',
      'Supporting Documents Notes': moc.supportingDocumentsNotes || '',
      'Training Required': moc.trainingRequired ? 'Yes' : 'No',
      'Training Details': moc.trainingDetails || '',
      'Start Date': moc.startDateOfChange ? new Date(moc.startDateOfChange).toLocaleDateString() : 'N/A',
      'Expected Completion': moc.expectedCompletionDate ? new Date(moc.expectedCompletionDate).toLocaleDateString() : 'N/A',
      'Deadline': moc.deadline ? new Date(moc.deadline).toLocaleDateString() : 'N/A',
      'Implementation Owner': moc.implementationOwner || '',
      'Verification Text': moc.verificationOfCompletionText || '',
      'Post Implementation Review': moc.postImplementationReviewText || '',
      'Closeout Approved By': moc.closeoutApprovedByText || '',
      'Technical Authority Approvers': moc.technicalAuthorityApproverNames?.join(', ') || 'N/A',
      'Closeout Approvers': moc.closeOutApproverNames?.join(', ') || 'N/A',
      'Viewers': moc.viewerNames?.join(', ') || 'N/A',
    }));

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Auto-size columns
    const columnWidths = Object.keys(excelData[0] || {}).map(key => ({
      wch: Math.max(key.length, 15) // Minimum width of 15 characters
    }));
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MOC Requests');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx' 
    });

    // Store the file in Convex storage
    const blob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const storageId = await ctx.storage.store(blob);
    
    // Generate a download URL
    const downloadUrl = await ctx.storage.getUrl(storageId);
    
    return {
      success: true,
      downloadUrl,
      fileName: `MOC_Export_${new Date().toISOString().split('T')[0]}.xlsx`,
      recordCount: mocRequests.length
    };
  },
});
