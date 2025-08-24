import React, { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'sonner';
import { FileSpreadsheet, Download } from 'lucide-react';

interface ExcelExportButtonProps {
  currentUser: any;
  className?: string;
}

export default function ExcelExportButton({ currentUser, className = '' }: ExcelExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const exportAction = useAction(api.excel.exportMocsToExcel);

  const handleExport = async () => {
    if (!currentUser?._id) {
      toast.error('User not authenticated');
      return;
    }

    setIsExporting(true);
    try {
      const result = await exportAction({
        requestingUserId: currentUser._id,
      });

      if (result.success && result.downloadUrl) {
        // Create a temporary link to download the file
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success(`Successfully exported ${result.recordCount} MOCs to Excel`);
      } else {
        toast.error('Export failed: No download URL received');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Failed to export MOCs: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`btn btn-outline-primary flex items-center gap-2 ${className}`}
    >
      {isExporting ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          Exporting...
        </>
      ) : (
        <>
          <FileSpreadsheet size={16} />
          Export to Excel
        </>
      )}
    </button>
  );
}
