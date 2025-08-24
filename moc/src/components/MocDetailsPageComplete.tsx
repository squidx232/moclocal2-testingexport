import React, { useState, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id, Doc } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { formatDateToDDMMYY, formatTimestampToDateTime } from '../lib/utils';
import { 
  Printer, 
  History, 
  Trash2, 
  ArrowLeft, 
  FileText, 
  User, 
  Shield, 
  Calendar, 
  Building, 
  Settings, 
  Users, 
  Target, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Eye,
  Edit3,
  BookOpen,
  MapPin,
  Activity,
  Briefcase
} from 'lucide-react';
import EditHistoryModal from './EditHistoryModal';

interface MocDetailsPageProps {
  mocId: Id<"mocRequests">;
  onBack: () => void;
  onEdit: (mocId: Id<"mocRequests">) => void;
  currentUser?: any;
}

type AttachmentWithUrl = Doc<"mocAttachments"> & { url?: string | null; uploadedByName?: string; size?: number };
type DepartmentApprovalWithName = NonNullable<Doc<"mocRequests">["departmentApprovals"]>[number] & { departmentName?: string; approverDisplayName?: string; approverEmail?: string; };

export default function MocDetailsPageComplete({ mocId, onBack, onEdit, currentUser }: MocDetailsPageProps) {
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
  const [showEditHistoryModal, setShowEditHistoryModal] = useState(false);

  if (!mocDetails) {
    return <div className="text-center p-10">Loading RFC details or RFC not found...</div>;
  }
  
  const { 
    title, description, status, submitterName, assignedToName, reviewerName, _creationTime, submittedAt, reviewedAt, reviewComments,
    mocIdString, dateRaised, requestedByDepartmentName, reasonForChange, changeType, changeCategory, changeCategoryOther,
    departmentsAffectedNames, departmentApprovals, riskAssessmentRequired, impactAssessment, hseImpactAssessment, riskEvaluation,
    riskLevelPreMitigation, riskMatrixPreMitigation, riskLevelPostMitigation, riskMatrixPostMitigation,
    preChangeCondition, postChangeCondition, supportingDocumentsNotes,
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

  const availableStatusChanges: Record<string, { next: string; label: string; adminOnly?: boolean; submitterOnly?: boolean, assignedOnly?: boolean, additionalApproverOnly?: boolean }[]> = {
    draft: [{ next: "pending_department_approval", label: "Submit for Department Approval" }],
    pending_department_approval: [
        { next: "cancelled", label: "Cancel RFC", submitterOnly: true },
        { next: "rejected", label: "Reject (Admin Override)", adminOnly: true}
    ],
    pending_final_review: [
      { next: "approved", label: "Approve" },
      { next: "rejected", label: "Reject" },
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
      
      if (fileToUpload && newStatus === "rejected") {
        await handleAddAttachment();
      }
      
      toast.success(`RFC status changed to ${newStatus.replace(/_/g, " ")}.`);
      setShowStatusModal(false);
      setStatusChangeComments("");
      setNewStatus("");
      setFileToUpload(null);
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
      
      if (fileToUpload && departmentAction === "rejected") {
        await handleAddAttachment();
      }
      
      toast.success(`Department step ${departmentAction}.`);
      setShowDepartmentActionModal(false);
      setDepartmentAction(null);
      setDepartmentActionComments("");
      setDepartmentActionDeptId(null);
      setFileToUpload(null);
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
            onBack();
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
              <span class="label">Risk Level (Pre-Mitigation):</span>
              <span class="value">${mocDetails.riskLevelPreMitigation ? formatApprovalStatus(mocDetails.riskLevelPreMitigation) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Risk Matrix (Pre-Mitigation):</span>
              <span class="value">${mocDetails.riskMatrixPreMitigation || 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Risk Level (Post-Mitigation):</span>
              <span class="value">${mocDetails.riskLevelPostMitigation ? formatApprovalStatus(mocDetails.riskLevelPostMitigation) : 'N/A'}</span>
            </div>
            <div class="field">
              <span class="label">Risk Matrix (Post-Mitigation):</span>
              <span class="value">${mocDetails.riskMatrixPostMitigation || 'N/A'}</span>
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

  const DetailItem: React.FC<{ 
    label: string; 
    value?: string | number | boolean | string[] | null; 
    isDate?: boolean; 
    isDateTime?: boolean; 
    isBoolean?: boolean; 
    fullWidth?: boolean; 
    className?: string;
    icon?: React.ReactNode;
  }> = ({ label, value, isDate, isDateTime, isBoolean, fullWidth, className, icon }) => {
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
        } else {
            displayValue = String(value);
        }
    }
    
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow ${fullWidth ? 'col-span-full' : ''} ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          {icon && <span className="text-blue-600">{icon}</span>}
          <dt className="text-sm font-semibold text-gray-700">{label}</dt>
        </div>
        <dd className="text-sm text-gray-900 break-words whitespace-pre-wrap leading-relaxed">
          {displayValue}
        </dd>
      </div>
    );
  };
  
  const renderStatusBadge = (s: string) => {
    const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
        draft: { bg: "bg-gray-100", text: "text-gray-700", icon: <Edit3 size={14} /> },
        pending_department_approval: { bg: "bg-yellow-100", text: "text-yellow-800", icon: <Clock size={14} /> },
        pending_final_review: { bg: "bg-blue-100", text: "text-blue-800", icon: <Eye size={14} /> },
        approved: { bg: "bg-green-100", text: "text-green-800", icon: <CheckCircle size={14} /> },
        rejected: { bg: "bg-red-100", text: "text-red-800", icon: <AlertTriangle size={14} /> },
        in_progress: { bg: "bg-indigo-100", text: "text-indigo-800", icon: <Settings size={14} /> },
        completed: { bg: "bg-purple-100", text: "text-purple-800", icon: <Target size={14} /> },
        cancelled: { bg: "bg-pink-100", text: "text-pink-800", icon: <AlertTriangle size={14} /> },
    };
    
    const config = statusConfig[s] || { bg: "bg-gray-100", text: "text-gray-700", icon: null };
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full ${config.bg} ${config.text}`}>
        {config.icon}
        {s.replace(/_/g, ' ').toUpperCase()}
      </span>
    );
  };

  const SectionHeader: React.FC<{ title: string; icon: React.ReactNode; description?: string }> = ({ title, icon, description }) => (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
        <span className="text-blue-600">{icon}</span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="font-medium">Back to List</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 truncate max-w-2xl" title={title}>
                  {title}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  RFC ID: {mocIdString || mocDetails._id.slice(-6).toUpperCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {renderStatusBadge(status)}
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white border-b border-gray-200 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {availableStatusChanges[status]?.map(change => {
              if (change.adminOnly && !userIsAdmin) return null;
              if (change.submitterOnly && !userIsSubmitter && !userIsAdmin) return null; 
              if (change.assignedOnly && !userIsAssigned && !userIsAdmin) return null;
              if (change.additionalApproverOnly && !userIsAdditionalApprover && !userIsAdmin) return null;
              
              if (status === "pending_final_review" && (change.next === "approved" || change.next === "rejected")) {
                if (!userIsAdmin && !userIsTechnicalAuthority && !userIsAdditionalApprover) return null;
              }

              return (
                <button 
                  key={change.next} 
                  onClick={() => handleOpenStatusModal(change.next)} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                >
                  {change.label}
                </button>
              );
            })}
            
            {(status === "rejected" || status === "draft") && (userIsSubmitter || userIsAdmin) && (
              <button 
                onClick={handleResubmit} 
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
              >
                Resubmit RFC
              </button>
            )}
            
            {userCanEdit && (
              <button 
                onClick={() => onEdit?.(mocId)} 
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm flex items-center gap-2"
              >
                <Edit3 size={16} />
                Edit RFC
              </button>
            )}
            
            <button 
              onClick={() => setShowEditHistoryModal(true)} 
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm flex items-center gap-2"
            >
              <History size={16} />
              Edit History
            </button>
            
            <button 
              onClick={handlePrint} 
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm flex items-center gap-2"
            >
              <Printer size={16} />
              Print RFC
            </button>
            
            <button 
              onClick={handleExportWord} 
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm flex items-center gap-2"
            >
              <FileText size={16} />
              Export Word
            </button>
            
            {userCanDelete && (
              <button 
                onClick={handleDeleteMoc} 
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm flex items-center gap-2"
              >
                <Trash2 size={16} />
                Delete RFC
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Department Approvals Alert */}
      {status === "pending_department_approval" && departmentApprovals && departmentApprovals.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 no-print">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="text-yellow-600" size={20} />
              <h3 className="font-semibold text-yellow-800">Pending Department Approvals</h3>
            </div>
            <div className="space-y-3">
              {departmentApprovals.filter((da: DepartmentApprovalWithName) => da.status === "pending").map((da: DepartmentApprovalWithName) => (
                <div key={da.departmentId} className="bg-white rounded-lg p-3 border border-yellow-200">
                  <p className="font-medium text-gray-900">{da.departmentName || "Unknown Department"}</p>
                  {(userIsAdmin || (currentUser?.email && da.approverEmail === currentUser.email)) && (
                    <div className="mt-2 flex gap-2">
                      <button 
                        onClick={() => handleOpenDepartmentActionModal(da.departmentId, 'approved')} 
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleOpenDepartmentActionModal(da.departmentId, 'rejected')} 
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div ref={printRef} className="space-y-8">
          {/* Basic Information */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <SectionHeader 
              title="Basic Information" 
              icon={<FileText size={20} />}
              description="Core details and overview of the RFC"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <DetailItem 
                label="Description" 
                value={description} 
                fullWidth 
                icon={<FileText size={16} />}
              />
              <DetailItem 
                label="Reason for Change" 
                value={reasonForChange} 
                fullWidth 
                icon={<AlertTriangle size={16} />}
              />
              <DetailItem 
                label="Submitter" 
                value={submitterName} 
                icon={<User size={16} />}
              />
              <DetailItem 
                label="Assigned To" 
                value={assignedToName} 
                icon={<User size={16} />}
              />
              <DetailItem 
                label="Technical Authority" 
                value={technicalAuthorityApproverUserIds && technicalAuthorityApproverUserIds.length > 0 ? "Assigned" : "Auto-approve after departments"} 
                icon={<Shield size={16} />}
              />
              <DetailItem 
                label="Created At" 
                value={_creationTime} 
                isDateTime 
                icon={<Calendar size={16} />}
              />
              <DetailItem 
                label="Date Raised" 
                value={dateRaised} 
                isDate 
                icon={<Calendar size={16} />}
              />
              <DetailItem 
                label="Requesting Department" 
                value={requestedByDepartmentName} 
                icon={<Building size={16} />}
              />
              <DetailItem 
                label="Change Type" 
                value={changeType} 
                icon={<Settings size={16} />}
              />
              <DetailItem 
                label="Change Category" 
                value={changeCategory} 
                icon={<Settings size={16} />}
              />
              {changeCategoryOther && (
                <DetailItem 
                  label="Other Category" 
                  value={changeCategoryOther} 
                  icon={<Settings size={16} />}
                />
              )}
              <DetailItem 
                label="Departments Affected" 
                value={departmentsAffectedNames?.join(', ')} 
                fullWidth 
                icon={<Users size={16} />}
              />
            </div>
          </section>

          {/* Risk & Impact Assessment */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <SectionHeader 
              title="Risk & Impact Assessment" 
              icon={<Shield size={20} />}
              description="Risk evaluation and impact analysis"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <DetailItem 
                label="Risk Assessment Required" 
                value={riskAssessmentRequired} 
                isBoolean 
                icon={<AlertTriangle size={16} />}
              />
              <DetailItem 
                label="Impact Assessment" 
                value={impactAssessment} 
                fullWidth 
                icon={<Target size={16} />}
              />
              <DetailItem 
                label="HSE Impact Assessment" 
                value={hseImpactAssessment} 
                fullWidth 
                icon={<Shield size={16} />}
              />
              <DetailItem 
                label="Risk Evaluation" 
                value={riskEvaluation} 
                fullWidth 
                icon={<AlertTriangle size={16} />}
              />
              <DetailItem 
                label="Risk Level (Pre-Mitigation)" 
                value={riskLevelPreMitigation} 
                icon={<AlertTriangle size={16} />}
              />
              <DetailItem 
                label="Risk Matrix (Pre-Mitigation)" 
                value={riskMatrixPreMitigation} 
                icon={<Activity size={16} />}
              />
              <DetailItem 
                label="Risk Level (Post-Mitigation)" 
                value={riskLevelPostMitigation} 
                icon={<Shield size={16} />}
              />
              <DetailItem 
                label="Risk Matrix (Post-Mitigation)" 
                value={riskMatrixPostMitigation} 
                icon={<Activity size={16} />}
              />
              <DetailItem 
                label="Pre-Change Condition" 
                value={preChangeCondition} 
                fullWidth 
                icon={<MapPin size={16} />}
              />
              <DetailItem 
                label="Post-Change Condition" 
                value={postChangeCondition} 
                fullWidth 
                icon={<CheckCircle size={16} />}
              />
            </div>
          </section>
          
          {/* Implementation Details */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <SectionHeader 
              title="Implementation Details" 
              icon={<Settings size={20} />}
              description="Timeline, ownership, and execution plan"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <DetailItem 
                label="Training Required" 
                value={trainingRequired} 
                isBoolean 
                icon={<BookOpen size={16} />}
              />
              {trainingRequired && (
                <DetailItem 
                  label="Training Details" 
                  value={trainingDetails} 
                  fullWidth 
                  icon={<BookOpen size={16} />}
                />
              )}
              <DetailItem 
                label="Start Date of Change" 
                value={startDateOfChange} 
                isDate 
                icon={<Calendar size={16} />}
              />
              <DetailItem 
                label="Expected Completion Date" 
                value={expectedCompletionDate} 
                isDate 
                icon={<Calendar size={16} />}
              />
              <DetailItem 
                label="Original Deadline" 
                value={deadline} 
                isDate 
                icon={<Clock size={16} />}
              />
              <DetailItem 
                label="Implementation Owner" 
                value={implementationOwner} 
                icon={<Briefcase size={16} />}
              />
            </div>
          </section>

          {/* Documentation & Review */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <SectionHeader 
              title="Documentation & Review" 
              icon={<FileText size={20} />}
              description="Supporting documentation and review processes"
            />
            <div className="grid grid-cols-1 gap-4">
              <DetailItem 
                label="Supporting Documents Notes" 
                value={supportingDocumentsNotes} 
                fullWidth 
                icon={<FileText size={16} />}
              />

              <DetailItem 
                label="Verification of Completion" 
                value={verificationOfCompletionText} 
                fullWidth 
                icon={<CheckCircle size={16} />}
              />
              <DetailItem 
                label="Post-Implementation Review" 
                value={postImplementationReviewText} 
                fullWidth 
                icon={<Eye size={16} />}
              />
              <DetailItem 
                label="Closeout Approved By" 
                value={closeoutApprovedByText} 
                fullWidth 
                icon={<User size={16} />}
              />
            </div>
          </section>

          {/* Review & Approval Information */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <SectionHeader 
              title="Review & Approval Information" 
              icon={<CheckCircle size={20} />}
              description="Approval workflow and review history"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {submittedAt && (
                <DetailItem 
                  label="Submitted At" 
                  value={submittedAt} 
                  isDateTime 
                  icon={<Calendar size={16} />}
                />
              )}
              {reviewerName && (
                <DetailItem 
                  label="Final Reviewer" 
                  value={reviewerName} 
                  icon={<User size={16} />}
                />
              )}
              {reviewedAt && (
                <DetailItem 
                  label="Final Reviewed At" 
                  value={reviewedAt} 
                  isDateTime 
                  icon={<Calendar size={16} />}
                />
              )}
              {reviewComments && (
                <DetailItem 
                  label="Final Review Comments" 
                  value={reviewComments} 
                  fullWidth 
                  icon={<FileText size={16} />}
                />
              )}
            </div>
          </section>
      
          {/* Department Approvals History */}
          {departmentApprovals && departmentApprovals.length > 0 && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <SectionHeader 
                title="Department Approval History" 
                icon={<Users size={20} />}
                description="Approval status by department"
              />
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approver</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {departmentApprovals.map((da: DepartmentApprovalWithName) => (
                      <tr key={da.departmentId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {da.departmentName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {renderStatusBadge(da.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {da.approverDisplayName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {da.approvedAt ? formatDateToDDMMYY(da.approvedAt) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs break-words">
                          {da.comments || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Attachments Section */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <SectionHeader 
              title={`Attachments (${attachments?.length || 0})`}
              icon={<FileText size={20} />}
              description="Supporting documents and files"
            />
            
            {userCanUploadAttachments && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 no-print">
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <input 
                    type="file" 
                    id="file-upload-input" 
                    onChange={handleFileUpload} 
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  />
                  <button 
                    onClick={handleAddAttachment} 
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed" 
                    disabled={!fileToUpload || isUploading}
                  >
                    {isUploading ? "Uploading..." : "Add Attachment"}
                  </button>
                </div>
              </div>
            )}
            
            {attachments && attachments.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {(attachments as AttachmentWithUrl[]).map((att) => (
                  <div key={att._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText size={20} className="text-blue-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <a 
                          href={att.url || '#'} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 hover:text-blue-800 font-medium truncate block"
                        >
                          {att.fileName}
                        </a>
                        <p className="text-xs text-gray-500 mt-1">
                          {att.fileType} • {att.size ? (att.size / 1024).toFixed(1) + ' KB' : 'N/A'} • 
                          Uploaded by {att.uploadedByName} on {formatDateToDDMMYY(att._creationTime)}
                        </p>
                      </div>
                    </div>
                    {(userCanUploadAttachments || att.uploadedById === currentUser?._id) && (
                      <button
                        onClick={() => handleDeleteAttachment(att._id, att.fileName)}
                        className="ml-3 p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        title={att.uploadedById === currentUser?._id ? "Delete your attachment" : "Delete attachment (MOC Owner)"}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText size={48} className="mx-auto mb-3 text-gray-300" />
                <p>No attachments for this RFC.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Status Change Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Change RFC Status to "{newStatus.replace(/_/g, " ")}"
            </h3>
            <textarea
              value={statusChangeComments}
              onChange={(e) => setStatusChangeComments(e.target.value)}
              placeholder="Add comments (optional for some statuses, required for rejection)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
              rows={3}
            />
            {newStatus === "rejected" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Attach supporting documents (optional)
                </label>
                <input 
                  type="file" 
                  id="status-file-upload-input"
                  onChange={handleFileUpload} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                />
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowStatusModal(false)} 
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleStatusChange} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Action Modal */}
      {showDepartmentActionModal && departmentActionDeptId && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 no-print">
            <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">
                    {departmentAction === "approved" ? "Approve" : "Reject"} Department Step
                </h3>
                <textarea
                value={departmentActionComments}
                onChange={(e) => setDepartmentActionComments(e.target.value)}
                placeholder={`Comments for ${departmentAction} (optional for approval, recommended for rejection)`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
                rows={3}
                />
                {departmentAction === "rejected" && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Attach supporting documents (optional)
                    </label>
                    <input 
                      type="file" 
                      id="dept-file-upload-input"
                      onChange={handleFileUpload} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setShowDepartmentActionModal(false)} 
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDepartmentAction} 
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    departmentAction === "approved" 
                      ? "bg-green-600 text-white hover:bg-green-700" 
                      : "bg-red-600 text-white hover:bg-red-700"
                  }`}
                >
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
        currentUser={currentUser}
      />
    </div>
  );
}
