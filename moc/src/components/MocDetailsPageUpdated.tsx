import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Edit,
  FileText,
  Calendar,
  User,
  Building,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  Download,
  Upload,
  MessageSquare,
  History,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  CheckSquare,
  XCircle,
  Eye,
  EyeOff,
  Shield,
  Users,
  Target,
  Activity,
  Settings,
  Info,
  MapPin,
  Briefcase,
  BookOpen,
  FileDown,
  Printer
} from 'lucide-react';
import CreateMocForm from './CreateMocForm';
import EditHistoryModal from './EditHistoryModal';

interface MocDetailsPageProps {
  mocId: Id<"mocRequests">;
  onBack: () => void;
  currentUser: any;
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  pending_department_approval: 'bg-yellow-100 text-yellow-800',
  pending_final_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  in_progress: 'bg-purple-100 text-purple-800',
  pending_closeout: 'bg-orange-100 text-orange-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const statusIcons = {
  draft: FileText,
  pending_department_approval: Clock,
  pending_final_review: Eye,
  approved: CheckCircle,
  rejected: XCircle,
  in_progress: Play,
  pending_closeout: Shield,
  completed: CheckSquare,
  cancelled: X,
};

export default function MocDetailsPageUpdated({ mocId, onBack, currentUser }: MocDetailsPageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [statusChangeComment, setStatusChangeComment] = useState('');
  const [showStatusChangeModal, setShowStatusChangeModal] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showCloseoutModal, setShowCloseoutModal] = useState(false);
  const [closeoutAction, setCloseoutAction] = useState<'approved' | 'rejected' | null>(null);

  // Queries
  const mocDetails = useQuery(api.moc.getRequestDetails, { 
    id: mocId, 
    requestingUserId: currentUser?._id 
  });
  const editHistory = useQuery(api.moc.getEditLogsSummary, { 
    mocRequestId: mocId, 
    requestingUserId: currentUser?._id 
  });

  // Mutations
  const changeStatusMutation = useMutation(api.moc.changeStatus);
  const deleteMocMutation = useMutation(api.moc.deleteMocRequest);
  const resubmitMocMutation = useMutation(api.moc.resubmitMocRequest);
  const approveOrRejectDepartmentMutation = useMutation(api.moc.approveOrRejectDepartmentStep);
  const approveCloseoutMutation = useMutation(api.moc.approveCloseout);
  const generateUploadUrlMutation = useMutation(api.moc.generateUploadUrl);
  const addAttachmentMutation = useMutation(api.moc.addAttachment);

  if (!mocDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <CreateMocForm
        onSuccess={() => {
          setIsEditing(false);
          toast.success('MOC updated successfully');
        }}
        currentUser={currentUser}
        mocToEdit={mocDetails}
      />
    );
  }

  const StatusIcon = statusIcons[mocDetails.status as keyof typeof statusIcons];

  // Permission checks
  const isSubmitter = mocDetails.submitterId === currentUser?._id;
  const isAssigned = mocDetails.assignedToId === currentUser?._id;
  const isTechApprover = mocDetails.technicalAuthorityApproverUserIds?.includes(currentUser?._id);
  const isCloseoutApprover = mocDetails.closeOutApproverUserIds?.includes(currentUser?._id);
  const isAdmin = currentUser?.isAdmin;

  // Enhanced edit permission check - disable editing for completed MOCs unless closeout approver
  const canEdit = (isAdmin || isSubmitter || isAssigned || isTechApprover) && 
    (mocDetails.status !== 'completed' || isCloseoutApprover || isAdmin);

  const canDelete = (isAdmin || 
    currentUser?.canDeleteAnyMoc || 
    (isSubmitter && ['draft', 'rejected', 'cancelled'].includes(mocDetails.status))) &&
    (mocDetails.status !== 'completed' || isCloseoutApprover || isAdmin);

  const canChangeStatus = (newStatus: string) => {
    if (isAdmin) return true;
    
    const currentStatus = mocDetails.status;
    
    // Submitter permissions
    if (isSubmitter) {
      if (currentStatus === 'draft' && newStatus === 'pending_department_approval') return true;
      if (['pending_department_approval', 'pending_final_review', 'approved', 'rejected'].includes(currentStatus) && newStatus === 'cancelled') return true;
    }
    
    // Assigned user permissions
    if (isAssigned) {
      if (currentStatus === 'approved' && newStatus === 'in_progress') return true;
      if (currentStatus === 'in_progress' && newStatus === 'pending_closeout') return true;
    }
    
    // Technical approver permissions
    if (isTechApprover && currentStatus === 'pending_final_review' && ['approved', 'rejected'].includes(newStatus)) {
      return true;
    }
    
    return false;
  };

  const handleStatusChange = async (newStatus: string) => {
    if (['approved', 'rejected'].includes(newStatus) && !statusChangeComment.trim()) {
      toast.error('Please provide comments for approval/rejection');
      return;
    }

    try {
      await changeStatusMutation({
        id: mocId,
        newStatus,
        comments: statusChangeComment.trim() || undefined,
        requestingUserId: currentUser._id,
      });
      
      toast.success(`MOC status changed to ${newStatus}`);
      setShowStatusChangeModal(false);
      setStatusChangeComment('');
      setPendingStatusChange(null);
    } catch (error) {
      toast.error(`Failed to change status: ${(error as Error).message}`);
    }
  };

  const handleCloseoutApproval = async () => {
    if (!closeoutAction) return;
    
    if (closeoutAction === 'rejected' && !statusChangeComment.trim()) {
      toast.error('Please provide comments for rejection');
      return;
    }

    try {
      await approveCloseoutMutation({
        mocRequestId: mocId,
        action: closeoutAction,
        comments: statusChangeComment.trim() || undefined,
        requestingUserId: currentUser._id,
      });
      
      toast.success(`Closeout ${closeoutAction} successfully`);
      setShowCloseoutModal(false);
      setCloseoutAction(null);
      setStatusChangeComment('');
    } catch (error) {
      toast.error(`Failed to ${closeoutAction} closeout: ${(error as Error).message}`);
    }
  };

  const handleDepartmentApproval = async (departmentId: Id<"departments">, action: 'approved' | 'rejected') => {
    if (action === 'rejected' && !statusChangeComment.trim()) {
      toast.error('Please provide comments for rejection');
      return;
    }

    try {
      await approveOrRejectDepartmentMutation({
        mocRequestId: mocId,
        departmentId,
        action,
        comments: statusChangeComment.trim() || undefined,
        requestingUserId: currentUser._id,
      });
      
      toast.success(`Department ${action} successfully`);
      setStatusChangeComment('');
    } catch (error) {
      toast.error(`Failed to ${action}: ${(error as Error).message}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this MOC? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteMocMutation({
        id: mocId,
        requestingUserId: currentUser._id,
      });
      toast.success('MOC deleted successfully');
      onBack();
    } catch (error) {
      toast.error(`Failed to delete MOC: ${(error as Error).message}`);
    }
  };

  const handleResubmit = async () => {
    try {
      await resubmitMocMutation({
        id: mocId,
        requestingUserId: currentUser._id,
      });
      toast.success('MOC resubmitted successfully');
    } catch (error) {
      toast.error(`Failed to resubmit MOC: ${(error as Error).message}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    
    const files = Array.from(e.target.files);
    setIsUploading(true);

    try {
      for (const file of files) {
        const uploadUrl = await generateUploadUrlMutation({ requestingUserId: currentUser._id });
        const result = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = await result.json();
        await addAttachmentMutation({
          mocRequestId: mocId,
          storageId,
          fileName: file.name,
          fileType: file.type,
          requestingUserId: currentUser._id,
        });
      }
      toast.success('Files uploaded successfully');
    } catch (error) {
      toast.error(`Failed to upload files: ${(error as Error).message}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handlePrint = () => {
    window.print();
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getAvailableStatusTransitions = () => {
    const currentStatus = mocDetails.status;
    const transitions = [];

    if (canChangeStatus('pending_department_approval') && currentStatus === 'draft') {
      transitions.push({ status: 'pending_department_approval', label: 'Submit for Approval', icon: Upload });
    }
    if (canChangeStatus('in_progress') && currentStatus === 'approved') {
      transitions.push({ status: 'in_progress', label: 'Start Implementation', icon: Play });
    }
    if (canChangeStatus('pending_closeout') && currentStatus === 'in_progress') {
      transitions.push({ status: 'pending_closeout', label: 'Mark as Complete', icon: Shield });
    }
    if (canChangeStatus('cancelled')) {
      transitions.push({ status: 'cancelled', label: 'Cancel MOC', icon: X });
    }

    return transitions;
  };

  const getBadgeText = () => {
    if (mocDetails.status === 'in_progress' || mocDetails.status === 'pending_closeout' || mocDetails.status === 'completed') {
      return 'MOC';
    }
    return 'RFC';
  };

  const getBadgeColor = () => {
    if (mocDetails.status === 'in_progress' || mocDetails.status === 'pending_closeout' || mocDetails.status === 'completed') {
      return 'bg-blue-100 text-blue-800';
    }
    return 'bg-orange-100 text-orange-800';
  };

  // Get access control assignees with proper display
  const getAccessControlAssignees = () => {
    const assignees = [];
    
    if (mocDetails.assignedToName && mocDetails.assignedToName !== 'N/A') {
      assignees.push({ role: 'Assigned To', name: mocDetails.assignedToName });
    }
    
    if (mocDetails.technicalAuthorityApproverNames && mocDetails.technicalAuthorityApproverNames.length > 0) {
      assignees.push({ 
        role: 'Technical Authority Approvers', 
        name: mocDetails.technicalAuthorityApproverNames.join(', ') 
      });
    }
    
    if (mocDetails.closeOutApproverNames && mocDetails.closeOutApproverNames.length > 0) {
      assignees.push({ 
        role: 'Closeout Approvers', 
        name: mocDetails.closeOutApproverNames.join(', ') 
      });
    }
    
    if (mocDetails.viewerNames && mocDetails.viewerNames.length > 0) {
      assignees.push({ 
        role: 'Viewers', 
        name: mocDetails.viewerNames.join(', ') 
      });
    }
    
    if (mocDetails.requestedByDepartmentName && mocDetails.requestedByDepartmentName !== 'N/A') {
      assignees.push({ 
        role: 'Requested By Department', 
        name: mocDetails.requestedByDepartmentName 
      });
    }
    
    return assignees;
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-blue-500 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold">{mocDetails.mocIdString}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getBadgeColor()}`}>
                  {getBadgeText()}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[mocDetails.status as keyof typeof statusColors]}`}>
                  <StatusIcon size={16} className="inline mr-1" />
                  {mocDetails.status.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <h2 className="text-lg mt-1 opacity-90">{mocDetails.title}</h2>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="btn btn-secondary btn-sm flex items-center gap-2"
            >
              <Printer size={16} />
              Print
            </button>
            <button
              onClick={handleExportWord}
              className="btn btn-secondary btn-sm flex items-center gap-2"
            >
              <FileDown size={16} />
              Export Word
            </button>
            {canEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className="btn btn-primary btn-sm flex items-center gap-2"
              >
                <Edit size={16} />
                Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="btn btn-danger btn-sm flex items-center gap-2"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-b bg-gray-50">
        <div className="flex flex-wrap gap-3">
          {/* Status Change Buttons */}
          {getAvailableStatusTransitions().map((transition) => {
            const Icon = transition.icon;
            return (
              <button
                key={transition.status}
                onClick={() => {
                  setPendingStatusChange(transition.status);
                  setShowStatusChangeModal(true);
                }}
                className="btn btn-primary flex items-center gap-2"
              >
                <Icon size={16} />
                {transition.label}
              </button>
            );
          })}

          {/* Department Approval Buttons */}
          {mocDetails.status === 'pending_department_approval' && mocDetails.departmentApprovals?.map((approval) => {
            if (approval.status === 'pending') {
              const canApproveDept = isAdmin || currentUser?._id === approval.approverId;
              if (canApproveDept) {
                return (
                  <div key={approval.departmentId} className="flex gap-2">
                    <button
                      onClick={() => handleDepartmentApproval(approval.departmentId, 'approved')}
                      className="btn btn-success flex items-center gap-2"
                    >
                      <CheckCircle size={16} />
                      Approve ({approval.departmentName})
                    </button>
                    <button
                      onClick={() => {
                        setStatusChangeComment('');
                        handleDepartmentApproval(approval.departmentId, 'rejected');
                      }}
                      className="btn btn-danger flex items-center gap-2"
                    >
                      <XCircle size={16} />
                      Reject ({approval.departmentName})
                    </button>
                  </div>
                );
              }
            }
            return null;
          })}

          {/* Technical Authority Approval Buttons */}
          {mocDetails.status === 'pending_final_review' && isTechApprover && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPendingStatusChange('approved');
                  setShowStatusChangeModal(true);
                }}
                className="btn btn-success flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Approve
              </button>
              <button
                onClick={() => {
                  setPendingStatusChange('rejected');
                  setShowStatusChangeModal(true);
                }}
                className="btn btn-danger flex items-center gap-2"
              >
                <XCircle size={16} />
                Reject
              </button>
            </div>
          )}

          {/* Closeout Approval Buttons */}
          {mocDetails.status === 'pending_closeout' && isCloseoutApprover && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCloseoutAction('approved');
                  setShowCloseoutModal(true);
                }}
                className="btn btn-success flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Approve Closeout
              </button>
              <button
                onClick={() => {
                  setCloseoutAction('rejected');
                  setShowCloseoutModal(true);
                }}
                className="btn btn-danger flex items-center gap-2"
              >
                <XCircle size={16} />
                Reject Closeout
              </button>
            </div>
          )}

          {/* Resubmit Button */}
          {mocDetails.status === 'rejected' && isSubmitter && (
            <button
              onClick={handleResubmit}
              className="btn btn-primary flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Resubmit
            </button>
          )}

          {/* Edit History Button */}
          <button
            onClick={() => setShowEditHistory(true)}
            className="btn btn-outline-secondary flex items-center gap-2"
          >
            <History size={16} />
            Edit History
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-8">
        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Info size={20} className="text-blue-600" />
              Basic Information
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Submitter</label>
                <p className="text-gray-900">{mocDetails.submitterName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Date Raised</label>
                <p className="text-gray-900">{formatDate(mocDetails.dateRaised)}</p>
              </div>
              {mocDetails.submittedAt && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Date Submitted</label>
                  <p className="text-gray-900">{formatDate(mocDetails.submittedAt)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users size={20} className="text-green-600" />
              Access Control
            </h3>
            <div className="space-y-3">
              {getAccessControlAssignees().length > 0 ? (
                getAccessControlAssignees().map((assignee, index) => (
                  <div key={index}>
                    <label className="text-sm font-medium text-gray-500">{assignee.role}</label>
                    <p className="text-gray-900 text-sm leading-relaxed">{assignee.name}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No specific access control assigned</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar size={20} className="text-purple-600" />
              Timeline
            </h3>
            <div className="space-y-3">
              {mocDetails.startDateOfChange && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Start Date</label>
                  <p className="text-gray-900">{formatDate(mocDetails.startDateOfChange)}</p>
                </div>
              )}
              {mocDetails.expectedCompletionDate && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Expected Completion</label>
                  <p className="text-gray-900">{formatDate(mocDetails.expectedCompletionDate)}</p>
                </div>
              )}
              {mocDetails.deadline && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Deadline</label>
                  <p className="text-gray-900">{formatDate(mocDetails.deadline)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            Description
          </h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-gray-700 whitespace-pre-wrap">{mocDetails.description}</p>
          </div>
        </div>

        {/* Change Details */}
        {(mocDetails.reasonForChange || mocDetails.changeType || mocDetails.changeCategory) && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings size={20} className="text-orange-600" />
              Change Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mocDetails.reasonForChange && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Reason for Change</label>
                  <p className="text-gray-900 mt-1">{mocDetails.reasonForChange}</p>
                </div>
              )}
              {mocDetails.changeType && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Change Type</label>
                  <p className="text-gray-900 mt-1 capitalize">{mocDetails.changeType}</p>
                </div>
              )}
              {mocDetails.changeCategory && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Change Category</label>
                  <p className="text-gray-900 mt-1">{mocDetails.changeCategory}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Risk Assessment */}
        {mocDetails.riskAssessmentRequired && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-600" />
              Risk Assessment
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mocDetails.impactAssessment && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Impact Assessment</label>
                  <div className="bg-gray-50 p-3 rounded-lg mt-1">
                    <p className="text-gray-700 whitespace-pre-wrap">{mocDetails.impactAssessment}</p>
                  </div>
                </div>
              )}
              {mocDetails.hseImpactAssessment && (
                <div>
                  <label className="text-sm font-medium text-gray-500">HSE Impact Assessment</label>
                  <div className="bg-gray-50 p-3 rounded-lg mt-1">
                    <p className="text-gray-700 whitespace-pre-wrap">{mocDetails.hseImpactAssessment}</p>
                  </div>
                </div>
              )}
              {mocDetails.riskEvaluation && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Risk Evaluation</label>
                  <div className="bg-gray-50 p-3 rounded-lg mt-1">
                    <p className="text-gray-700 whitespace-pre-wrap">{mocDetails.riskEvaluation}</p>
                  </div>
                </div>
              )}
              {mocDetails.riskLevelPreMitigation && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Risk Level (Pre-Mitigation)</label>
                  <p className="text-gray-900 mt-1 capitalize">{mocDetails.riskLevelPreMitigation}</p>
                </div>
              )}
              {mocDetails.riskMatrixPreMitigation && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Risk Matrix (Pre-Mitigation)</label>
                  <p className="text-gray-900 mt-1">{mocDetails.riskMatrixPreMitigation}</p>
                </div>
              )}
              {mocDetails.riskLevelPostMitigation && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Risk Level (Post-Mitigation)</label>
                  <p className="text-gray-900 mt-1 capitalize">{mocDetails.riskLevelPostMitigation}</p>
                </div>
              )}
              {mocDetails.riskMatrixPostMitigation && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Risk Matrix (Post-Mitigation)</label>
                  <p className="text-gray-900 mt-1">{mocDetails.riskMatrixPostMitigation}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Implementation Details */}
        {(mocDetails.preChangeCondition || mocDetails.postChangeCondition || mocDetails.implementationOwner) && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Target size={20} className="text-green-600" />
              Implementation Details
            </h3>
            <div className="space-y-4">
              {mocDetails.preChangeCondition && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Pre-Change Condition</label>
                  <div className="bg-gray-50 p-3 rounded-lg mt-1">
                    <p className="text-gray-700 whitespace-pre-wrap">{mocDetails.preChangeCondition}</p>
                  </div>
                </div>
              )}
              {mocDetails.postChangeCondition && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Post-Change Condition</label>
                  <div className="bg-gray-50 p-3 rounded-lg mt-1">
                    <p className="text-gray-700 whitespace-pre-wrap">{mocDetails.postChangeCondition}</p>
                  </div>
                </div>
              )}
              {mocDetails.implementationOwner && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Implementation Owner</label>
                  <p className="text-gray-900 mt-1">{mocDetails.implementationOwner}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Review Comments */}
        {mocDetails.reviewComments && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare size={20} className="text-blue-600" />
              Review Comments
            </h3>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg shadow-sm">
              <div className="mb-3">
                <p className="text-base font-semibold text-gray-900">{mocDetails.reviewerName}</p>
                <p className="text-sm font-medium text-gray-600">
                  {mocDetails.reviewedAt ? formatDate(mocDetails.reviewedAt) : 'N/A'}
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <p className="text-gray-800 text-base leading-relaxed whitespace-pre-wrap font-medium">
                  {mocDetails.reviewComments}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Department Approvals */}
        {mocDetails.departmentApprovals && mocDetails.departmentApprovals.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building size={20} className="text-blue-600" />
              Department Approvals
            </h3>
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
                  {mocDetails.departmentApprovals.map((approval, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {approval.departmentName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          approval.status === 'approved' ? 'bg-green-100 text-green-800' :
                          approval.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {approval.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {approval.approverDisplayName || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {approval.approvedAt ? formatDate(approval.approvedAt) : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {approval.comments || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attachments */}
        {mocDetails.attachments && mocDetails.attachments.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Download size={20} className="text-purple-600" />
              Attachments
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mocDetails.attachments.map((attachment) => (
                <div key={attachment._id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{attachment.fileName}</p>
                      <p className="text-xs text-gray-500">Uploaded by {attachment.uploadedByName}</p>
                    </div>
                    {attachment.url && (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        <Download size={16} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


      </div>

      {/* Status Change Modal */}
      {showStatusChangeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Change Status to {pendingStatusChange?.replace(/_/g, ' ').toUpperCase()}
            </h3>
            <textarea
              value={statusChangeComment}
              onChange={(e) => setStatusChangeComment(e.target.value)}
              placeholder="Add comments (required for approval/rejection)..."
              className="w-full p-3 border rounded-lg resize-none"
              rows={4}
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowStatusChangeModal(false);
                  setPendingStatusChange(null);
                  setStatusChangeComment('');
                }}
                className="btn btn-outline-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusChange(pendingStatusChange!)}
                className="btn btn-primary"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Closeout Modal */}
      {showCloseoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {closeoutAction === 'approved' ? 'Approve Closeout' : 'Reject Closeout'}
            </h3>
            <textarea
              value={statusChangeComment}
              onChange={(e) => setStatusChangeComment(e.target.value)}
              placeholder={closeoutAction === 'rejected' ? 'Please provide reason for rejection...' : 'Add comments (optional)...'}
              className="w-full p-3 border rounded-lg resize-none"
              rows={4}
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowCloseoutModal(false);
                  setCloseoutAction(null);
                  setStatusChangeComment('');
                }}
                className="btn btn-outline-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseoutApproval}
                className={`btn ${closeoutAction === 'approved' ? 'btn-success' : 'btn-danger'}`}
              >
                {closeoutAction === 'approved' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit History Modal */}
      {showEditHistory && (
        <EditHistoryModal
          mocRequestId={mocId}
          isOpen={showEditHistory}
          onClose={() => setShowEditHistory(false)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
