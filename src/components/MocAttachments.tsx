import React from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id, Doc } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { FileText, Download, Trash2, Eye } from 'lucide-react';

interface MocAttachmentsProps {
  mocId: Id<"mocRequests">;
  currentUser?: any;
  showDeleteButton?: boolean;
}

type AttachmentWithUrl = Doc<"mocAttachments"> & { 
  url?: string | null; 
  uploadedByName?: string; 
  size?: number 
};

export default function MocAttachments({ mocId, currentUser, showDeleteButton = true }: MocAttachmentsProps) {
  const attachments = useQuery(api.moc.getMocAttachments, 
    currentUser?._id ? { 
      mocRequestId: mocId,
      requestingUserId: currentUser._id
    } : "skip"
  );
  
  const deleteAttachmentMutation = useMutation(api.attachments.deleteAttachment);

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

  const handleDownload = (attachment: AttachmentWithUrl) => {
    if (attachment.url) {
      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleView = (attachment: AttachmentWithUrl) => {
    if (attachment.url) {
      window.open(attachment.url, '_blank');
    }
  };

  if (!attachments || attachments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText size={48} className="mx-auto mb-4 text-gray-300" />
        <p>No attachments uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Attachments ({attachments.length})</h3>
      <div className="grid gap-3">
        {attachments.map((attachment) => (
          <div key={attachment._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <FileText size={24} className="text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{attachment.fileName}</p>
                <p className="text-xs text-gray-500">
                  Uploaded by {attachment.uploadedByName} • {attachment.fileType}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleView(attachment)}
                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                title="View file"
              >
                <Eye size={16} />
              </button>
              <button
                onClick={() => handleDownload(attachment)}
                className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                title="Download file"
              >
                <Download size={16} />
              </button>
              {showDeleteButton && (
                <button
                  onClick={() => handleDeleteAttachment(attachment._id, attachment.fileName)}
                  className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                  title="Delete file"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
