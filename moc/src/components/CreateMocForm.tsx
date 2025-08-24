import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  Save,
  Upload,
  X,
  FileText,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle,
  Info,
  HelpCircle,
  Plus,
  Settings,
  Shield,
  User,
  Building,
  Target,
  Eye,
  Clock,
  MapPin,
  Activity,
  Briefcase,
  BookOpen
} from 'lucide-react';

interface CreateMocFormProps {
  onSuccess: (mocId: Id<"mocRequests">) => void;
  currentUser: any;
  mocToEdit?: any;
}

// Arabic tooltips for form sections
const arabicTooltips = {
  title: "أدخل عنوان واضح ومختصر لطلب التغيير",
  description: "اكتب وصف مفصل للتغيير المطلوب وأسبابه",
  assignedTo: "اختر الشخص المسؤول عن تنفيذ هذا التغيير",
  requestedByDepartment: "حدد القسم الذي يطلب هذا التغيير",
  reasonForChange: "اشرح الأسباب التفصيلية وراء الحاجة لهذا التغيير",
  changeType: "حدد نوع التغيير المطلوب",
  changeCategory: "اختر فئة التغيير المناسبة",
  departmentsAffected: "حدد جميع الأقسام التي ستتأثر بهذا التغيير",
  riskAssessment: "هل يتطلب هذا التغيير تقييم مخاطر؟",
  impactAssessment: "اكتب تقييم تأثير التغيير على العمليات",
  hseImpactAssessment: "قيم تأثير التغيير على الصحة والسلامة والبيئة",
  riskEvaluation: "قدم تقييم شامل للمخاطر المحتملة",
  riskLevelPreMitigation: "حدد مستوى المخاطر قبل التخفيف",
  riskMatrixPreMitigation: "أدخل قيمة مصفوفة المخاطر قبل التخفيف",
  riskLevelPostMitigation: "حدد مستوى المخاطر بعد التخفيف",
  riskMatrixPostMitigation: "أدخل قيمة مصفوفة المخاطر بعد التخفيف",
  preChangeCondition: "اوصف الحالة الحالية قبل التغيير",
  postChangeCondition: "اوصف الحالة المتوقعة بعد التغيير",
  supportingDocuments: "أضف ملاحظات حول المستندات الداعمة",
  training: "هل يتطلب التغيير تدريب للموظفين؟",
  trainingDetails: "اكتب تفاصيل التدريب المطلوب",
  implementationDates: "حدد تواريخ التنفيذ المخطط لها",
  implementationOwner: "اكتب اسم المسؤول عن التنفيذ",
  verification: "اوصف كيفية التحقق من اكتمال التغيير",
  postImplementationReview: "اكتب خطة مراجعة ما بعد التنفيذ",
  closeoutApproval: "اذكر من سيوافق على إغلاق المشروع",
  technicalAuthorityApprovers: "اختر المراجعين التقنيين للموافقة النهائية (يجب أن يوافق جميعهم بعد موافقة الأقسام)",
  closeOutApprovers: "اختر الأشخاص المسؤولين عن الموافقة على إغلاق المشروع (مطلوب للانتقال من مكتمل إلى مغلق)",
  viewers: "اختر الأشخاص الذين يمكنهم عرض هذا الطلب"
};

// Tooltip component
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="group relative inline-block ml-2">
    <Info size={16} className="text-blue-500 cursor-help" />
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10 max-w-xs">
      <div className="break-words whitespace-normal">{text}</div>
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
    </div>
  </div>
);

export default function CreateMocForm({ onSuccess, currentUser, mocToEdit }: CreateMocFormProps) {
  const isEditing = !!mocToEdit;

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedToId: '',
    requestedByDepartment: '',
    reasonForChange: '',
    changeType: '',
    changeCategory: '',
    changeCategoryOther: '',
    departmentsAffected: [] as string[],
    riskAssessmentRequired: false,
    impactAssessment: '',
    hseImpactAssessment: '',
    riskEvaluation: '',
    riskLevelPreMitigation: '',
    riskMatrixPreMitigation: '',
    riskLevelPostMitigation: '',
    riskMatrixPostMitigation: '',
    preChangeCondition: '',
    postChangeCondition: '',
    supportingDocumentsNotes: '',
    trainingRequired: false,
    trainingDetails: '',
    startDateOfChange: '',
    expectedCompletionDate: '',
    deadline: '',
    implementationOwner: '',
    verificationOfCompletionText: '',
    postImplementationReviewText: '',
    closeoutApprovedByText: '',
    technicalAuthorityApproverUserIds: [] as string[],
    closeOutApproverUserIds: [] as string[],
    viewerIds: [] as string[],
  });

  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const users = useQuery(api.users.listApprovedUsers) || [];
  const departments = useQuery(api.departments.listDepartments) || [];

  // Mutations
  const createMocMutation = useMutation(api.moc.createMocRequest);
  const updateMocMutation = useMutation(api.moc.updateMocRequest);
  const generateUploadUrlMutation = useMutation(api.moc.generateUploadUrl);
  const addAttachmentMutation = useMutation(api.moc.addAttachment);

  // Users are already filtered to approved users by the query
  const approvedUsers = users;

  // Populate form when editing
  useEffect(() => {
    if (isEditing && mocToEdit) {
      setFormData({
        title: mocToEdit.title || '',
        description: mocToEdit.description || '',
        assignedToId: mocToEdit.assignedToId || '',
        requestedByDepartment: mocToEdit.requestedByDepartment || '',
        reasonForChange: mocToEdit.reasonForChange || '',
        changeType: mocToEdit.changeType || '',
        changeCategory: mocToEdit.changeCategory || '',
        changeCategoryOther: mocToEdit.changeCategoryOther || '',
        departmentsAffected: mocToEdit.departmentsAffected || [],
        riskAssessmentRequired: mocToEdit.riskAssessmentRequired || false,
        impactAssessment: mocToEdit.impactAssessment || '',
        hseImpactAssessment: mocToEdit.hseImpactAssessment || '',
        riskEvaluation: mocToEdit.riskEvaluation || '',
        riskLevelPreMitigation: mocToEdit.riskLevelPreMitigation || '',
        riskMatrixPreMitigation: mocToEdit.riskMatrixPreMitigation || '',
        riskLevelPostMitigation: mocToEdit.riskLevelPostMitigation || '',
        riskMatrixPostMitigation: mocToEdit.riskMatrixPostMitigation || '',
        preChangeCondition: mocToEdit.preChangeCondition || '',
        postChangeCondition: mocToEdit.postChangeCondition || '',
        supportingDocumentsNotes: mocToEdit.supportingDocumentsNotes || '',
        trainingRequired: mocToEdit.trainingRequired || false,
        trainingDetails: mocToEdit.trainingDetails || '',
        startDateOfChange: mocToEdit.startDateOfChange ? new Date(mocToEdit.startDateOfChange).toISOString().split('T')[0] : '',
        expectedCompletionDate: mocToEdit.expectedCompletionDate ? new Date(mocToEdit.expectedCompletionDate).toISOString().split('T')[0] : '',
        deadline: mocToEdit.deadline ? new Date(mocToEdit.deadline).toISOString().split('T')[0] : '',
        implementationOwner: mocToEdit.implementationOwner || '',
        verificationOfCompletionText: mocToEdit.verificationOfCompletionText || '',
        postImplementationReviewText: mocToEdit.postImplementationReviewText || '',
        closeoutApprovedByText: mocToEdit.closeoutApprovedByText || '',
        technicalAuthorityApproverUserIds: mocToEdit.technicalAuthorityApproverUserIds || [],
        closeOutApproverUserIds: mocToEdit.closeOutApproverUserIds || [],
        viewerIds: mocToEdit.viewerIds || [],
      });
    }
  }, [isEditing, mocToEdit]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleMultiSelectChange = (field: string, value: string) => {
    setFormData(prev => {
      const currentArray = prev[field as keyof typeof prev] as string[];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(item => item !== value)
        : [...currentArray, value];
      return { ...prev, [field]: newArray };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      
      // Validate file types and sizes
      const validFileTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif'
      ];
      
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      
      const validFiles = newFiles.filter(file => {
        if (!validFileTypes.includes(file.type)) {
          toast.error(`File type not supported: ${file.name}`);
          return false;
        }
        
        if (file.size > maxFileSize) {
          toast.error(`File too large: ${file.name} (max 10MB)`);
          return false;
        }
        
        return true;
      });
      
      setAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?._id) {
      toast.error('User not authenticated');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare the data
      const submitData: any = {
        title: formData.title,
        description: formData.description,
        reasonForChange: formData.reasonForChange || undefined,
        changeType: formData.changeType || undefined,
        changeCategory: formData.changeCategory || undefined,
        changeCategoryOther: formData.changeCategoryOther || undefined,
        assignedToId: formData.assignedToId ? formData.assignedToId as Id<"users"> : undefined,
        requestedByDepartment: formData.requestedByDepartment ? formData.requestedByDepartment as Id<"departments"> : undefined,
        departmentsAffected: formData.departmentsAffected.length > 0 ? formData.departmentsAffected.map(id => id as Id<"departments">) : undefined,
        riskAssessmentRequired: formData.riskAssessmentRequired,
        impactAssessment: formData.impactAssessment || undefined,
        hseImpactAssessment: formData.hseImpactAssessment || undefined,
        riskEvaluation: formData.riskEvaluation || undefined,
        riskLevelPreMitigation: formData.riskLevelPreMitigation || undefined,
        riskMatrixPreMitigation: formData.riskMatrixPreMitigation || undefined,
        riskLevelPostMitigation: formData.riskLevelPostMitigation || undefined,
        riskMatrixPostMitigation: formData.riskMatrixPostMitigation || undefined,
        startDateOfChange: formData.startDateOfChange ? new Date(formData.startDateOfChange).getTime() : undefined,
        expectedCompletionDate: formData.expectedCompletionDate ? new Date(formData.expectedCompletionDate).getTime() : undefined,
        deadline: formData.deadline ? new Date(formData.deadline).getTime() : undefined,
        preChangeCondition: formData.preChangeCondition || undefined,
        postChangeCondition: formData.postChangeCondition || undefined,
        supportingDocumentsNotes: formData.supportingDocumentsNotes || undefined,
        trainingRequired: formData.trainingRequired,
        trainingDetails: formData.trainingDetails || undefined,
        implementationOwner: formData.implementationOwner || undefined,
        verificationOfCompletionText: formData.verificationOfCompletionText || undefined,
        postImplementationReviewText: formData.postImplementationReviewText || undefined,
        closeoutApprovedByText: formData.closeoutApprovedByText || undefined,
        technicalAuthorityApproverUserIds: formData.technicalAuthorityApproverUserIds.length > 0 ? formData.technicalAuthorityApproverUserIds.map(id => id as Id<"users">) : undefined,
        closeOutApproverUserIds: formData.closeOutApproverUserIds.length > 0 ? formData.closeOutApproverUserIds.map(id => id as Id<"users">) : undefined,
        viewerIds: formData.viewerIds.length > 0 ? formData.viewerIds.map(id => id as Id<"users">) : undefined,
        requestingUserId: currentUser._id,
      };

      let mocId: Id<"mocRequests">;

      if (isEditing && mocToEdit) {
        await updateMocMutation({
          id: mocToEdit._id,
          ...submitData,
        });
        mocId = mocToEdit._id;
        toast.success('MOC updated successfully');
      } else {
        mocId = await createMocMutation(submitData);
        toast.success('MOC created successfully');
      }

      // Handle file uploads
      if (attachments.length > 0) {
        for (const file of attachments) {
          try {
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
          } catch (error) {
            console.error('File upload error:', error);
            toast.error(`Failed to upload ${file.name}`);
          }
        }
      }

      onSuccess(mocId);
    } catch (error) {
      console.error('Submit error:', error);
      toast.error(`Failed to ${isEditing ? 'update' : 'create'} MOC: ${(error as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText size={24} />
              {isEditing ? 'Edit RFC' : 'Create New RFC'}
            </h1>
            <p className="text-gray-600 mt-1">
              {isEditing ? 'Update the RFC details below' : 'Fill out the comprehensive form below to create a new Request for Change'}
            </p>
          </div>

      {isEditing && mocToEdit && (mocToEdit.status === 'pending_department_approval' || mocToEdit.status === 'pending_final_review') && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-amber-800">Editing During Approval Process</h3>
              <p className="text-sm text-amber-700 mt-1">
                This MOC is currently {mocToEdit.status === 'pending_department_approval' ? 'pending department approval' : 'pending final review'}.
                Making changes will reset the MOC to draft status and require re-approval from all departments.
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        {/* Basic Information */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                MOC Title *
                <InfoTooltip text={arabicTooltips.title} />
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm break-words"
                placeholder="Enter a clear and concise title for the MOC"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                Description *
                <InfoTooltip text={arabicTooltips.description} />
              </label>
              <textarea
                required
                rows={4}
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
                placeholder="Provide a detailed description of the change request"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                Assigned To
                <InfoTooltip text={arabicTooltips.assignedTo} />
              </label>
              <select
                value={formData.assignedToId}
                onChange={(e) => handleInputChange('assignedToId', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
              >
                <option value="">Select assignee</option>
                {approvedUsers.map(user => (
                  <option key={user._id} value={user._id}>
                    <span className="truncate">{user.name || user.email}</span>
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                Requesting Department
                <InfoTooltip text={arabicTooltips.requestedByDepartment} />
              </label>
              <select
                value={formData.requestedByDepartment}
                onChange={(e) => handleInputChange('requestedByDepartment', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
              >
                <option value="">Select department</option>
                {departments.map(dept => (
                  <option key={dept._id} value={dept._id}>
                    <span className="truncate">{dept.name}</span>
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Change Details */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Change Details
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              Reason for Change
              <InfoTooltip text={arabicTooltips.reasonForChange} />
            </label>
            <textarea
              rows={3}
              value={formData.reasonForChange}
              onChange={(e) => handleInputChange('reasonForChange', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
              placeholder="Explain the detailed reasons behind the need for this change"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Change Type
            </label>
            <select
              value={formData.changeType}
              onChange={(e) => handleInputChange('changeType', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
            >
              <option value="">Select change type</option>
              <option value="temporary">Temporary</option>
              <option value="permanent">Permanent</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Change Category
            </label>
            <select
              value={formData.changeCategory}
              onChange={(e) => handleInputChange('changeCategory', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
            >
              <option value="">Select change category</option>
              <option value="process">Process</option>
              <option value="equipment">Equipment</option>
              <option value="personnel">Personnel</option>
              <option value="material">Material</option>
              <option value="environment">Environment</option>
              <option value="other">Other</option>
            </select>
          </div>

          {formData.changeCategory === 'other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Other Category Details
              </label>
              <input
                type="text"
                value={formData.changeCategoryOther}
                onChange={(e) => handleInputChange('changeCategoryOther', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
                placeholder="Please specify the other category"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Departments Affected
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border border-gray-300 rounded-lg shadow-sm max-h-48 overflow-y-auto">
              {departments.map(dept => (
                <label key={dept._id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.departmentsAffected.includes(dept._id)}
                    onChange={() => handleMultiSelectChange('departmentsAffected', dept._id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate">{dept.name}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Risk Assessment */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Risk & Impact Assessment
          </h2>

          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.riskAssessmentRequired}
                onChange={(e) => handleInputChange('riskAssessmentRequired', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700 flex items-center">
                Risk Assessment Required
                <InfoTooltip text={arabicTooltips.riskAssessment} />
              </span>
            </label>
          </div>

          {formData.riskAssessmentRequired && (
            <div className="space-y-6 pl-6 border-l-4 border-blue-200 bg-blue-50 p-4 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  Impact Assessment
                  <InfoTooltip text={arabicTooltips.impactAssessment} />
                </label>
                <textarea
                  rows={3}
                  value={formData.impactAssessment}
                  onChange={(e) => handleInputChange('impactAssessment', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
                  placeholder="Describe the impact of this change on operations"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  HSE Impact Assessment
                  <InfoTooltip text={arabicTooltips.hseImpactAssessment} />
                </label>
                <textarea
                  rows={3}
                  value={formData.hseImpactAssessment}
                  onChange={(e) => handleInputChange('hseImpactAssessment', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
                  placeholder="Assess the impact on Health, Safety, and Environment"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  Risk Evaluation
                  <InfoTooltip text={arabicTooltips.riskEvaluation} />
                </label>
                <textarea
                  rows={3}
                  value={formData.riskEvaluation}
                  onChange={(e) => handleInputChange('riskEvaluation', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
                  placeholder="Provide a comprehensive evaluation of potential risks"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Risk Level (Pre-Mitigation)
                    <InfoTooltip text={arabicTooltips.riskLevelPreMitigation} />
                  </label>
                  <select
                    value={formData.riskLevelPreMitigation}
                    onChange={(e) => handleInputChange('riskLevelPreMitigation', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
                  >
                    <option value="">Select risk level</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Risk Matrix (Pre-Mitigation)
                    <InfoTooltip text={arabicTooltips.riskMatrixPreMitigation} />
                  </label>
                  <input
                    type="text"
                    value={formData.riskMatrixPreMitigation}
                    onChange={(e) => handleInputChange('riskMatrixPreMitigation', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
                    placeholder="Enter risk matrix value (e.g., A1, B2, C3)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Risk Level (Post-Mitigation)
                    <InfoTooltip text={arabicTooltips.riskLevelPostMitigation} />
                  </label>
                  <select
                    value={formData.riskLevelPostMitigation}
                    onChange={(e) => handleInputChange('riskLevelPostMitigation', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
                  >
                    <option value="">Select risk level</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Risk Matrix (Post-Mitigation)
                    <InfoTooltip text={arabicTooltips.riskMatrixPostMitigation} />
                  </label>
                  <input
                    type="text"
                    value={formData.riskMatrixPostMitigation}
                    onChange={(e) => handleInputChange('riskMatrixPostMitigation', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
                    placeholder="Enter risk matrix value (e.g., A1, B2, C3)"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Implementation Details */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Implementation Details
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              Pre-Change Condition
              <InfoTooltip text={arabicTooltips.preChangeCondition} />
            </label>
            <textarea
              rows={3}
              value={formData.preChangeCondition}
              onChange={(e) => handleInputChange('preChangeCondition', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
              placeholder="Describe the current state before the change"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              Post-Change Condition
              <InfoTooltip text={arabicTooltips.postChangeCondition} />
            </label>
            <textarea
              rows={3}
              value={formData.postChangeCondition}
              onChange={(e) => handleInputChange('postChangeCondition', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
              placeholder="Describe the expected state after the change"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              Supporting Documents Notes
              <InfoTooltip text={arabicTooltips.supportingDocuments} />
            </label>
            <textarea
              rows={3}
              value={formData.supportingDocumentsNotes}
              onChange={(e) => handleInputChange('supportingDocumentsNotes', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
              placeholder="Add notes about supporting documents"
            />
          </div>

          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.trainingRequired}
                onChange={(e) => handleInputChange('trainingRequired', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700 flex items-center">
                Training Required
                <InfoTooltip text={arabicTooltips.training} />
              </span>
            </label>
          </div>

          {formData.trainingRequired && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                Training Details
                <InfoTooltip text={arabicTooltips.trainingDetails} />
              </label>
              <textarea
                rows={3}
                value={formData.trainingDetails}
                onChange={(e) => handleInputChange('trainingDetails', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
                placeholder="Describe the training requirements in detail"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date of Change
            </label>
            <input
              type="date"
              value={formData.startDateOfChange}
              onChange={(e) => handleInputChange('startDateOfChange', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expected Completion Date
            </label>
            <input
              type="date"
              value={formData.expectedCompletionDate}
              onChange={(e) => handleInputChange('expectedCompletionDate', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Deadline
            </label>
            <input
              type="date"
              value={formData.deadline}
              onChange={(e) => handleInputChange('deadline', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Implementation Owner
            </label>
            <input
              type="text"
              value={formData.implementationOwner}
              onChange={(e) => handleInputChange('implementationOwner', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
              placeholder="Name of the person responsible for implementation"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification of Completion
            </label>
            <textarea
              rows={3}
              value={formData.verificationOfCompletionText}
              onChange={(e) => handleInputChange('verificationOfCompletionText', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
              placeholder="Describe how completion will be verified"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Post-Implementation Review
            </label>
            <textarea
              rows={3}
              value={formData.postImplementationReviewText}
              onChange={(e) => handleInputChange('postImplementationReviewText', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical shadow-sm break-words"
              placeholder="Describe the post-implementation review plan"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Closeout Approved By
            </label>
            <input
              type="text"
              value={formData.closeoutApprovedByText}
              onChange={(e) => handleInputChange('closeoutApprovedByText', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm"
              placeholder="Who will approve the project closeout"
            />
          </div>
        </section>

        {/* Access Control */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Access Control
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              Technical Authority Approvers (Final Review)
              <InfoTooltip text={arabicTooltips.technicalAuthorityApprovers} />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border border-gray-300 rounded-lg shadow-sm max-h-48 overflow-y-auto">
              {approvedUsers.map(user => (
                <label key={user._id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.technicalAuthorityApproverUserIds.includes(user._id)}
                    onChange={() => handleMultiSelectChange('technicalAuthorityApproverUserIds', user._id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate">{user.name || user.email}</span>
                </label>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-1 break-words">
              All selected Technical Authority Approvers must approve after department approvals for the MOC to be approved. If no Technical Authority Approvers are selected, the MOC will be approved directly after department approvals.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              Close Out Approvers
              <InfoTooltip text={arabicTooltips.closeOutApprovers} />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border border-gray-300 rounded-lg shadow-sm max-h-48 overflow-y-auto">
              {approvedUsers.map(user => (
                <label key={user._id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.closeOutApproverUserIds.includes(user._id)}
                    onChange={() => handleMultiSelectChange('closeOutApproverUserIds', user._id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate">{user.name || user.email}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              Viewers
              <InfoTooltip text={arabicTooltips.viewers} />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border border-gray-300 rounded-lg shadow-sm max-h-48 overflow-y-auto">
              {approvedUsers.map(user => (
                <label key={user._id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.viewerIds.includes(user._id)}
                    onChange={() => handleMultiSelectChange('viewerIds', user._id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate">{user.name || user.email}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Attachments */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Attachments
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                Upload Supporting Documents
                <InfoTooltip text="أضف المستندات والملفات الداعمة لطلب التغيير" />
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif"
                />
                <button
                  type="button"
                  onClick={() => document.querySelector('input[type="file"]')?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                >
                  <Upload size={16} />
                  Browse Files
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, JPEG, PNG, GIF (Max 10MB per file)
              </p>
            </div>

            {/* File List */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">Selected Files:</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <FileText size={20} className="text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Remove file"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Submit Button */}
        <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                <Save size={16} />
                {isEditing ? 'Update RFC' : 'Create RFC'}
              </>
            )}
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>
  );
}
