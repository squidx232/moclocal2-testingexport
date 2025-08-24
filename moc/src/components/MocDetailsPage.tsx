import React, { useState, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id, Doc } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { formatDateToDDMMYY, formatTimestampToDateTime } from '../lib/utils';
import { Printer, History, Trash2, FileText } from 'lucide-react';
import EditHistoryModal from './EditHistoryModal';
import MocAttachments from './MocAttachments';

interface MocDetailsPageProps {
  mocId: Id<"mocRequests">;
  onEdit: (mocId: Id<"mocRequests">) => void;
  currentUser?: any;
}

type AttachmentWithUrl = Doc<"mocAttachments"> & { url?: string | null; uploadedByName?: string; size?: number };
type DepartmentApprovalWithName = NonNullable<Doc<"mocRequests">["departmentApprovals"]>[number] & { departmentName?: string; approverDisplayName?: string; approverEmail?: string; };


export default function MocDetailsPage({ mocId, onEdit, currentUser }: MocDetailsPageProps) {
  const mocDetails = useQuery(api.moc.getRequestDetails, 
    currentUser?._id ? { 
      id: mocId,
      requestingUserId: currentUser._id
    } : "skip"
  );
  const loggedInUser = useQuery(api.auth.loggedInUser);
  const currentUserProfile = useQuery(
    api.users.getCurrentUserById,
    currentUser ? { userId: currentUser._id || currentUser.userId } : "skip"
  );

  const changeStatusMutation = useMutation(api.moc.changeStatus);
  const resubmitMocMutation = useMutation(api.moc.resubmitMocRequest);
  const approveOrRejectDepartmentStepMutation = useMutation(api.moc.approveOrRejectDepartmentStep);
  const deleteMocMutation = useMutation(api.moc.deleteMocRequest);
  const generateUploadUrl = useMutation(api.moc.generateUploadUrl);
  const addAttachmentMutation = useMutation(api.moc.addAttachment);
  const deleteAttachmentMutation = useMutation(api.attachments.deleteAttachment);

  const printRef = useRef<HTMLDivElement>(null);


  const [newStatus, setNewStatus] = useState<string>("");
  const [statusChangeComments, setStatusChangeComments] = useState("");
  const [showStatusModal, setShowStatusModal] = useState(false);

  const [departmentAction, setDepartmentAction] = useState<'approved' | 'rejected' | null>(null);
  const [departmentActionComments, setDepartmentActionComments] = useState("");
  const [departmentActionDeptId, setDepartmentActionDeptId] = useState<Id<"departments"> | null>(null);
  const [showDepartmentActionModal, setShowDepartmentActionModal] = useState(false);
  
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Edit History Modal State
  const [showEditHistoryModal, setShowEditHistoryModal] = useState(false);


  if (!mocDetails) {
    return <div className="text-center p-10">Loading RFC details or RFC not found...</div>;
  }
  
  const { 
    title, description, status, submitterName, assignedToName, reviewerName, _creationTime, submittedAt, reviewedAt, reviewComments,
    mocIdString, dateRaised, requestedByDepartmentName, reasonForChange, changeType, changeCategory, changeCategoryOther,
    departmentsAffectedNames, departmentApprovals, riskAssessmentRequired, impactAssessment, hseImpactAssessment, riskEvaluation,
    riskLevelPostMitigation, preChangeCondition, postChangeCondition, supportingDocumentsNotes,
    trainingRequired, trainingDetails, startDateOfChange, expectedCompletionDate, deadline, implementationOwner,
    verificationOfCompletionText, postImplementationReviewText, closeoutApprovedByText, attachments,
    technicalAuthorityApproverUserIds, viewerIds
  } = mocDetails;

  const userIsAdmin = currentUserProfile?.isAdmin === true;
  const userIsSubmitter = mocDetails.submitterId === currentUser?._id;
  const userIsAssigned = mocDetails.assignedToId === currentUser?._id;
  const userIsTechnicalApprover = technicalAuthorityApproverUserIds?.includes(currentUser?._id as Id<"users">);
  const userIsTechnicalAuthority = userIsTechnicalApprover;
  const userIsAdditionalApprover = false; // Not implemented in this version
  
  // Debug logging
  console.log('Debug - Technical Authority Check:', {
    technicalAuthorityApproverUserIds: mocDetails.technicalAuthorityApproverUserIds,
    currentUserId: currentUser?._id,
    userIsTechnicalApprover,
    userIsAdmin,
    status
  });


  
  // User permissions calculated above
  const userCanEdit = userIsAdmin || (!!currentUserProfile?.canEditAnyMoc && userIsAdmin) || (userIsSubmitter && (status === "draft" || status === "rejected"));
  const userCanDelete = userIsAdmin || !!currentUserProfile?.canDeleteAnyMoc || (userIsSubmitter && (status === "draft" || status === "rejected" || status === "cancelled"));

  // Check if user can upload attachments - only submitters and when rejecting
  const userCanUploadAttachments = userIsAdmin || userIsSubmitter;
  
  const handleDeleteAttachment = async (attachmentId: Id<"mocAttachments">, fileName: string) => {
    if (window.confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      try {
        await deleteAttachmentMutation({ attachmentId });
        toast.success(`Attachment "${fileName}" deleted successfully.`);
      } catch (error) {
        toast.error(`Failed to delete attachment: ${(error as Error).message}`);
      }
    }
  };

  const availableStatusChanges: Record<string, { next: string; label: string; adminOnly?: boolean; submitterOnly?: boolean, assignedOnly?: boolean, additionalApproverOnly?: boolean, technicalAuthorityOnly?: boolean, finalReviewOnly?: boolean }[]> = {
    draft: [{ next: "pending_department_approval", label: "Submit for Department Approval", submitterOnly: true }],
    pending_department_approval: [
        { next: "cancelled", label: "Cancel RFC", submitterOnly: true },
        { next: "rejected", label: "Reject (Admin Override)", adminOnly: true}
    ],
    pending_final_review: [
      { next: "approved", label: "Approve", finalReviewOnly: true },
      { next: "rejected", label: "Reject", finalReviewOnly: true },
      { next: "cancelled", label: "Cancel RFC", submitterOnly: true },
    ],
    approved: [
      { next: "in_progress", label: "Start Progress" },
      { next: "cancelled", label: "Cancel RFC", submitterOnly: true },
    ],
    rejected: [
      { next: "cancelled", label: "Cancel RFC", submitterOnly: true },
    ],
    in_progress: [
      { next: "completed", label: "Mark as Completed" },
      { next: "cancelled", label: "Cancel RFC (Admin Only)", adminOnly: true },
    ],
    completed: [
        { next: "cancelled", label: "Cancel RFC (Admin Only)", adminOnly: true }, 
    ],
    cancelled: [],
  };

  // Debug available status changes
  console.log('Debug - Available Status Changes:', {
    status,
    availableChanges: availableStatusChanges[status],
    userIsTechnicalAuthority,
    userIsAdmin
  });

  const handleOpenStatusModal = (nextStatus: string) => {
    setNewStatus(nextStatus);
    setShowStatusModal(true);
  };

  const handleStatusChange = async () => {
    if (!newStatus) return;
    try {
      await changeStatusMutation({ 
        id: mocId, 
        newStatus: newStatus as any, 
        comments: statusChangeComments,
        requestingUserId: currentUser._id
      });
      
      // Handle file upload if there's a file and we're rejecting
      if (fileToUpload && newStatus === "rejected") {
        await handleAddAttachment();
      }
      
      toast.success(`RFC status changed to ${newStatus.replace(/_/g, " ")}.`);
      setShowStatusModal(false);
      setStatusChangeComments("");
      setNewStatus("");
      setFileToUpload(null);
      // Clear file input
      const fileInput = document.getElementById('status-file-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      toast.error(`Failed to change status: ${(error as Error).message}`);
    }
  };
  
  const handleResubmit = async () => {
    try {
      await resubmitMocMutation({ id: mocId, requestingUserId: currentUser._id });
      toast.success("RFC resubmitted successfully!");
    } catch (error) {
      toast.error(`Failed to resubmit RFC: ${(error as Error).message}`);
    }
  };

  const handleOpenDepartmentActionModal = (deptId: Id<"departments">, action: 'approved' | 'rejected') => {
    setDepartmentActionDeptId(deptId);
    setDepartmentAction(action);
    setShowDepartmentActionModal(true);
  };

  const handleDepartmentAction = async () => {
    if (!departmentActionDeptId || !departmentAction) return;
    try {
      await approveOrRejectDepartmentStepMutation({
        mocRequestId: mocId,
        departmentId: departmentActionDeptId,
        action: departmentAction,
        comments: departmentActionComments,
        requestingUserId: currentUser._id,
      });
      
      // Handle file upload if there's a file and we're rejecting
      if (fileToUpload && departmentAction === "rejected") {
        await handleAddAttachment();
      }
      
      toast.success(`Department step ${departmentAction}.`);
      setShowDepartmentActionModal(false);
      setDepartmentAction(null);
      setDepartmentActionComments("");
      setDepartmentActionDeptId(null);
      setFileToUpload(null);
      // Clear file input
      const fileInput = document.getElementById('dept-file-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      toast.error(`Failed to action department step: ${(error as Error).message}`);
    }
  };

  const handleDeleteMoc = async () => {
    if (window.confirm("Are you sure you want to delete this RFC request and all its attachments? This action cannot be undone.")) {
        try {
            await deleteMocMutation({ id: mocId, requestingUserId: currentUser._id });
            toast.success("RFC request deleted successfully.");
            // Navigate back to list - functionality to be implemented 
        } catch (error) {
            toast.error(`Failed to delete RFC: ${(error as Error).message}`);
        }
    }
  };
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
        setFileToUpload(event.target.files[0]);
    }
  };

  const handleAddAttachment = async () => {
    if (!fileToUpload) {
        toast.error("Please select a file to upload.");
        return;
    }
    setIsUploading(true);
    try {
        const uploadUrl = await generateUploadUrl({ requestingUserId: currentUser._id });
        const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": fileToUpload.type },
            body: fileToUpload,
        });
        const jsonResult = await result.json();
        if (!result.ok || !jsonResult.storageId) {
          throw new Error(`Upload failed: ${JSON.stringify(jsonResult)}`);
        }
        const { storageId } = jsonResult;

        await addAttachmentMutation({
            mocRequestId: mocId,
            storageId,
            fileName: fileToUpload.name,
            fileType: fileToUpload.type,
            requestingUserId: currentUser._id,
        });
        toast.success(`Attachment "${fileToUpload.name}" added successfully.`);
        setFileToUpload(null);
        const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
        if (fileInput) fileInput.value = "";

    } catch (error) {
        toast.error(`Failed to add attachment: ${(error as Error).message}`);
    } finally {
        setIsUploading(false);
    }
  };

  const handlePrint = () => {
    const printContents = printRef.current?.innerHTML;
    if (printContents) {
      const printWindow = window.open('', '_blank');
      printWindow?.document.write(`
        <html>
          <head>
            <title>RFC Details - ${title}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
              .print-section { margin-bottom: 25px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fafafa; }
              .print-section h2 { font-size: 1.3em; color: #2c3e50; margin: 0 0 15px 0; padding-bottom: 8px; border-bottom: 2px solid #3498db; font-weight: 600; }
              .print-section dt { font-weight: 600; color: #34495e; margin-top: 10px; font-size: 0.95em; }
              .print-section dd { margin-left: 0; margin-bottom: 8px; color: #2c3e50; background: white; padding: 8px; border-radius: 4px; border-left: 3px solid #3498db; }
              .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
              .print-full-width { grid-column: span 2; }
              .no-print { display: none !important; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 0.9em;}
              th { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: 600; }
              .header-section { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; text-align: center; }
              .header-section h1 { margin: 0; font-size: 2em; font-weight: 600; }
              .header-section .rfc-id { font-size: 1.1em; opacity: 0.9; margin-top: 5px; }
              .header-section .status-badge { display: inline-block; padding: 8px 16px; background: rgba(255,255,255,0.2); border-radius: 20px; margin-top: 10px; font-weight: 500; }
            </style>
          </head>
          <body>
            <div class="header-section">
              <h1>RFC Details: ${title}</h1>
              <div class="rfc-id">RFC ID: ${mocIdString || mocDetails._id.slice(-6).toUpperCase()}</div>
              <div class="status-badge">Status: ${status.replace(/_/g, ' ').toUpperCase()}</div>
            </div>
            ${printContents}
          </body>
        </html>
      `);
      printWindow?.document.close();
      printWindow?.focus();
      setTimeout(() => {
        printWindow?.print();
        printWindow?.close();
      }, 500);
    }
  };

  const handleExportWord = () => {
    // Helper function to format dates
    const formatDate = (timestamp: number) => {
      return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // Helper function to format approval status
    const formatApprovalStatus = (status: string) => {
      return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    // Create a comprehensive professional HTML document for Word export
    const htmlContent = `
      <html>
        <head>
          <title>Management of Change Request - ${mocDetails.mocIdString}</title>
          <style>
            body { 
              font-family: 'Calibri', Arial, sans-serif; 
              margin: 30px; 
              line-height: 1.6; 
              color: #333; 
              font-size: 11pt;
            }
            .header { 
              text-align: center; 
              margin-bottom: 40px; 
              border-bottom: 3px solid #2563eb; 
              padding-bottom: 20px; 
            }
            .header h1 { 
              color: #2563eb; 
              font-size: 24pt; 
              margin-bottom: 10px; 
              font-weight: bold;
            }
            .header h2 { 
              color: #555; 
              font-size: 16pt; 
              margin-bottom: 5px;
            }
            .header .moc-id { 
              font-size: 14pt; 
              color: #666; 
              font-weight: bold;
            }
            .section { 
              margin-bottom: 30px; 
              padding: 20px; 
              background: #f8f9fa; 
              border-left: 4px solid #2563eb; 
              page-break-inside: avoid;
            }
            .section h3 { 
              color: #2563eb; 
              font-size: 14pt; 
              margin-bottom: 15px; 
              font-weight: bold;
              border-bottom: 2px solid #2563eb;
              padding-bottom: 5px;
            }
            .field { 
              margin-bottom: 12px; 
              display: flex;
            }
            .label { 
              font-weight: 600; 
              color: #555; 
              min-width: 200px;
              margin-right: 10px;
            }
            .value { 
              color: #333; 
              flex: 1;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 20px 0; 
              font-size: 10pt;
            }
            th, td { 
              border: 1px solid #ddd; 
              padding: 8px; 
              text-align: left; 
              vertical-align: top;
            }
            th { 
              background-color: #2563eb; 
              color: white; 
              font-weight: 600; 
              font-size: 10pt;
            }
            .approval-table th {
              background-color: #059669;
            }
            .signature-section {
              margin-top: 40px;
              page-break-inside: avoid;
            }
            .signature-grid {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
              margin-top: 20px;
            }
            .signature-box {
              border: 1px solid #ddd;
              padding: 15px;
              text-align: center;
              min-height: 100px;
            }
            .signature-line {
              border-top: 1px solid #333;
              margin-top: 40px;
              padding-top: 5px;
            }
            .status-badge {
              display: inline-block;
              padding: 5px 15px;
              background-color: #2563eb;
              color: white;
              border-radius: 20px;
              font-weight: bold;
              font-size: 12pt;
            }
            .page-break {
              page-break-before: always;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 9pt;
              color: #666;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>MANAGEMENT OF CHANGE REQUEST</h1>
            <h2>${mocDetails.title}</h2>
            <div class="moc-id">MOC ID: ${mocDetails.mocIdString}</div>
            <div style="margin-top: 15px;">
              <span class="status-badge">Status: ${formatApprovalStatus(mocDetails.status)}</span>
            </div>
          </div>
          
          <div class="section">
            <h3>1. BASIC INFORMATION</h3>
            <div class="field">
              <span class="label">MOC ID:</span>
              <span class="value">${mocDetails.mocIdString}</span>
            </div>
            <div class="field">
              <span class="label">Title:</span>
              <span class="value">${mocDetails.title}</span>
            </div>
            <div class="field">
              <span class="label">Description:</span>
              <span class="value">${mocDetails.description}</span>
            </div>
            <div class="field">
              <span class="label">Submitter:</span>
              <span class="value">${mocDetails.submitterName}</span>
            </div>
            <div class="field">
              <span class="label">Assigned To:</span>
              <span class="value">${mocDetails.assignedToName || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Requested By Department:</span>
              <span class="value">${mocDetails.requestedByDepartmentName || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Date Raised:</span>
              <span class="value">${formatDate(mocDetails.dateRaised)}</span>
            </div>
            <div class="field">
              <span class="label">Date Submitted:</span>
              <span class="value">${mocDetails.submittedAt ? formatDate(mocDetails.submittedAt) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Date Reviewed:</span>
              <span class="value">${mocDetails.reviewedAt ? formatDate(mocDetails.reviewedAt) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Reviewer:</span>
              <span class="value">${mocDetails.reviewerName || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Review Comments:</span>
              <span class="value">${mocDetails.reviewComments || 'N/A'}</span>
            </div>
          </div>

          <div class="section">
            <h3>2. CHANGE DETAILS</h3>
            <div class="field">
              <span class="label">Reason for Change:</span>
              <span class="value">${mocDetails.reasonForChange || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Change Type:</span>
              <span class="value">${mocDetails.changeType ? formatApprovalStatus(mocDetails.changeType) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Change Category:</span>
              <span class="value">${mocDetails.changeCategory || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Change Category Other:</span>
              <span class="value">${mocDetails.changeCategoryOther || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Departments Affected:</span>
              <span class="value">${mocDetails.departmentsAffectedNames?.join(', ') || 'N/A'}</span>
            </div>
          </div>

          <div class="section">
            <h3>3. RISK ASSESSMENT</h3>
            <div class="field">
              <span class="label">Risk Assessment Required:</span>
              <span class="value">${mocDetails.riskAssessmentRequired ? 'Yes' : 'No'}</span>
            </div>
            <div class="field">
              <span class="label">Impact Assessment:</span>
              <span class="value">${mocDetails.impactAssessment || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">HSE Impact Assessment:</span>
              <span class="value">${mocDetails.hseImpactAssessment || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Risk Evaluation:</span>
              <span class="value">${mocDetails.riskEvaluation || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Risk Level (Post-Mitigation):</span>
              <span class="value">${mocDetails.riskLevelPostMitigation ? formatApprovalStatus(mocDetails.riskLevelPostMitigation) : 'N/A'}</span>
            </div>
          </div>

          <div class="section">
            <h3>4. IMPLEMENTATION DETAILS</h3>
            <div class="field">
              <span class="label">Pre-Change Condition:</span>
              <span class="value">${mocDetails.preChangeCondition || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Post-Change Condition:</span>
              <span class="value">${mocDetails.postChangeCondition || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Implementation Owner:</span>
              <span class="value">${mocDetails.implementationOwner || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Training Required:</span>
              <span class="value">${mocDetails.trainingRequired ? 'Yes' : 'No'}</span>
            </div>
            <div class="field">
              <span class="label">Training Details:</span>
              <span class="value">${mocDetails.trainingDetails || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Start Date of Change:</span>
              <span class="value">${mocDetails.startDateOfChange ? formatDate(mocDetails.startDateOfChange) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Expected Completion Date:</span>
              <span class="value">${mocDetails.expectedCompletionDate ? formatDate(mocDetails.expectedCompletionDate) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Deadline:</span>
              <span class="value">${mocDetails.deadline ? formatDate(mocDetails.deadline) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Supporting Documents Notes:</span>
              <span class="value">${mocDetails.supportingDocumentsNotes || 'N/A'}</span>
            </div>
          </div>

          ${mocDetails.departmentApprovals && mocDetails.departmentApprovals.length > 0 ? `
          <div class="section">
            <h3>5. DEPARTMENT APPROVALS</h3>
            <table class="approval-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Approver</th>
                  <th>Approval Date</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                ${mocDetails.departmentApprovals.map(approval => `
                  <tr>
                    <td>${approval.departmentName}</td>
                    <td>${formatApprovalStatus(approval.status)}</td>
                    <td>${approval.approverDisplayName}</td>
                    <td>${approval.approvedAt ? formatDate(approval.approvedAt) : 'N/A'}</td>
                    <td>${approval.comments || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}

          ${mocDetails.technicalAuthorityApproverNames && mocDetails.technicalAuthorityApproverNames.length > 0 ? `
          <div class="section">
            <h3>6. TECHNICAL AUTHORITY APPROVERS</h3>
            <div class="field">
              <span class="label">Technical Authority Approvers:</span>
              <span class="value">${mocDetails.technicalAuthorityApproverNames.join(', ')}</span>
            </div>
            ${mocDetails.technicalAuthorityApprovals ? `
            <table class="approval-table">
              <thead>
                <tr>
                  <th>Technical Authority</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(mocDetails.technicalAuthorityApprovals).map(([userId, decision]) => {
                  const approverName = mocDetails.technicalAuthorityApproverNames.find((_, index) => 
                    mocDetails.technicalAuthorityApproverUserIds?.[index] === userId
                  ) || 'Unknown';
                  return `
                    <tr>
                      <td>${approverName}</td>
                      <td>${formatApprovalStatus(decision)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ` : ''}
          </div>
          ` : ''}

          ${mocDetails.closeOutApproverNames && mocDetails.closeOutApproverNames.length > 0 ? `
          <div class="section">
            <h3>7. CLOSEOUT APPROVERS</h3>
            <div class="field">
              <span class="label">Closeout Approvers:</span>
              <span class="value">${mocDetails.closeOutApproverNames.join(', ')}</span>
            </div>
            <div class="field">
              <span class="label">Verification of Completion:</span>
              <span class="value">${mocDetails.verificationOfCompletionText || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Post Implementation Review:</span>
              <span class="value">${mocDetails.postImplementationReviewText || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Closeout Approved By:</span>
              <span class="value">${mocDetails.closeoutApprovedByText || 'N/A'}</span>
            </div>
          </div>
          ` : ''}

          ${mocDetails.attachments && mocDetails.attachments.length > 0 ? `
          <div class="section">
            <h3>8. ATTACHMENTS</h3>
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>File Type</th>
                  <th>Uploaded By</th>
                </tr>
              </thead>
              <tbody>
                ${mocDetails.attachments.map(attachment => `
                  <tr>
                    <td>${attachment.fileName}</td>
                    <td>${attachment.fileType}</td>
                    <td>${attachment.uploadedByName}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}

          <div class="signature-section">
            <h3>9. APPROVAL SIGNATURES</h3>
            <div class="signature-grid">
              <div class="signature-box">
                <div><strong>Submitter</strong></div>
                <div style="margin-top: 10px; font-size: 10pt;">${mocDetails.submitterName}</div>
                <div class="signature-line"></div>
                <div style="font-size: 9pt; margin-top: 5px;">Date: ${formatDate(mocDetails.dateRaised)}</div>
              </div>
              <div class="signature-box">
                <div><strong>Department Approver</strong></div>
                <div style="margin-top: 10px; font-size: 10pt;">
                  ${mocDetails.departmentApprovals?.find(a => a.status === 'approved')?.approverDisplayName || 'N/A'}
                </div>
                <div class="signature-line"></div>
                <div style="font-size: 9pt; margin-top: 5px;">
                  Date: ${mocDetails.departmentApprovals?.find(a => a.status === 'approved')?.approvedAt ? 
                    formatDate(mocDetails.departmentApprovals.find(a => a.status === 'approved')!.approvedAt!) : 'N/A'}
                </div>
              </div>
              <div class="signature-box">
                <div><strong>Technical Authority</strong></div>
                <div style="margin-top: 10px; font-size: 10pt;">
                  ${mocDetails.technicalAuthorityApproverNames?.[0] || 'N/A'}
                </div>
                <div class="signature-line"></div>
                <div style="font-size: 9pt; margin-top: 5px;">Date: N/A</div>
              </div>
            </div>
          </div>

          <div class="footer">
            <p><strong>Document Generated:</strong> ${new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
            <p>This document is automatically generated from the Management of Change system.</p>
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MOC_${mocDetails.mocIdString}_${new Date().toISOString().split('T')[0]}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Professional MOC document exported successfully');
  };


  const DetailItem: React.FC<{ label: string; value?: string | number | boolean | string[] | null; isDate?: boolean; isDateTime?: boolean; isBoolean?: boolean; fullWidth?: boolean; className?: string }> = 
    ({ label, value, isDate, isDateTime, isBoolean, fullWidth, className }) => {
    let displayValue: React.ReactNode = "N/A";
    if (value !== undefined && value !== null && value !== "") {
        if (isBoolean) {
            displayValue = value ? "Yes" : "No";
        } else if (isDate && typeof value === 'number') {
            displayValue = formatDateToDDMMYY(value);
        } else if (isDateTime && typeof value === 'number') {
            displayValue = formatTimestampToDateTime(value);
        } else if (Array.isArray(value)) {
            displayValue = value.join(', ');
        }
         else {
            displayValue = String(value);
        }
    }
    return (
      <div className={`py-2 ${fullWidth ? 'sm:col-span-2' : ''} ${className}`}>
        <dt className="text-sm font-medium text-secondary-light">{label}</dt>
        <dd className="mt-1 text-sm text-secondary-dark break-words whitespace-pre-wrap">{displayValue}</dd>
      </div>
    );
  };
  
  const renderStatusBadge = (s: string) => {
    const statusColors: Record<string, string> = {
        draft: "bg-gray-200 text-gray-700",
        pending_department_approval: "bg-yellow-200 text-yellow-800",
        pending_final_review: "bg-yellow-200 text-yellow-800",
        approved: "bg-green-200 text-green-800",
        rejected: "bg-red-200 text-red-800",
        in_progress: "bg-blue-200 text-blue-800",
        completed: "bg-purple-200 text-purple-800",
        cancelled: "bg-pink-200 text-pink-800",
    };
    return <span className={`px-3 py-1 text-sm font-semibold rounded-full ${statusColors[s] || 'bg-gray-300'}`}>{s.replace(/_/g, ' ')}</span>;
  };


  return (
    <div className="bg-white shadow-xl rounded-lg p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-primary truncate" title={title}>{title}</h1>
          <p className="text-sm text-secondary-light mt-1">RFC ID: {mocIdString || mocDetails._id.slice(-6).toUpperCase()}</p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2">
            {renderStatusBadge(status)}
            <div className="flex gap-2 mt-2">
              {userCanEdit && (
                  <button onClick={() => onEdit(mocId)} className="btn btn-outline-primary btn-sm">
                      Edit RFC
                  </button>
              )}
              <button 
                onClick={() => setShowEditHistoryModal(true)} 
                className="btn btn-outline-secondary btn-sm flex items-center gap-1"
              >
                <History size={16} /> Edit History
              </button>
              <button onClick={handlePrint} className="btn btn-outline-secondary btn-sm flex items-center gap-1">
                <Printer size={16} /> Print RFC
              </button>
              <button onClick={handleExportWord} className="btn btn-outline-secondary btn-sm flex items-center gap-1">
                <FileText size={16} /> Export Word
              </button>
            </div>
        </div>
      </div>

      {/* Workflow Information */}
      {(status === "draft" || status === "rejected") && (userIsSubmitter || userIsAdmin) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 no-print">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">📋 RFC Workflow Actions:</h3>
          <div className="text-xs text-blue-700 space-y-1">
            <p><strong>Submit for Department Approval:</strong> Use this for the initial submission or when creating a new RFC. This starts the formal approval process.</p>
            <p><strong>Resubmit RFC:</strong> Use this after an RFC has been rejected and you've made corrections. This resets all approvals and restarts the workflow.</p>
          </div>
        </div>
      )}

      {/* Debug Information (remove in production) */}
      {userIsAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 no-print">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">🔧 Debug Info (Admin Only):</h3>
          <div className="text-xs text-yellow-700 space-y-1">
            <p><strong>Technical Authority Approvers:</strong> {mocDetails.technicalAuthorityApproverUserIds?.length || 0} selected</p>
            <p><strong>Current User ID:</strong> {currentUser?._id || 'None'}</p>
            <p><strong>Is Technical Authority:</strong> {userIsTechnicalAuthority ? 'Yes' : 'No'}</p>
            <p><strong>Is Admin:</strong> {userIsAdmin ? 'Yes' : 'No'}</p>
            <p><strong>Status:</strong> {status}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 no-print">
        {/* Force show approve/reject buttons for technical authority in final review */}
        {status === "pending_final_review" && userIsTechnicalAuthority && (
          <>
            <button 
              onClick={() => handleOpenStatusModal("approved")} 
              className="btn btn-success btn-sm"
              title="Approve this RFC as the Technical Authority"
            >
              ✅ Approve (Technical Authority)
            </button>
            <button 
              onClick={() => handleOpenStatusModal("rejected")} 
              className="btn btn-danger btn-sm"
              title="Reject this RFC as the Technical Authority"
            >
              ❌ Reject (Technical Authority)
            </button>
          </>
        )}
        {availableStatusChanges[status]?.map(change => {
          // Check permissions for each status change
          console.log('Debug - Button Check:', {
            changeNext: change.next,
            changeLabel: change.label,
            technicalAuthorityOnly: change.technicalAuthorityOnly,
            userIsTechnicalAuthority,
            userIsAdmin,
            willShow: !(change.technicalAuthorityOnly && !userIsTechnicalAuthority && !userIsAdmin)
          });

          if (change.adminOnly && !userIsAdmin) return null;
          if (change.submitterOnly && !userIsSubmitter && !userIsAdmin) return null; 
          if (change.assignedOnly && !userIsAssigned && !userIsAdmin) return null;
          if (change.additionalApproverOnly && !userIsAdditionalApprover && !userIsAdmin) return null;
          if (change.technicalAuthorityOnly && !userIsTechnicalAuthority && !userIsAdmin) return null;
          
          // Skip approve/reject buttons if we already showed them above for technical authority
          if (status === "pending_final_review" && userIsTechnicalAuthority && (change.next === "approved" || change.next === "rejected")) {
            return null;
          }
          
          // Special logic for final review
          if (change.finalReviewOnly) {
            if (userIsAdmin) {
              // Admins can always approve/reject
            } else if (mocDetails.technicalAuthorityApproverUserIds && mocDetails.technicalAuthorityApproverUserIds.length > 0) {
              // If technical authority is assigned, only they can approve/reject
              if (!userIsTechnicalAuthority) return null;
            } else {
              // If no technical authority, additional approvers can approve/reject
              if (!userIsAdditionalApprover) return null;
            }
          }

          return (
            <button 
              key={change.next} 
              onClick={() => handleOpenStatusModal(change.next)} 
              className="btn btn-primary btn-sm"
              title={
                change.next === "pending_department_approval" 
                  ? "Submit this RFC for department approval. This is the initial submission that starts the approval workflow."
                  : `Change RFC status to ${change.next.replace(/_/g, ' ')}`
              }
            >
              {change.label}
            </button>
          );
        })}
        {(status === "rejected" || status === "draft") && (userIsSubmitter || userIsAdmin) && (
          <button 
            onClick={handleResubmit} 
            className="btn btn-success btn-sm"
            title="Resubmit this RFC after making corrections. This will reset all department approvals and move the RFC back to pending department approval status."
          >
            Resubmit RFC
          </button>
        )}
        {userCanDelete && (
            <button onClick={handleDeleteMoc} className="btn btn-danger btn-sm">
                Delete RFC
            </button>
        )}
      </div>

      {/* Department Approvals Section */}
      {status === "pending_department_approval" && departmentApprovals && departmentApprovals.length > 0 && (
        <div className="p-4 border rounded-md bg-yellow-50 border-yellow-300 no-print">
            <h3 className="text-md font-semibold text-yellow-800 mb-3">Pending Department Approvals:</h3>
            <ul className="space-y-3">
                {departmentApprovals.filter((da: DepartmentApprovalWithName) => da.status === "pending").map((da: DepartmentApprovalWithName) => (
                    <li key={da.departmentId} className="p-3 bg-white rounded shadow-sm border border-gray-200">
                        <p className="font-medium text-secondary-dark">{da.departmentName || "Unknown Department"}</p>
                        {(userIsAdmin || (currentUser?._id && da.approverId === currentUser._id)) && (
                             <div className="mt-2 flex gap-2">
                                <button onClick={() => handleOpenDepartmentActionModal(da.departmentId, 'approved')} className="btn btn-success btn-xs">Approve</button>
                                <button onClick={() => handleOpenDepartmentActionModal(da.departmentId, 'rejected')} className="btn btn-danger btn-xs">Reject</button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
      )}

      {/* Final Review Section */}
      {status === "pending_final_review" && (
        <div className="p-4 border rounded-md bg-blue-50 border-blue-300 no-print">
          <h3 className="text-md font-semibold text-blue-800 mb-3">Pending Final Review</h3>
          <div className="p-3 bg-white rounded shadow-sm border border-gray-200">
            <p className="font-medium text-secondary-dark">
              Technical Authority: {"Not Assigned"}
            </p>
            {userIsTechnicalAuthority && (
              <p className="text-sm text-blue-600 mt-2">
                ✅ You are the assigned Technical Authority for this RFC. You can approve or reject it above.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Printable Content Area */}
      <div ref={printRef}>
        <div className="print-section">
          <h2>General Information</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <DetailItem label="Description" value={description} fullWidth className="print-full-width" />
            <DetailItem label="Reason for Change" value={reasonForChange} fullWidth className="print-full-width" />
            <DetailItem label="Submitter" value={submitterName} />
            <DetailItem label="Assigned To" value={assignedToName} />
            <DetailItem label="Technical Authority" value={"Not Assigned"} />
            <DetailItem label="Created At" value={_creationTime} isDateTime />
            <DetailItem label="Date Raised" value={dateRaised} isDate />
            <DetailItem label="Requested By Department" value={requestedByDepartmentName} />
            <DetailItem label="Change Type" value={changeType} />
            <DetailItem label="Change Category" value={changeCategory} />
            {changeCategoryOther && <DetailItem label="Other Category" value={changeCategoryOther} />}
            <DetailItem label="Departments Affected" value={departmentsAffectedNames?.join(', ')} fullWidth className="print-full-width"/>
          </dl>
        </div>

        <div className="print-section">
          <h2>Risk & Impact Assessment</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <DetailItem label="Risk Assessment Required" value={riskAssessmentRequired} isBoolean />
            <DetailItem label="Impact Assessment" value={impactAssessment} fullWidth className="print-full-width" />
            <DetailItem label="HSE Impact Assessment" value={hseImpactAssessment} fullWidth className="print-full-width" />
            <DetailItem label="Risk Evaluation" value={riskEvaluation} fullWidth className="print-full-width" />
            <DetailItem label="Risk Level (Post-Mitigation)" value={riskLevelPostMitigation} />
            <DetailItem label="Pre-Change Condition" value={preChangeCondition} fullWidth className="print-full-width" />
            <DetailItem label="Post-Change Condition" value={postChangeCondition} fullWidth className="print-full-width" />
          </dl>
        </div>
        
        <div className="print-section">
          <h2>Implementation Details</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <DetailItem label="Training Required" value={trainingRequired} isBoolean />
            {trainingRequired && <DetailItem label="Training Details" value={trainingDetails} fullWidth className="print-full-width" />}
            <DetailItem label="Start Date of Change" value={startDateOfChange} isDate />
            <DetailItem label="Expected Completion Date" value={expectedCompletionDate} isDate />
            <DetailItem label="Original Deadline" value={deadline} isDate />
            <DetailItem label="Implementation Owner" value={implementationOwner} />
          </dl>
        </div>

        <div className="print-section">
          <h2>Documentation & Review</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <DetailItem label="Supporting Documents Notes" value={supportingDocumentsNotes} fullWidth className="print-full-width" />
            <DetailItem label="Verification of Completion" value={verificationOfCompletionText} fullWidth className="print-full-width" />
            <DetailItem label="Post-Implementation Review" value={postImplementationReviewText} fullWidth className="print-full-width" />
            <DetailItem label="Closeout Approved By" value={closeoutApprovedByText} fullWidth className="print-full-width" />
          </dl>
        </div>

        <div className="print-section">
          <h2>Review & Approval Information</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {submittedAt && <DetailItem label="Submitted At" value={submittedAt} isDateTime />}
            {reviewerName && <DetailItem label="Final Reviewer" value={reviewerName} />}
            {reviewedAt && <DetailItem label="Final Reviewed At" value={reviewedAt} isDateTime />}
            {reviewComments && <DetailItem label="Final Review Comments" value={reviewComments} fullWidth className="print-full-width" />}
          </dl>
        </div>
      
        {/* Department Approvals History for Print */}
        {departmentApprovals && departmentApprovals.length > 0 && (
          <div className="print-section">
              <h3 className="text-lg font-semibold text-secondary-dark mt-6 mb-3">Department Approval History</h3>
              <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                          <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-secondary-light uppercase tracking-wider">Department</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-secondary-light uppercase tracking-wider">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-secondary-light uppercase tracking-wider">Approver</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-secondary-light uppercase tracking-wider">Date</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-secondary-light uppercase tracking-wider">Comments</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                          {departmentApprovals.map((da: DepartmentApprovalWithName) => (
                              <tr key={da.departmentId}>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-secondary-dark">{da.departmentName}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{renderStatusBadge(da.status)}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-secondary-dark">{da.approverDisplayName || 'N/A'}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-secondary-dark">{da.approvedAt ? formatDateToDDMMYY(da.approvedAt) : 'N/A'}</td>
                                  <td className="px-4 py-2 text-sm text-secondary-dark break-words min-w-[200px]">{da.comments || 'N/A'}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
        )}

        {/* Attachments Section for Print */}
        <div className="print-section">
          <h3 className="text-lg font-semibold text-secondary-dark mt-6 mb-3">Attachments ({attachments?.length || 0})</h3>
          {attachments && attachments.length > 0 ? (
            <ul className="space-y-2 list-disc list-inside">
              {(attachments as AttachmentWithUrl[]).map((att) => (
                <li key={att._id} className="text-sm">
                    {att.fileName} ({att.fileType}, {att.size ? (att.size / 1024).toFixed(1) + ' KB' : 'N/A'}), Uploaded by: {att.uploadedByName} on {formatDateToDDMMYY(att._creationTime)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-secondary-light">No attachments for this RFC.</p>
          )}
        </div>
      </div> {/* End of printRef div */}


      {/* Attachments Section */}
      <div className="no-print">
        <MocAttachments 
          mocId={mocId} 
          currentUser={currentUser} 
          showDeleteButton={userCanUploadAttachments}
        />
        
        {/* Upload Section for authorized users */}
        {userCanUploadAttachments && (
          <div className="mt-4">
            <div className="mb-4 p-3 border rounded-md bg-gray-50 flex flex-col sm:flex-row gap-3 items-center">
              <input type="file" id="file-upload-input" onChange={handleFileUpload} className="input-field sm:flex-grow" />
              <button onClick={handleAddAttachment} className="btn btn-secondary btn-sm w-full sm:w-auto" disabled={!fileToUpload || isUploading}>
                {isUploading ? "Uploading..." : "Add Attachment"}
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Status Change Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Change RFC Status to "{newStatus.replace(/_/g, " ")}"</h3>
            <textarea
              value={statusChangeComments}
              onChange={(e) => setStatusChangeComments(e.target.value)}
              placeholder="Add comments (optional for some statuses, required for rejection)"
              className="input-field w-full mb-4"
              rows={3}
            />
            {/* File upload for rejection */}
            {newStatus === "rejected" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Attach supporting documents (optional)
                </label>
                <input 
                  type="file" 
                  id="status-file-upload-input"
                  onChange={handleFileUpload} 
                  className="input-field w-full"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowStatusModal(false)} className="btn btn-outline-secondary">Cancel</button>
              <button onClick={handleStatusChange} className="btn btn-primary">Confirm Change</button>
            </div>
          </div>
        </div>
      )}

      {/* Department Action Modal */}
      {showDepartmentActionModal && departmentActionDeptId && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 no-print">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">
                    {departmentAction === "approved" ? "Approve" : "Reject"} Department Step
                </h3>
                <textarea
                value={departmentActionComments}
                onChange={(e) => setDepartmentActionComments(e.target.value)}
                placeholder={`Comments for ${departmentAction} (optional for approval, recommended for rejection)`}
                className="input-field w-full mb-4"
                rows={3}
                />
                {/* File upload for rejection only */}
                {departmentAction === "rejected" && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Attach supporting documents (optional)
                    </label>
                    <input 
                      type="file" 
                      id="dept-file-upload-input"
                      onChange={handleFileUpload} 
                      className="input-field w-full"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                <button onClick={() => setShowDepartmentActionModal(false)} className="btn btn-outline-secondary">Cancel</button>
                <button onClick={handleDepartmentAction} className={`btn ${departmentAction === "approved" ? "btn-success" : "btn-danger"}`}>
                    Confirm {departmentAction === "approved" ? "Approval" : "Rejection"}
                </button>
                </div>
            </div>
        </div>
      )}

      {/* Edit History Modal */}
      <EditHistoryModal 
        mocRequestId={mocId}
        isOpen={showEditHistoryModal}
        onClose={() => setShowEditHistoryModal(false)}
      />
    </div>
  );
}
